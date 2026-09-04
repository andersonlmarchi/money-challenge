import { Injectable, Inject } from '@nestjs/common';
import { WALLET_REPOSITORY } from '../ports/wallet.repository.js';
import type { WalletRepository } from '../ports/wallet.repository.js';
import { WalletNotFoundError } from '../../domain/errors/index.js';
import type { GetWalletResult } from '../dtos/finance.dtos.js';

@Injectable()
export class GetWalletUseCase {
  constructor(@Inject(WALLET_REPOSITORY) private readonly wallets: WalletRepository) {}

  async execute(walletId: string): Promise<GetWalletResult> {
    const wallet = await this.wallets.findById(walletId);
    if (!wallet) {
      throw new WalletNotFoundError(`Wallet ${walletId} not found`);
    }

    return {
      id: wallet.id,
      playerId: wallet.playerId,
      balance: wallet.balance.toJSON(),
      version: wallet.version,
    };
  }
}
