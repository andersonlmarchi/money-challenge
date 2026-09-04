import { Entity, PrimaryKey, Property } from '@mikro-orm/core';

@Entity({ tableName: 'inbox_messages' })
export class InboxMessageEntity {
  @PrimaryKey({ fieldName: 'consumer_name' })
  consumerName!: string;

  @PrimaryKey({ fieldName: 'message_id' })
  messageId!: string;

  @Property({ length: 64, fieldName: 'payload_hash' })
  payloadHash!: string;

  @Property({ columnType: 'timestamptz', fieldName: 'received_at' })
  receivedAt!: Date;

  @Property({ columnType: 'timestamptz', nullable: true, fieldName: 'processed_at' })
  processedAt?: Date;
}
