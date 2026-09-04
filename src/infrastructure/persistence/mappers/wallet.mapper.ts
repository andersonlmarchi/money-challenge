import { Money } from '../../../domain/money/index.js';
import { Wallet } from '../../../domain/wallet/index.js';
import { WalletEntity } from '../entities/wallet.entity.js';

export function walletToDomain(entity: WalletEntity): Wallet {
  return Wallet.rehydrate({
    id: entity.id,
    playerId: entity.playerId,
    currency: entity.currency,
    balance: Money.rehydrate({ amount: entity.balance, currency: entity.currency }),
    version: entity.version,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });
}

export function walletToEntity(wallet: Wallet): WalletEntity {
  const entity = new WalletEntity();
  entity.id = wallet.id;
  entity.playerId = wallet.playerId;
  entity.currency = wallet.currency;
  entity.balance = wallet.balance.toAmountString();
  entity.version = wallet.version;
  entity.createdAt = wallet.createdAt;
  entity.updatedAt = wallet.updatedAt;
  return entity;
}

export function applyWalletToEntity(wallet: Wallet, entity: WalletEntity): void {
  entity.balance = wallet.balance.toAmountString();
  entity.version = wallet.version;
  entity.updatedAt = wallet.updatedAt;
}
