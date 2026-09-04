import { Entity, Index, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'outbox_messages' })
@Index({ name: 'outbox_messages_pending_idx', properties: ['nextAttemptAt', 'occurredAt'] })
export class OutboxMessageEntity {
  @PrimaryKey({ type: 'uuid' })
  id!: string;

  @Property({ fieldName: 'aggregate_id' })
  aggregateId!: string;

  @Property({ fieldName: 'event_type' })
  eventType!: string;

  @Property({ type: 'json' })
  payload!: Record<string, unknown>;

  @Property({ columnType: 'timestamptz', fieldName: 'occurred_at' })
  occurredAt!: Date;

  @Property({ default: 0 })
  attempts!: number;

  @Property({ columnType: 'timestamptz', nullable: true, fieldName: 'next_attempt_at' })
  nextAttemptAt?: Date;

  @Property({ columnType: 'timestamptz', nullable: true, fieldName: 'published_at' })
  publishedAt?: Date;
}
