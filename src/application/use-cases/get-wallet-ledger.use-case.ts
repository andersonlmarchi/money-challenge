import { Injectable, Inject } from '@nestjs/common';
import { WALLET_REPOSITORY } from '../ports/wallet.repository.js';
import type { WalletRepository } from '../ports/wallet.repository.js';
import { LEDGER_REPOSITORY } from '../ports/ledger.repository.js';
import type { LedgerRepository } from '../ports/ledger.repository.js';
import { WalletNotFoundError } from '../../domain/errors/index.js';
import type { GetWalletLedgerQuery, GetWalletLedgerResult } from '../dtos/finance.dtos.js';

@Injectable()
export class GetWalletLedgerUseCase {
  constructor(
    @Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository,
    @Inject(LEDGER_REPOSITORY) private readonly ledger: LedgerRepository,
  ) {}

  async execute(query: GetWalletLedgerQuery): Promise<GetWalletLedgerResult> {
    const wallet = await this.wallets.findById(query.walletId);
    if (!wallet) {
      throw new WalletNotFoundError(`Wallet ${query.walletId} not found`);
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const page = await this.ledger.findByWalletId(query.walletId, {
      cursor: query.cursor,
      limit,
    });

    return {
      walletId: query.walletId,
      entries: page.entries.map((entry) => ({
        id: entry.id,
        transactionId: entry.transactionId,
        direction: entry.direction,
        money: entry.money.toJSON(),
        balanceBefore: entry.balanceBefore.toJSON(),
        balanceAfter: entry.balanceAfter.toJSON(),
        createdAt: entry.createdAt.toISOString(),
      })),
      nextCursor: page.nextCursor,
    };
  }
}
