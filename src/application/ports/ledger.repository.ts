import type { WalletLedgerEntry } from '../../domain/ledger/index.js';

export interface LedgerRepository {
  save(entry: WalletLedgerEntry): Promise<void>;
  findByWalletId(
    walletId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<{ entries: WalletLedgerEntry[]; nextCursor?: string }>;
  sumBalanceFromLedger(walletId: string, currency: string): Promise<string | null>;
}

export const LEDGER_REPOSITORY = Symbol('LEDGER_REPOSITORY');
