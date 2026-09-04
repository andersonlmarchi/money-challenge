import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { MONEY_AMOUNT_TYPE } from '../types/money-amount.type.js';

@Entity({ tableName: 'wallets' })
@Unique({ properties: ['playerId', 'currency'] })
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid' })
  playerId!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  balance!: string;

  @Property()
  version!: number;

  @Property({ columnType: 'timestamptz' })
  createdAt!: Date;

  @Property({ columnType: 'timestamptz', onUpdate: () => new Date() })
  updatedAt!: Date;
}
