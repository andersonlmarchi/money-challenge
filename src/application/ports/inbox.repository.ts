import type { InboxMessage } from '../../domain/inbox/index.js';

export interface InboxRepository {
  findByConsumerAndMessageId(
    consumerName: string,
    messageId: string,
  ): Promise<InboxMessage | null>;
  save(message: InboxMessage): Promise<void>;
}

export const INBOX_REPOSITORY = Symbol('INBOX_REPOSITORY');
