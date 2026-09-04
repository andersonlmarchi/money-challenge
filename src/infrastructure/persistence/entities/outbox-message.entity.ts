import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'outbox_messages' })
@Index({ properties: ['nextAttemptAt', 'occurredAt'], name: 'outbox_messages_pending_idx' })
export class OutboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property()
  aggregateId!: string;

  @Property()
  eventType!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Property({ columnType: 'timestamptz' })
  occurredAt!: Date;

  @Property({ default: 0 })
  attempts!: number;

  @Property({ columnType: 'timestamptz', nullable: true })
  nextAttemptAt?: Date;

  @Property({ columnType: 'timestamptz', nullable: true })
  publishedAt?: Date;
}
