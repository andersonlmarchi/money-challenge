import type { WagerTransaction } from '../../domain/wager-transaction/index.js';
import type { GetWagerTransactionResult } from '../dtos/finance.dtos.js';

export function toWagerTransactionView(transaction: WagerTransaction): GetWagerTransactionResult {
  return {
    transactionId: transaction.id,
    providerId: transaction.providerId,
    externalTransactionId: transaction.externalTransactionId,
    idempotencyKey: transaction.idempotencyKey,
    walletId: transaction.walletId,
    playerId: transaction.playerId,
    roundId: transaction.roundId,
    gameId: transaction.gameId,
    kind: transaction.kind,
    money: transaction.money.toJSON(),
    referenceExternalTransactionId: transaction.referenceExternalTransactionId,
    status: transaction.status,
    failureCode: transaction.failureCode,
    balance: transaction.observedBalance?.toJSON(),
    processedAt: transaction.processedAt?.toISOString(),
    createdAt: transaction.createdAt.toISOString(),
  };
}
