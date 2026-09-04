import type { EntityManager } from '@mikro-orm/postgresql';
import { LockMode } from '@mikro-orm/core';
import { InboxMessage } from '../../../domain/inbox/index.js';
import { OutboxMessage } from '../../../domain/outbox/index.js';
import { InboxMessageEntity } from '../entities/inbox-message.entity.js';
import { OutboxMessageEntity } from '../entities/outbox-message.entity.js';
import {
  applyInboxToEntity,
  inboxToDomain,
} from '../mappers/inbox-message.mapper.js';
import {
  applyOutboxToEntity,
  outboxToDomain,
  outboxToEntity,
} from '../mappers/outbox-message.mapper.js';

export type InboxInsertStatus = 'new' | 'already_processed' | 'retry';

export interface InboxInsertResult {
  status: InboxInsertStatus;
  message: InboxMessage;
}

export class MessagingGateway {
  constructor(private readonly em: EntityManager) {}

  async insertInboxOrGet(message: InboxMessage): Promise<InboxInsertResult> {
    const rows = await this.em.getConnection().execute<Array<{ message_id: string }>>(
      `
        INSERT INTO inbox_messages (consumer_name, message_id, payload_hash, received_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (consumer_name, message_id) DO NOTHING
        RETURNING message_id
      `,
      [message.consumerName, message.messageId, message.payloadHash, message.receivedAt],
    );

    if (rows.length > 0) {
      return { status: 'new', message };
    }

    const entity = await this.em.findOne(
      InboxMessageEntity,
      { consumerName: message.consumerName, messageId: message.messageId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );

    if (!entity) {
      throw new Error('Inbox conflict without existing row');
    }

    const existing = inboxToDomain(entity);
    if (existing.isProcessed()) {
      return { status: 'already_processed', message: existing };
    }

    return { status: 'retry', message: existing };
  }

  async updateInbox(message: InboxMessage): Promise<void> {
    const entity = await this.em.findOneOrFail(InboxMessageEntity, {
      consumerName: message.consumerName,
      messageId: message.messageId,
    });
    applyInboxToEntity(message, entity);
  }

  async claimPendingOutboxMessages(now: Date, limit: number): Promise<OutboxMessage[]> {
    const rows = await this.em.getConnection().execute<
      Array<{
        id: string;
        aggregate_id: string;
        event_type: string;
        payload: Record<string, unknown>;
        occurred_at: Date;
        attempts: number;
        next_attempt_at: Date | null;
        published_at: Date | null;
      }>
    >(
      `
        SELECT
          id,
          aggregate_id,
          event_type,
          payload,
          occurred_at,
          attempts,
          next_attempt_at,
          published_at
        FROM outbox_messages
        WHERE published_at IS NULL
          AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        ORDER BY occurred_at ASC
        LIMIT ?
        FOR UPDATE SKIP LOCKED
      `,
      [now, limit],
    );

    return rows.map((row) =>
      OutboxMessage.rehydrate({
        id: row.id,
        aggregateId: row.aggregate_id,
        eventType: row.event_type,
        payload: row.payload,
        occurredAt: row.occurred_at,
        attempts: row.attempts,
        nextAttemptAt: row.next_attempt_at ?? undefined,
        publishedAt: row.published_at ?? undefined,
      }),
    );
  }

  async countPendingOutbox(): Promise<number> {
    const rows = await this.em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM outbox_messages WHERE published_at IS NULL`,
    );
    return Number(rows[0]?.count ?? 0);
  }

  async updateOutbox(message: OutboxMessage): Promise<void> {
    let entity = await this.em.findOne(OutboxMessageEntity, { id: message.id });
    if (!entity) {
      entity = outboxToEntity(message);
      this.em.persist(entity);
      return;
    }
    applyOutboxToEntity(message, entity);
  }
}
