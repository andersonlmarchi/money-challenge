import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { InboxRepository } from '../../../application/ports/inbox.repository.js';
import { InboxMessage } from '../../../domain/inbox/index.js';
import { InboxMessageEntity } from '../entities/inbox-message.entity.js';
import { applyInboxToEntity, inboxToDomain, inboxToEntity } from '../mappers/inbox-message.mapper.js';

@Injectable()
export class MikroOrmInboxRepository implements InboxRepository {
  constructor(private readonly em: EntityManager) {}

  async findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null> {
    const entity = await this.em.findOne(InboxMessageEntity, { consumerName, messageId });
    return entity ? inboxToDomain(entity) : null;
  }

  async save(message: InboxMessage): Promise<void> {
    let entity = await this.em.findOne(InboxMessageEntity, {
      consumerName: message.consumerName,
      messageId: message.messageId,
    });
    if (!entity) {
      entity = inboxToEntity(message);
      this.em.persist(entity);
      return;
    }
    applyInboxToEntity(message, entity);
  }
}
