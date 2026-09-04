import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import { WagerTransactionKind, FailureCode } from '../../domain/enums/index.js';
import {
  IdempotencyConflictError,
  InvalidTransactionStateError,
} from '../../domain/errors/index.js';
import { Money } from '../../domain/money/index.js';
import { WagerTransaction } from '../../domain/wager-transaction/index.js';
import type {
  ProcessWagerTransactionCommand,
  ProcessWagerTransactionResult,
} from '../dtos/finance.dtos.js';
import {
  buildWagerPayloadHashInput,
  computePayloadHash,
} from '../utils/payload-hash.js';
import { FinanceGateway } from '../../infrastructure/persistence/gateways/finance.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';
import { WagerTransactionProcessor } from '../services/wager-transaction.processor.js';

const SUPPORTED_KINDS = new Set<WagerTransactionKind>([
  WagerTransactionKind.Bet,
  WagerTransactionKind.Win,
  WagerTransactionKind.Loss,
  WagerTransactionKind.Refund,
  WagerTransactionKind.Rollback,
]);

@Injectable()
export class ProcessWagerTransactionUseCase {
  private readonly processor = new WagerTransactionProcessor();

  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  async execute(command: ProcessWagerTransactionCommand): Promise<ProcessWagerTransactionResult> {
    const kind = command.kind as WagerTransactionKind;
    if (!SUPPORTED_KINDS.has(kind)) {
      throw new InvalidTransactionStateError(`Kind ${command.kind} is not supported`);
    }

    const money = Money.from(command.money);
    const payloadHash = computePayloadHash(
      buildWagerPayloadHashInput({
        providerId: command.providerId,
        externalTransactionId: command.externalTransactionId,
        playerId: command.playerId,
        walletId: command.walletId,
        roundId: command.roundId,
        gameId: command.gameId,
        kind: command.kind,
        money: command.money,
        referenceExternalTransactionId: command.referenceExternalTransactionId,
      }),
    );

    return this.unitOfWork.transactional(async (em) => {
      const gateway = new FinanceGateway(em);
      const now = new Date();
      const correlationId = command.correlationId ?? command.idempotencyKey;

      const pending = WagerTransaction.create({
        id: uuidv7(),
        providerId: command.providerId,
        externalTransactionId: command.externalTransactionId,
        idempotencyKey: command.idempotencyKey,
        payloadHash,
        walletId: command.walletId,
        playerId: command.playerId,
        roundId: command.roundId,
        gameId: command.gameId,
        kind,
        money,
        referenceExternalTransactionId: command.referenceExternalTransactionId,
        createdAt: now,
      });

      const insertResult = await gateway.insertWagerTransactionOrConflict(pending);
      if (insertResult === 'conflict') {
        const existing = await gateway.findWagerTransactionByIdempotencyKey(command.idempotencyKey);
        if (!existing) {
          throw new IdempotencyConflictError('Idempotency conflict without existing transaction');
        }
        if (!existing.matchesPayload(payloadHash)) {
          throw new IdempotencyConflictError(
            'Idempotency key reused with a different payload',
          );
        }
        return toResult(existing, true);
      }

      const wallet = await gateway.findWalletById(command.walletId);
      if (!wallet) {
        return this.processor.failTransaction(
          gateway,
          pending,
          FailureCode.WalletNotFound,
          now,
        );
      }

      if (wallet.playerId !== command.playerId) {
        return this.processor.rejectTransaction(
          gateway,
          pending,
          FailureCode.InvalidReference,
          wallet.balance,
          correlationId,
          now,
        );
      }

      if (wallet.currency !== money.currency) {
        return this.processor.rejectTransaction(
          gateway,
          pending,
          FailureCode.CurrencyMismatch,
          wallet.balance,
          correlationId,
          now,
        );
      }

      return this.processor.process(gateway, pending, wallet, correlationId, now);
    });
  }
}

function toResult(
  transaction: WagerTransaction,
  idempotentReplay: boolean,
): ProcessWagerTransactionResult {
  return {
    transactionId: transaction.id,
    status: transaction.status,
    balance: transaction.observedBalance?.toJSON(),
    failureCode: transaction.failureCode,
    idempotentReplay,
  };
}
