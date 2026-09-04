import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { MONEY_AMOUNT_TYPE } from '../types/money-amount.type.js';
import { WalletEntity } from './wallet.entity.js';
import { WagerTransactionEntity } from './wager-transaction.entity.js';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({ properties: ['walletId', 'transactionId'] })
@Index({ properties: ['walletId', 'createdAt', 'id'] })
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @ManyToOne(() => WalletEntity, { fieldName: 'wallet_id' })
  wallet!: WalletEntity;

  @Property({ type: 'uuid' })
  walletId!: string;

  @ManyToOne(() => WagerTransactionEntity, { fieldName: 'transaction_id' })
  transaction!: WagerTransactionEntity;

  @Property({ type: 'uuid' })
  transactionId!: string;

  @Property({ length: 16 })
  direction!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  balanceBefore!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  balanceAfter!: string;

  @Property({ columnType: 'timestamptz' })
  createdAt!: Date;
}
