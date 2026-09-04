import { Entity, PrimaryKey, Property, Unique } from '@mikro-orm/core';
import { MONEY_AMOUNT_TYPE } from '../types/money-amount.type.js';

@Entity({ tableName: 'wallets' })
@Unique({ properties: ['playerId', 'currency'] })
export class WalletEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ type: 'uuid', fieldName: 'player_id' })
  playerId!: string;

  @Property({ length: 3 })
  currency!: string;

  @Property({ type: MONEY_AMOUNT_TYPE })
  balance!: string;

  @Property()
  version!: number;

  @Property({ columnType: 'timestamptz', fieldName: 'created_at' })
  createdAt!: Date;

  @Property({ columnType: 'timestamptz', fieldName: 'updated_at', onUpdate: () => new Date() })
  updatedAt!: Date;
}
