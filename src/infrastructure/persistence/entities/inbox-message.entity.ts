import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'inbox_messages' })
export class InboxMessageEntity {
  @PrimaryKey()
  consumerName!: string;

  @PrimaryKey()
  messageId!: string;

  @Property({ length: 64 })
  payloadHash!: string;

  @Property({ columnType: 'timestamptz' })
  receivedAt!: Date;

  @Property({ columnType: 'timestamptz', nullable: true })
  processedAt?: Date;
}
