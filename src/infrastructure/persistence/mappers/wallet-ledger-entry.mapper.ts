import { LedgerDirection } from '../../../domain/enums/index.js';
import { Money } from '../../../domain/money/index.js';
import { WalletLedgerEntry } from '../../../domain/ledger/index.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';

export function ledgerEntryToDomain(entity: WalletLedgerEntryEntity): WalletLedgerEntry {
  return WalletLedgerEntry.rehydrate({
    id: entity.id,
    walletId: entity.walletId,
    transactionId: entity.transactionId,
    direction: entity.direction as LedgerDirection,
    money: Money.rehydrate({ amount: entity.amount, currency: entity.currency }),
    balanceBefore: Money.rehydrate({ amount: entity.balanceBefore, currency: entity.currency }),
    balanceAfter: Money.rehydrate({ amount: entity.balanceAfter, currency: entity.currency }),
    createdAt: entity.createdAt,
  });
}

export function ledgerEntryToEntity(entry: WalletLedgerEntry): WalletLedgerEntryEntity {
  const entity = new WalletLedgerEntryEntity();
  entity.id = entry.id;
  entity.walletId = entry.walletId;
  entity.transactionId = entry.transactionId;
  entity.direction = entry.direction;
  entity.amount = entry.money.toAmountString();
  entity.currency = entry.money.currency;
  entity.balanceBefore = entry.balanceBefore.toAmountString();
  entity.balanceAfter = entry.balanceAfter.toAmountString();
  entity.createdAt = entry.createdAt;
  return entity;
}
