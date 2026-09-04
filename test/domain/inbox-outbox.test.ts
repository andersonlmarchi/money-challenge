import { describe, expect, test } from 'bun:test';
import { WagerTransactionProcessed } from '../../src/domain/events/wagering-events';
import { InboxMessage } from '../../src/domain/inbox/inbox-message';
import { OutboxMessage } from '../../src/domain/outbox/outbox-message';
import { Money } from '../../src/domain/money/money';

describe('InboxMessage', () => {
  test('tracks processed state', () => {
    const message = InboxMessage.receive({
      messageId: 'msg-1',
      consumerName: 'wager-consumer',
      payloadHash: 'abc',
    });

    expect(message.isProcessed()).toBe(false);
    const at = new Date('2026-01-01T00:00:00.000Z');
    message.markProcessed(at);
    expect(message.isProcessed()).toBe(true);
    expect(message.processedAt).toEqual(at);
  });
});

describe('OutboxMessage', () => {
  test('enqueues integration event and supports retry scheduling', () => {
    const event = WagerTransactionProcessed.create({
      eventId: 'evt-1',
      aggregateId: 'wallet-1',
      correlationId: 'corr-1',
      occurredAt: new Date('2026-01-01T00:00:00.000Z'),
      data: {
        transactionId: 'tx-1',
        walletId: 'wallet-1',
        kind: 'BET',
        status: 'PROCESSED',
        observedBalance: Money.from({ amount: '10.00', currency: 'BRL' }).toJSON(),
      },
    });

    const outbox = OutboxMessage.enqueue(event);
    expect(outbox.isPending()).toBe(true);
    expect(outbox.isDue(new Date('2026-01-01T00:00:01.000Z'))).toBe(true);

    outbox.scheduleRetry(new Date('2026-01-01T00:00:00.000Z'));
    expect(outbox.attempts).toBe(1);
    expect(outbox.isDue(new Date('2026-01-01T00:00:00.500Z'))).toBe(false);

    outbox.markPublished(new Date('2026-01-01T00:00:02.000Z'));
    expect(outbox.isPending()).toBe(false);
  });
});
