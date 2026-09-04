import { Entity, Index, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { MONEY_AMOUNT_TYPE } from '../types/money-amount.type.js';

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

  @Property({ type: 'uuid', fieldName: 'wallet_id' })
  walletId!: string;

  @Property({ type: 'uuid', fieldName: 'player_id' })
  playerId!: string;

  @Property({ fieldName: 'round_id' })
  roundId!: string;

  @Property({ fieldName: 'game_id' })
  gameId!: string;

  @Property({ length: 32 })
  kind!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  amount!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ nullable: true, fieldName: 'reference_external_transaction_id' })
  referenceExternalTransactionId?: string;

  @Property({ type: 'uuid', nullable: true, fieldName: 'reference_transaction_id' })
  referenceTransactionId?: string;

  @Property({ length: 32 })
  status!: string;

  @Property({ length: 64, nullable: true, fieldName: 'failure_code' })
  failureCode?: string;

  @Property({ type: MONEY_AMOUNT_TYPE, nullable: true, fieldName: 'observed_balance' })
  observedBalance?: string;

  @Property({ columnType: 'timestamptz', nullable: true, fieldName: 'processed_at' })
  processedAt?: Date;

  @Property({ columnType: 'timestamptz', fieldName: 'created_at' })
  createdAt!: Date;

  @Property({ default: 0, fieldName: 'reference_retry_attempts' })
  referenceRetryAttempts!: number;

  @Property({ columnType: 'timestamptz', nullable: true, fieldName: 'next_reference_attempt_at' })
  nextReferenceAttemptAt?: Date;
}
