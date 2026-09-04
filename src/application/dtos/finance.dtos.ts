import type { MoneyProps } from '../../domain/money/index.js';

export interface OpenWalletCommand {
  playerId: string;
  initialBalance: MoneyProps;
}

export interface OpenWalletResult {
  id: string;
  playerId: string;
  balance: MoneyProps;
  version: number;
}

export interface ProcessWagerTransactionCommand {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: MoneyProps;
  correlationId?: string;
}

export interface ProcessWagerTransactionResult {
  transactionId: string;
  status: string;
  balance?: MoneyProps;
  failureCode?: string;
  idempotentReplay: boolean;
}
