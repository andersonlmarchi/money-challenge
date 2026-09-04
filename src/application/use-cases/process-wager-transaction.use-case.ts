import { Injectable } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';
import {
  FailureCode,
  LedgerDirection,
  WagerTransactionKind,
} from '../../domain/enums/index.js';
import {
  IdempotencyConflictError,
  InvalidTransactionStateError,
  WalletNotFoundError,
} from '../../domain/errors/index.js';
import { Money } from '../../domain/money/index.js';
import { WalletLedgerEntry } from '../../domain/ledger/index.js';
import { OutboxMessage } from '../../domain/outbox/index.js';
import { WagerTransaction } from '../../domain/wager-transaction/index.js';
import { Wallet } from '../../domain/wallet/index.js';
import {
  WalletBalanceChanged,
  WagerTransactionProcessed,
  WagerTransactionRejected,
} from '../../domain/events/wagering-events.js';
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

const SUPPORTED_KINDS = new Set<WagerTransactionKind>([
  WagerTransactionKind.Bet,
  WagerTransactionKind.Win,
  WagerTransactionKind.Loss,
]);

@Injectable()
export class ProcessWagerTransactionUseCase {
  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  async execute(command: ProcessWagerTransactionCommand): Promise<ProcessWagerTransactionResult> {
    const kind = command.kind as WagerTransactionKind;
    if (!SUPPORTED_KINDS.has(kind)) {
      throw new InvalidTransactionStateError(
        `Kind ${command.kind} is not supported in the core wagering pipeline`,
      );
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
        pending.fail(FailureCode.WalletNotFound, now);
        await gateway.updateWagerTransaction(pending);
        await this.enqueueRejected(gateway, pending, correlationId, now);
        return toResult(pending, false);
      }

      if (wallet.playerId !== command.playerId) {
        pending.reject(FailureCode.InvalidReference, wallet.balance, now);
        await gateway.updateWagerTransaction(pending);
        await this.enqueueRejected(gateway, pending, correlationId, now);
        return toResult(pending, false);
      }

      if (wallet.currency !== money.currency) {
        pending.reject(FailureCode.CurrencyMismatch, wallet.balance, now);
        await gateway.updateWagerTransaction(pending);
        await this.enqueueRejected(gateway, pending, correlationId, now);
        return toResult(pending, false);
      }

      switch (kind) {
        case WagerTransactionKind.Bet:
          return this.processBet(gateway, pending, wallet, correlationId, now);
        case WagerTransactionKind.Win:
          return this.processWin(gateway, pending, wallet, correlationId, now);
        case WagerTransactionKind.Loss:
          return this.processLoss(gateway, pending, wallet, correlationId, now);
        default:
          throw new InvalidTransactionStateError(`Unsupported kind ${kind}`);
      }
    });
  }

  private async processBet(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    const amount = transaction.money.toAmountString();
    const update = await gateway.atomicDebit(wallet.id, amount);

    if (!update) {
      const currentWallet = await gateway.findWalletById(wallet.id);
      const observed = currentWallet?.balance ?? wallet.balance;
      transaction.reject(FailureCode.InsufficientBalance, observed, now);
      await gateway.updateWagerTransaction(transaction);
      await this.enqueueRejected(gateway, transaction, correlationId, now);
      return toResult(transaction, false);
    }

    const balanceAfter = Money.rehydrate({ amount: update.balance, currency: wallet.currency });
    const balanceBefore = balanceAfter.add(transaction.money);

    const ledgerEntry = WalletLedgerEntry.create({
      id: uuidv7(),
      walletId: wallet.id,
      transactionId: transaction.id,
      direction: LedgerDirection.Debit,
      money: transaction.money,
      balanceBefore,
      balanceAfter,
      createdAt: now,
    });

    transaction.markProcessed(undefined, balanceAfter, now);
    await gateway.updateWagerTransaction(transaction);
    await gateway.insertLedgerEntry(ledgerEntry);
    await this.enqueueProcessed(gateway, transaction, ledgerEntry, update.version, correlationId, now);

    return toResult(transaction, false);
  }

  private async processWin(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    if (transaction.money.isZero()) {
      transaction.markProcessed(undefined, wallet.balance, now);
      await gateway.updateWagerTransaction(transaction);
      await gateway.insertOutbox(
        OutboxMessage.enqueue(
          WagerTransactionProcessed.create({
            eventId: uuidv7(),
            aggregateId: wallet.id,
            correlationId,
            occurredAt: now,
            data: {
              transactionId: transaction.id,
              walletId: wallet.id,
              kind: transaction.kind,
              status: transaction.status,
              observedBalance: transaction.observedBalance?.toJSON(),
            },
          }),
        ),
      );
      return toResult(transaction, false);
    }

    const update = await gateway.atomicCredit(wallet.id, transaction.money.toAmountString());
    if (!update) {
      transaction.fail(FailureCode.WalletNotFound, now);
      await gateway.updateWagerTransaction(transaction);
      throw new WalletNotFoundError(`Wallet ${wallet.id} disappeared during credit`);
    }

    const balanceAfter = Money.rehydrate({ amount: update.balance, currency: wallet.currency });
    const balanceBefore = balanceAfter.subtract(transaction.money);

    const ledgerEntry = WalletLedgerEntry.create({
      id: uuidv7(),
      walletId: wallet.id,
      transactionId: transaction.id,
      direction: LedgerDirection.Credit,
      money: transaction.money,
      balanceBefore,
      balanceAfter,
      createdAt: now,
    });

    transaction.markProcessed(undefined, balanceAfter, now);
    await gateway.updateWagerTransaction(transaction);
    await gateway.insertLedgerEntry(ledgerEntry);
    await this.enqueueProcessed(gateway, transaction, ledgerEntry, update.version, correlationId, now);

    return toResult(transaction, false);
  }

  private async processLoss(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    transaction.markProcessed(undefined, wallet.balance, now);
    await gateway.updateWagerTransaction(transaction);
    await gateway.insertOutbox(
      OutboxMessage.enqueue(
        WagerTransactionProcessed.create({
          eventId: uuidv7(),
          aggregateId: wallet.id,
          correlationId,
          occurredAt: now,
          data: {
            transactionId: transaction.id,
            walletId: wallet.id,
            kind: transaction.kind,
            status: transaction.status,
            observedBalance: transaction.observedBalance?.toJSON(),
          },
        }),
      ),
    );
    return toResult(transaction, false);
  }

  private async enqueueProcessed(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    ledgerEntry: WalletLedgerEntry,
    walletVersion: number,
    correlationId: string,
    now: Date,
  ): Promise<void> {
    await gateway.insertOutbox(
      OutboxMessage.enqueue(
        WagerTransactionProcessed.create({
          eventId: uuidv7(),
          aggregateId: transaction.walletId,
          correlationId,
          occurredAt: now,
          data: {
            transactionId: transaction.id,
            walletId: transaction.walletId,
            kind: transaction.kind,
            status: transaction.status,
            observedBalance: transaction.observedBalance?.toJSON(),
          },
        }),
      ),
    );

    await gateway.insertOutbox(
      OutboxMessage.enqueue(
        WalletBalanceChanged.create({
          eventId: uuidv7(),
          aggregateId: transaction.walletId,
          correlationId,
          occurredAt: now,
          data: {
            walletId: transaction.walletId,
            transactionId: transaction.id,
            direction: ledgerEntry.direction,
            money: ledgerEntry.money.toJSON(),
            balanceBefore: ledgerEntry.balanceBefore.toJSON(),
            balanceAfter: ledgerEntry.balanceAfter.toJSON(),
            walletVersion,
          },
        }),
      ),
    );
  }

  private async enqueueRejected(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    correlationId: string,
    now: Date,
  ): Promise<void> {
    await gateway.insertOutbox(
      OutboxMessage.enqueue(
        WagerTransactionRejected.create({
          eventId: uuidv7(),
          aggregateId: transaction.walletId,
          correlationId,
          occurredAt: now,
          data: {
            transactionId: transaction.id,
            walletId: transaction.walletId,
            kind: transaction.kind,
            failureCode: transaction.failureCode ?? FailureCode.InvalidPayload,
            observedBalance: transaction.observedBalance?.toJSON(),
          },
        }),
      ),
    );
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
