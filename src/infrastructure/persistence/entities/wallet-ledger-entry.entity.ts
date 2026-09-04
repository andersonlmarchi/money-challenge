import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { MONEY_AMOUNT_TYPE } from '../types/money-amount.type.js';

@Entity({ tableName: 'wallet_ledger_entries' })
@Unique({ properties: ['walletId', 'transactionId'] })
@Index({ properties: ['walletId', 'createdAt', 'id'] })
export class WalletLedgerEntryEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid', fieldName: 'wallet_id' })
  walletId!: string;

  @Property({ type: 'uuid', fieldName: 'transaction_id' })
  transactionId!: string;

  @Property({ length: 16 })
  direction!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ type: MONEY_AMOUNT_TYPE, fieldName: 'balance_before' })
  balanceBefore!: string;

  @Property({ type: MONEY_AMOUNT_TYPE, fieldName: 'balance_after' })
  balanceAfter!: string;

  @Property({ columnType: 'timestamptz', fieldName: 'created_at' })
  createdAt!: Date;
}
