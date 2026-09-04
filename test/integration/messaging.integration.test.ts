import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import type { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionStatus } from '../../src/domain/enums/index.js';
import { OpenWalletUseCase } from '../../src/application/use-cases/open-wallet.use-case.js';
import { ProcessInboundWagerMessageUseCase } from '../../src/application/use-cases/process-inbound-wager-message.use-case.js';
import { PublishOutboxWorker } from '../../src/application/workers/publish-outbox.worker.js';
import { WagerTransactionConsumer } from '../../src/application/workers/wager-transaction.consumer.js';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service.js';
import { MikroOrmUnitOfWork } from '../../src/infrastructure/persistence/unit-of-work.js';
import type { WagerTransactionRequestedMessage } from '../../src/application/dtos/messaging.dtos.js';
import {
  closeTestOrm,
  getTestOrm,
  resetDatabase,
} from './setup.js';
import {
  getMessagingConfig,
  isMessagingAvailable,
  purgeMessagingQueues,
  receiveIntegrationEvents,
  sendWagerMessage,
} from './messaging-setup.js';

const runMessaging = isMessagingAvailable();

function buildMessage(input: {
  messageId: string;
  walletId: string;
  playerId: string;
  externalTransactionId: string;
  amount?: string;
}): WagerTransactionRequestedMessage {
  return {
    messageId: input.messageId,
    type: 'WagerTransactionRequested',
    occurredAt: new Date().toISOString(),
    data: {
      providerId: 'provider-a',
      externalTransactionId: input.externalTransactionId,
      idempotencyKey: `provider-a:${input.externalTransactionId}`,
      playerId: input.playerId,
      walletId: input.walletId,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: input.amount ?? '10.00', currency: 'BRL' },
    },
  };
}

describe.skipIf(!runMessaging)('Messaging integration (PostgreSQL + MiniStack SQS)', () => {
  let orm: MikroORM;
  let unitOfWork: MikroOrmUnitOfWork;
  let openWallet: OpenWalletUseCase;
  let processInbound: ProcessInboundWagerMessageUseCase;
  let publishOutbox: PublishOutboxWorker;
  let consumer: WagerTransactionConsumer;

  beforeAll(async () => {
    orm = await getTestOrm();
    unitOfWork = new MikroOrmUnitOfWork(orm.em);
    openWallet = new OpenWalletUseCase(unitOfWork);
    processInbound = new ProcessInboundWagerMessageUseCase(unitOfWork);
    publishOutbox = new PublishOutboxWorker(unitOfWork, new MetricsService());
    consumer = new WagerTransactionConsumer(processInbound, new MetricsService());
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  beforeEach(async () => {
    await resetDatabase(orm);
    await purgeMessagingQueues();
  });

  test('processes inbound message with inbox dedup in the same transaction', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const messageId = `msg-${uuidv7()}`;
    const message = buildMessage({
      messageId,
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'sqs-bet-1',
    });

    const first = await processInbound.execute({
      consumerName: getMessagingConfig().consumerName,
      message,
    });
    expect(first.disposition).toBe('ack');
    expect(first.duplicate).toBe(false);
    expect(first.transaction?.status).toBe(WagerTransactionStatus.Processed);

    const second = await processInbound.execute({
      consumerName: getMessagingConfig().consumerName,
      message,
    });
    expect(second.disposition).toBe('ack');
    expect(second.duplicate).toBe(true);

    const em = orm.em.fork();
    const ledgerCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [wallet.id],
    );
    const inboxCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM inbox_messages WHERE message_id = ?`,
      [messageId],
    );

    expect(Number(ledgerCount[0]?.count)).toBe(2);
    expect(Number(inboxCount[0]?.count)).toBe(1);
  });

  test('consumer acks only after commit and survives redelivery', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '50.00', currency: 'BRL' },
    });

    const messageId = `msg-${uuidv7()}`;
    const message = buildMessage({
      messageId,
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'sqs-bet-redelivery',
      amount: '5.00',
    });

    await sendWagerMessage(JSON.stringify(message), messageId, wallet.id);
    await consumer.pollOnce();

    const em = orm.em.fork();
    const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
      [wallet.id],
    );
    expect(walletRow[0]?.balance).toBe('45.00');

    await sendWagerMessage(JSON.stringify(message), `${messageId}:redelivery`, wallet.id);
    await consumer.pollOnce();

    const ledgerCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [wallet.id],
    );
    expect(Number(ledgerCount[0]?.count)).toBe(2);
  });

  test('publishes outbox events after crash recovery', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '20.00', currency: 'BRL' },
    });

    const messageId = `msg-${uuidv7()}`;
    const message = buildMessage({
      messageId,
      walletId: wallet.id,
      playerId,
      externalTransactionId: 'sqs-outbox-crash',
      amount: '4.00',
    });

    await processInbound.execute({
      consumerName: getMessagingConfig().consumerName,
      message,
    });

    const em = orm.em.fork();
    const unpublished = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM outbox_messages WHERE published_at IS NULL`,
    );
    expect(Number(unpublished[0]?.count)).toBeGreaterThan(0);

    const publishedCount = await publishOutbox.runOnce();
    expect(publishedCount).toBeGreaterThan(0);

    const events = await receiveIntegrationEvents(10);
    expect(events.length).toBeGreaterThan(0);
    expect(events.some((body) => body.includes('WagerTransactionProcessed'))).toBe(true);

    const stillUnpublished = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM outbox_messages WHERE published_at IS NULL`,
    );
    expect(Number(stillUnpublished[0]?.count)).toBe(0);
  });

  test('routes permanently invalid messages to DLQ disposition', async () => {
    const result = await processInbound.execute({
      consumerName: getMessagingConfig().consumerName,
      message: {
        messageId: 'bad-msg',
        type: 'WagerTransactionRequested',
        occurredAt: new Date().toISOString(),
        data: {
          providerId: 'provider-a',
          externalTransactionId: 'bad',
          idempotencyKey: 'provider-a:bad',
          playerId: uuidv7(),
          walletId: uuidv7(),
          roundId: 'round-1',
          gameId: 'game-1',
          kind: 'NOT_SUPPORTED',
          money: { amount: '1.00', currency: 'BRL' },
        },
      },
    });

    expect(result.disposition).toBe('dlq');
  });
});
