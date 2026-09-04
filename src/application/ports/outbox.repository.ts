import type { OutboxMessage } from '../../domain/outbox/index.js';

export interface OutboxRepository {
  save(message: OutboxMessage): Promise<void>;
  findPendingDue(now: Date, limit: number): Promise<OutboxMessage[]>;
}

export const OUTBOX_REPOSITORY = Symbol('OUTBOX_REPOSITORY');
