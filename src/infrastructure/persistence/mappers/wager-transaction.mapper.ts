import {
  FailureCode,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/enums/index.js';
import { Money } from '../../../domain/money/index.js';
import { WagerTransaction } from '../../../domain/wager-transaction/index.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

export function wagerTransactionToDomain(entity: WagerTransactionEntity): WagerTransaction {
  return WagerTransaction.rehydrate({
    id: entity.id,
    providerId: entity.providerId,
    externalTransactionId: entity.externalTransactionId,
    idempotencyKey: entity.idempotencyKey,
    payloadHash: entity.payloadHash,
    walletId: entity.walletId,
    playerId: entity.playerId,
    roundId: entity.roundId,
    gameId: entity.gameId,
    kind: entity.kind as WagerTransactionKind,
    money: Money.rehydrate({ amount: entity.amount, currency: entity.currency }),
    referenceExternalTransactionId: entity.referenceExternalTransactionId,
    referenceTransactionId: entity.referenceTransactionId,
    status: entity.status as WagerTransactionStatus,
    failureCode: entity.failureCode as FailureCode | undefined,
    observedBalance: entity.observedBalance
      ? Money.rehydrate({ amount: entity.observedBalance, currency: entity.currency })
      : undefined,
    processedAt: entity.processedAt,
    createdAt: entity.createdAt,
  });
}

export function wagerTransactionToEntity(transaction: WagerTransaction): WagerTransactionEntity {
  const entity = new WagerTransactionEntity();
  entity.id = transaction.id;
  entity.providerId = transaction.providerId;
  entity.externalTransactionId = transaction.externalTransactionId;
  entity.idempotencyKey = transaction.idempotencyKey;
  entity.payloadHash = transaction.payloadHash;
  entity.walletId = transaction.walletId;
  entity.playerId = transaction.playerId;
  entity.roundId = transaction.roundId;
  entity.gameId = transaction.gameId;
  entity.kind = transaction.kind;
  entity.amount = transaction.money.toAmountString();
  entity.currency = transaction.money.currency;
  entity.referenceExternalTransactionId = transaction.referenceExternalTransactionId;
  entity.referenceTransactionId = transaction.referenceTransactionId;
  entity.status = transaction.status;
  entity.failureCode = transaction.failureCode;
  entity.observedBalance = transaction.observedBalance?.toAmountString();
  entity.processedAt = transaction.processedAt;
  entity.createdAt = transaction.createdAt;
  return entity;
}

export function applyWagerTransactionToEntity(
  transaction: WagerTransaction,
  entity: WagerTransactionEntity,
): void {
  entity.referenceTransactionId = transaction.referenceTransactionId;
  entity.status = transaction.status;
  entity.failureCode = transaction.failureCode;
  entity.observedBalance = transaction.observedBalance?.toAmountString();
  entity.processedAt = transaction.processedAt;
}
