import { OutboxMessage } from '../../../domain/outbox/index.js';
import { OutboxMessageEntity } from '../entities/outbox-message.entity.js';

export function outboxToDomain(entity: OutboxMessageEntity): OutboxMessage {
  return OutboxMessage.rehydrate({
    id: entity.id,
    aggregateId: entity.aggregateId,
    eventType: entity.eventType,
    payload: entity.payload,
    occurredAt: entity.occurredAt,
    attempts: entity.attempts,
    nextAttemptAt: entity.nextAttemptAt,
    publishedAt: entity.publishedAt,
  });
}

export function outboxToEntity(message: OutboxMessage): OutboxMessageEntity {
  const entity = new OutboxMessageEntity();
  entity.id = message.id;
  entity.aggregateId = message.aggregateId;
  entity.eventType = message.eventType;
  entity.payload = { ...message.payload };
  entity.occurredAt = message.occurredAt;
  entity.attempts = message.attempts;
  entity.nextAttemptAt = message.nextAttemptAt;
  entity.publishedAt = message.publishedAt;
  return entity;
}

export function applyOutboxToEntity(message: OutboxMessage, entity: OutboxMessageEntity): void {
  entity.attempts = message.attempts;
  entity.nextAttemptAt = message.nextAttemptAt;
  entity.publishedAt = message.publishedAt;
}
