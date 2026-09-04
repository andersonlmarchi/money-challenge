import { Entity, Index, ManyToOne, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { MONEY_AMOUNT_TYPE } from '../types/money-amount.type.js';
import { WalletEntity } from './wallet.entity.js';

@Entity({ tableName: 'wager_transactions' })
@Unique({ properties: ['idempotencyKey'] })
@Unique({ properties: ['providerId', 'externalTransactionId'] })
@Index({ properties: ['walletId'] })
export class WagerTransactionEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property()
  providerId!: string;

  @Property()
  externalTransactionId!: string;

  @Property()
  idempotencyKey!: string;

  @Property({ length: 64 })
  payloadHash!: string;

  @ManyToOne(() => WalletEntity, { fieldName: 'wallet_id' })
  wallet!: WalletEntity;

  @Property({ type: 'uuid' })
  walletId!: string;

  @Property({ type: 'uuid' })
  playerId!: string;

  @Property()
  roundId!: string;

  @Property()
  gameId!: string;

  @Property({ length: 32 })
  kind!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ nullable: true })
  referenceExternalTransactionId?: string;

  @ManyToOne(() => WagerTransactionEntity, { nullable: true, fieldName: 'reference_transaction_id' })
  referenceTransaction?: WagerTransactionEntity;

  @Property({ type: 'uuid', nullable: true })
  referenceTransactionId?: string;

  @Property({ length: 32 })
  status!: string;

  @Property({ length: 64, nullable: true })
  failureCode?: string;

  @Property({ type: MONEY_AMOUNT_TYPE, nullable: true })
  observedBalance?: string;

  @Property({ columnType: 'timestamptz', nullable: true })
  processedAt?: Date;

  @Property({ columnType: 'timestamptz' })
  createdAt!: Date;
}
