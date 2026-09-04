import { v7 as uuidv7 } from 'uuid';
import {
  FailureCode,
  LedgerDirection,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../domain/enums/index.js';
import { Money } from '../../domain/money/index.js';
import { WalletLedgerEntry } from '../../domain/ledger/index.js';
import { OutboxMessage } from '../../domain/outbox/index.js';
import { WagerTransaction } from '../../domain/wager-transaction/index.js';
import { Wallet } from '../../domain/wallet/index.js';
import {
  WalletBalanceChanged,
  WagerTransactionPendingReference,
  WagerTransactionProcessed,
  WagerTransactionRejected,
} from '../../domain/events/wagering-events.js';
import type { ProcessWagerTransactionResult } from '../dtos/finance.dtos.js';
import { FinanceGateway, isUniqueViolation } from '../../infrastructure/persistence/gateways/finance.gateway.js';

export const MAX_REFERENCE_RETRIES = 10;
export const BASE_REFERENCE_RETRY_MS = 1_000;
export const MAX_REFERENCE_RETRY_MS = 60_000;

export class WagerTransactionProcessor {
  async process(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    switch (transaction.kind) {
      case WagerTransactionKind.Bet:
        return this.processBet(gateway, transaction, wallet, correlationId, now);
      case WagerTransactionKind.Win:
        return this.processWin(gateway, transaction, wallet, correlationId, now);
      case WagerTransactionKind.Loss:
        return this.processLoss(gateway, transaction, wallet, correlationId, now);
      case WagerTransactionKind.Refund:
      case WagerTransactionKind.Rollback:
        return this.processReversal(gateway, transaction, wallet, correlationId, now);
      default:
        throw new Error(`Unsupported kind ${transaction.kind}`);
    }
  }

  async failTransaction(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    failureCode: FailureCode,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    transaction.fail(failureCode, now);
    await gateway.updateWagerTransaction(transaction);
    return toResult(transaction, false);
  }

  async rejectTransaction(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    failureCode: FailureCode,
    observedBalance: Money,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    transaction.reject(failureCode, observedBalance, now);
    await gateway.updateWagerTransaction(transaction);
    await this.enqueueRejected(gateway, transaction, correlationId, now);
    return toResult(transaction, false);
  }

  async retryPendingReference(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    now: Date,
  ): Promise<void> {
    if (!transaction.isReferenceRetryDue(now)) {
      return;
    }

    const wallet = await gateway.findWalletByIdForUpdate(transaction.walletId);
    if (!wallet) {
      transaction.fail(FailureCode.WalletNotFound, now);
      await gateway.updateWagerTransaction(transaction);
      return;
    }

    const correlationId = transaction.idempotencyKey;
    const result = await this.processReversal(
      gateway,
      transaction,
      wallet,
      correlationId,
      now,
      true,
    );

    if (result.status === WagerTransactionStatus.PendingReference) {
      if (transaction.referenceRetryAttempts >= MAX_REFERENCE_RETRIES) {
        transaction.reject(FailureCode.ReferenceNotFound, wallet.balance, now);
        transaction.clearReferenceRetrySchedule();
        await gateway.updateWagerTransaction(transaction);
        await this.enqueueRejected(gateway, transaction, correlationId, now);
      } else {
        const delay = Math.min(
          BASE_REFERENCE_RETRY_MS * 2 ** transaction.referenceRetryAttempts,
          MAX_REFERENCE_RETRY_MS,
        );
        transaction.scheduleReferenceRetry(now, delay);
        await gateway.updateWagerTransaction(transaction);
      }
    }
  }

  private async processBet(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    const update = await gateway.atomicDebit(wallet.id, transaction.money.toAmountString());

    if (!update) {
      const observed = await this.currentObservedBalance(gateway, wallet);
      transaction.reject(FailureCode.InsufficientBalance, observed, now);
      await gateway.updateWagerTransaction(transaction);
      await this.enqueueRejected(gateway, transaction, correlationId, now);
      return toResult(transaction, false);
    }

    return this.finalizeBalanceChange(
      gateway,
      transaction,
      wallet,
      update,
      LedgerDirection.Debit,
      undefined,
      correlationId,
      now,
    );
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
      await this.enqueueProcessedOnly(gateway, transaction, correlationId, now);
      return toResult(transaction, false);
    }

    const update = await gateway.atomicCredit(wallet.id, transaction.money.toAmountString());
    if (!update) {
      transaction.fail(FailureCode.WalletNotFound, now);
      await gateway.updateWagerTransaction(transaction);
      throw new Error(`Wallet ${wallet.id} disappeared during credit`);
    }

    return this.finalizeBalanceChange(
      gateway,
      transaction,
      wallet,
      update,
      LedgerDirection.Credit,
      undefined,
      correlationId,
      now,
    );
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
    await this.enqueueProcessedOnly(gateway, transaction, correlationId, now);
    return toResult(transaction, false);
  }

  private async processReversal(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    correlationId: string,
    now: Date,
    isRetry = false,
  ): Promise<ProcessWagerTransactionResult> {
    const lockedWallet = isRetry ? wallet : await gateway.findWalletByIdForUpdate(wallet.id);
    if (!lockedWallet) {
      transaction.fail(FailureCode.WalletNotFound, now);
      await gateway.updateWagerTransaction(transaction);
      return toResult(transaction, false);
    }

    const referenceExternalId = transaction.referenceExternalTransactionId;
    if (!referenceExternalId) {
      transaction.reject(FailureCode.InvalidReference, lockedWallet.balance, now);
      await gateway.updateWagerTransaction(transaction);
      await this.enqueueRejected(gateway, transaction, correlationId, now);
      return toResult(transaction, false);
    }

    const reference = await gateway.findReferenceTransaction(
      transaction.providerId,
      referenceExternalId,
    );

    if (!reference) {
      if (!isRetry) {
        transaction.markPendingReference();
        transaction.scheduleReferenceRetry(now, BASE_REFERENCE_RETRY_MS);
        await gateway.updateWagerTransaction(transaction);
        await gateway.insertOutbox(
          OutboxMessage.enqueue(
            WagerTransactionPendingReference.create({
              eventId: uuidv7(),
              aggregateId: transaction.walletId,
              correlationId,
              occurredAt: now,
              data: {
                transactionId: transaction.id,
                walletId: transaction.walletId,
                kind: transaction.kind,
                referenceExternalTransactionId: referenceExternalId,
              },
            }),
          ),
        );
      }
      return toResult(transaction, false);
    }

    const validationFailure = this.validateReference(transaction, reference, lockedWallet);
    if (validationFailure) {
      transaction.reject(validationFailure, lockedWallet.balance, now);
      await gateway.updateWagerTransaction(transaction);
      await this.enqueueRejected(gateway, transaction, correlationId, now);
      return toResult(transaction, false);
    }

    const existingReversal = await gateway.findProcessedReversal(
      reference.id,
      transaction.kind as WagerTransactionKind.Refund | WagerTransactionKind.Rollback,
    );
    if (existingReversal) {
      transaction.reject(FailureCode.ReferenceAlreadyReversed, lockedWallet.balance, now);
      await gateway.updateWagerTransaction(transaction);
      await this.enqueueRejected(gateway, transaction, correlationId, now);
      return toResult(transaction, false);
    }

    const direction = transaction.ledgerDirectionFor(reference);

    try {
      if (direction === LedgerDirection.Credit) {
        const update = await gateway.atomicCredit(
          lockedWallet.id,
          transaction.money.toAmountString(),
        );
        if (!update) {
          transaction.fail(FailureCode.WalletNotFound, now);
          await gateway.updateWagerTransaction(transaction);
          throw new Error(`Wallet ${lockedWallet.id} disappeared during reversal credit`);
        }
        return this.finalizeBalanceChange(
          gateway,
          transaction,
          lockedWallet,
          update,
          LedgerDirection.Credit,
          reference.id,
          correlationId,
          now,
        );
      }

      const update = await gateway.atomicDebit(
        lockedWallet.id,
        transaction.money.toAmountString(),
      );
      if (!update) {
        const observed = await this.currentObservedBalance(gateway, lockedWallet);
        transaction.reject(FailureCode.ReversalWouldCauseNegativeBalance, observed, now);
        await gateway.updateWagerTransaction(transaction);
        await this.enqueueRejected(gateway, transaction, correlationId, now);
        return toResult(transaction, false);
      }

      return this.finalizeBalanceChange(
        gateway,
        transaction,
        lockedWallet,
        update,
        LedgerDirection.Debit,
        reference.id,
        correlationId,
        now,
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        const observed = await this.currentObservedBalance(gateway, lockedWallet);
        transaction.reject(FailureCode.ReferenceAlreadyReversed, observed, now);
        await gateway.updateWagerTransaction(transaction);
        await this.enqueueRejected(gateway, transaction, correlationId, now);
        return toResult(transaction, false);
      }
      throw error;
    }
  }

  private validateReference(
    transaction: WagerTransaction,
    reference: WagerTransaction,
    wallet: Wallet,
  ): FailureCode | null {
    if (reference.status !== WagerTransactionStatus.Processed) {
      return FailureCode.InvalidReference;
    }

    if (reference.providerId !== transaction.providerId) {
      return FailureCode.ReferenceScopeMismatch;
    }
    if (reference.playerId !== transaction.playerId) {
      return FailureCode.ReferenceScopeMismatch;
    }
    if (reference.walletId !== transaction.walletId) {
      return FailureCode.ReferenceScopeMismatch;
    }
    if (reference.roundId !== transaction.roundId) {
      return FailureCode.ReferenceScopeMismatch;
    }
    if (reference.money.currency !== transaction.money.currency) {
      return FailureCode.CurrencyMismatch;
    }
    if (!reference.money.equals(transaction.money)) {
      return transaction.kind === WagerTransactionKind.Refund
        ? FailureCode.InvalidRefundAmount
        : FailureCode.InvalidRollbackAmount;
    }

    if (transaction.kind === WagerTransactionKind.Refund && reference.kind !== WagerTransactionKind.Bet) {
      return FailureCode.InvalidReference;
    }

    if (
      transaction.kind === WagerTransactionKind.Rollback &&
      reference.kind !== WagerTransactionKind.Bet &&
      reference.kind !== WagerTransactionKind.Win &&
      reference.kind !== WagerTransactionKind.Refund
    ) {
      return FailureCode.InvalidReference;
    }

    if (wallet.currency !== transaction.money.currency) {
      return FailureCode.CurrencyMismatch;
    }

    return null;
  }

  private async finalizeBalanceChange(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    wallet: Wallet,
    update: { balance: string; version: number },
    direction: LedgerDirection,
    referenceTransactionId: string | undefined,
    correlationId: string,
    now: Date,
  ): Promise<ProcessWagerTransactionResult> {
    const balanceAfter = Money.rehydrate({ amount: update.balance, currency: wallet.currency });
    const balanceBefore =
      direction === LedgerDirection.Debit
        ? balanceAfter.add(transaction.money)
        : balanceAfter.subtract(transaction.money);

    const ledgerEntry = WalletLedgerEntry.create({
      id: uuidv7(),
      walletId: wallet.id,
      transactionId: transaction.id,
      direction,
      money: transaction.money,
      balanceBefore,
      balanceAfter,
      createdAt: now,
    });

    transaction.markProcessed(referenceTransactionId, balanceAfter, now);
    transaction.clearReferenceRetrySchedule();
    await gateway.updateWagerTransaction(transaction);
    await gateway.insertLedgerEntry(ledgerEntry);
    await this.enqueueProcessed(gateway, transaction, ledgerEntry, update.version, correlationId, now);

    return toResult(transaction, false);
  }

  private async currentObservedBalance(
    gateway: FinanceGateway,
    wallet: Wallet,
  ): Promise<Money> {
    const balance = await gateway.getWalletBalance(wallet.id);
    return balance
      ? Money.rehydrate({ amount: balance, currency: wallet.currency })
      : wallet.balance;
  }

  private async enqueueProcessedOnly(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
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
  }

  private async enqueueProcessed(
    gateway: FinanceGateway,
    transaction: WagerTransaction,
    ledgerEntry: WalletLedgerEntry,
    walletVersion: number,
    correlationId: string,
    now: Date,
  ): Promise<void> {
    await this.enqueueProcessedOnly(gateway, transaction, correlationId, now);

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
