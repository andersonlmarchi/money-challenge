import { InboxMessage } from '../../../domain/inbox/index.js';
import { InboxMessageEntity } from '../entities/inbox-message.entity.js';

export function inboxToDomain(entity: InboxMessageEntity): InboxMessage {
  return InboxMessage.rehydrate({
    messageId: entity.messageId,
    consumerName: entity.consumerName,
    payloadHash: entity.payloadHash,
    receivedAt: entity.receivedAt,
    processedAt: entity.processedAt,
  });
}

export function inboxToEntity(message: InboxMessage): InboxMessageEntity {
  const entity = new InboxMessageEntity();
  entity.messageId = message.messageId;
  entity.consumerName = message.consumerName;
  entity.payloadHash = message.payloadHash;
  entity.receivedAt = message.receivedAt;
  entity.processedAt = message.processedAt;
  return entity;
}

export function applyInboxToEntity(message: InboxMessage, entity: InboxMessageEntity): void {
  entity.processedAt = message.processedAt;
}
