import { Injectable } from '@nestjs/common';
import { InboxMessage } from '../../domain/inbox/index.js';
import {
  DomainError,
  IdempotencyConflictError,
  InvalidTransactionStateError,
} from '../../domain/errors/index.js';
import type {
  ProcessInboundWagerMessageInput,
  ProcessInboundWagerMessageResult,
  WagerTransactionRequestedMessage,
} from '../dtos/messaging.dtos.js';
import type { ProcessWagerTransactionCommand } from '../dtos/finance.dtos.js';
import { computePayloadHash } from '../utils/payload-hash.js';
import { FinanceGateway } from '../../infrastructure/persistence/gateways/finance.gateway.js';
import { MessagingGateway } from '../../infrastructure/persistence/gateways/messaging.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';
import { ProcessWagerTransactionService } from '../services/process-wager-transaction.service.js';

@Injectable()
export class ProcessInboundWagerMessageUseCase {
  private readonly service = new ProcessWagerTransactionService();

  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  async execute(input: ProcessInboundWagerMessageInput): Promise<ProcessInboundWagerMessageResult> {
    const payloadHash = computePayloadHash(input.message as unknown as Record<string, unknown>);
    const inbox = InboxMessage.receive({
      messageId: input.message.messageId,
      consumerName: input.consumerName,
      payloadHash,
    });

    try {
      return await this.unitOfWork.transactional(async (em) => {
        const messagingGateway = new MessagingGateway(em);
        const financeGateway = new FinanceGateway(em);
        const now = new Date();

        const inboxState = await messagingGateway.insertInboxOrGet(inbox);
        if (inboxState.status === 'already_processed') {
          return {
            disposition: 'ack',
            duplicate: true,
          };
        }

        const command = toCommand(input.message);
        const result = await this.service.execute(financeGateway, command, now);

        inboxState.message.markProcessed(now);
        await messagingGateway.updateInbox(inboxState.message);

        return {
          disposition: 'ack',
          duplicate: false,
          transaction: {
            transactionId: result.transactionId,
            status: result.status,
            idempotentReplay: result.idempotentReplay,
          },
        };
      });
    } catch (error) {
      return classifyError(error);
    }
  }
}

export function parseWagerTransactionMessage(body: string): WagerTransactionRequestedMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new InvalidMessageError('Invalid JSON body');
  }

  if (!isWagerTransactionRequestedMessage(parsed)) {
    throw new InvalidMessageError('Invalid WagerTransactionRequested payload');
  }

  return parsed;
}

export class InvalidMessageError extends DomainError {}

function toCommand(message: WagerTransactionRequestedMessage): ProcessWagerTransactionCommand {
  return {
    providerId: message.data.providerId,
    externalTransactionId: message.data.externalTransactionId,
    idempotencyKey: message.data.idempotencyKey,
    playerId: message.data.playerId,
    walletId: message.data.walletId,
    roundId: message.data.roundId,
    gameId: message.data.gameId,
    kind: message.data.kind,
    money: message.data.money,
    referenceExternalTransactionId: message.data.referenceExternalTransactionId,
    correlationId: message.messageId,
  };
}

function isWagerTransactionRequestedMessage(
  value: unknown,
): value is WagerTransactionRequestedMessage {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<WagerTransactionRequestedMessage>;
  return (
    typeof candidate.messageId === 'string' &&
    candidate.type === 'WagerTransactionRequested' &&
    typeof candidate.occurredAt === 'string' &&
    typeof candidate.data === 'object' &&
    candidate.data !== null
  );
}

function classifyError(error: unknown): ProcessInboundWagerMessageResult {
  if (error instanceof InvalidMessageError) {
    return { disposition: 'dlq', duplicate: false, reason: error.message };
  }

  if (error instanceof IdempotencyConflictError) {
    return { disposition: 'dlq', duplicate: false, reason: error.message };
  }

  if (error instanceof InvalidTransactionStateError) {
    return { disposition: 'dlq', duplicate: false, reason: error.message };
  }

  if (error instanceof DomainError) {
    return { disposition: 'ack', duplicate: false, reason: error.message };
  }

  return { disposition: 'retry', duplicate: false, reason: 'transient failure' };
}
