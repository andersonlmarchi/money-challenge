import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { OutboxRepository } from '../../../application/ports/outbox.repository.js';
import { OutboxMessage } from '../../../domain/outbox/index.js';
import { OutboxMessageEntity } from '../entities/outbox-message.entity.js';
import { applyOutboxToEntity, outboxToDomain, outboxToEntity } from '../mappers/outbox-message.mapper.js';

@Injectable()
export class MikroOrmOutboxRepository implements OutboxRepository {
  constructor(private readonly em: EntityManager) {}

  async save(message: OutboxMessage): Promise<void> {
    let entity = await this.em.findOne(OutboxMessageEntity, { id: message.id });
    if (!entity) {
      entity = outboxToEntity(message);
      this.em.persist(entity);
      return;
    }
    applyOutboxToEntity(message, entity);
  }

  async findPendingDue(now: Date, limit: number): Promise<OutboxMessage[]> {
    const entities = await this.em.find(
      OutboxMessageEntity,
      {
        publishedAt: null,
        $or: [{ nextAttemptAt: null }, { nextAttemptAt: { $lte: now } }],
      },
      {
        orderBy: { occurredAt: 'ASC' },
        limit,
      },
    );

    return entities.map(outboxToDomain);
  }
}
