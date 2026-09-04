import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import type { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionStatus } from '../../src/domain/enums/index.js';
import { OpenWalletUseCase } from '../../src/application/use-cases/open-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case.js';
import { PublishOutboxWorker } from '../../src/application/workers/publish-outbox.worker.js';
import { MikroOrmUnitOfWork } from '../../src/infrastructure/persistence/unit-of-work.js';
import { MetricsService } from '../../src/infrastructure/observability/metrics.service.js';
import {
  closeTestOrm,
  getTestOrm,
  resetDatabase,
} from '../integration/setup.js';
import {
  assertWalletLedgerInvariant,
  isConcurrencyAvailable,
  runParallel,
} from './helpers.js';

const runConcurrency = isConcurrencyAvailable();

describe.skipIf(!runConcurrency)('Concurrency (PostgreSQL real)', () => {
  let orm: MikroORM;
  let unitOfWork: MikroOrmUnitOfWork;
  let openWallet: OpenWalletUseCase;
  let processWager: ProcessWagerTransactionUseCase;
  let publishOutbox: PublishOutboxWorker;

  beforeAll(async () => {
    orm = await getTestOrm();
    unitOfWork = new MikroOrmUnitOfWork(orm.em);
    openWallet = new OpenWalletUseCase(unitOfWork);
    processWager = new ProcessWagerTransactionUseCase(unitOfWork);
    publishOutbox = new PublishOutboxWorker(unitOfWork, new MetricsService());
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  beforeEach(async () => {
    await resetDatabase(orm);
  });

  test('two concurrent 80.00 BRL bets on 100.00 balance produce one debit', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const results = await runParallel(2, async (index) =>
      processWager.execute({
        providerId: 'provider-a',
        externalTransactionId: `bet-hot-${index}`,
        idempotencyKey: `provider-a:bet-hot-${index}`,
        playerId,
        walletId: wallet.id,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '80.00', currency: 'BRL' },
      }),
    );

    const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed);
    const rejected = results.filter((r) => r.status === WagerTransactionStatus.Rejected);
    expect(processed.length).toBe(1);
    expect(rejected.length).toBe(1);

    const em = orm.em.fork();
    const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
      [wallet.id],
    );
    expect(walletRow[0]?.balance).toBe('20.00');

    const debitCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid AND direction = 'DEBIT'`,
      [wallet.id],
    );
    expect(Number(debitCount[0]?.count)).toBe(1);

    await assertWalletLedgerInvariant(orm, wallet.id, 'BRL');
  });

  test('50 parallel identical bets produce a single financial effect', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const command = {
      providerId: 'provider-a',
      externalTransactionId: 'bet-idempotent-50',
      idempotencyKey: 'provider-a:bet-idempotent-50',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET' as const,
      money: { amount: '10.00', currency: 'BRL' as const },
    };

    const results = await runParallel(50, async () => processWager.execute(command));
    const processed = results.filter((r) => r.status === WagerTransactionStatus.Processed);
    const replays = results.filter((r) => r.idempotentReplay);
    expect(processed.length).toBe(50);
    expect(replays.length).toBe(49);

    const em = orm.em.fork();
    const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
      [wallet.id],
    );
    expect(walletRow[0]?.balance).toBe('90.00');

    const debitCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid AND direction = 'DEBIT'`,
      [wallet.id],
    );
    expect(Number(debitCount[0]?.count)).toBe(1);

    await assertWalletLedgerInvariant(orm, wallet.id, 'BRL');
  });

  test('parallel bets on different wallets do not interfere', async () => {
    const wallets = await runParallel(5, async () => {
      const playerId = uuidv7();
      return openWallet.execute({
        playerId,
        initialBalance: { amount: '30.00', currency: 'BRL' },
      });
    });

    await runParallel(wallets.length, async (index) => {
      const wallet = wallets[index]!;
      return processWager.execute({
        providerId: 'provider-a',
        externalTransactionId: `bet-multi-${index}`,
        idempotencyKey: `provider-a:bet-multi-${index}`,
        playerId: wallet.playerId,
        walletId: wallet.id,
        roundId: 'round-1',
        gameId: 'game-1',
        kind: 'BET',
        money: { amount: '10.00', currency: 'BRL' },
      });
    });

    for (const wallet of wallets) {
      const em = orm.em.fork();
      const row = await em.getConnection().execute<Array<{ balance: string }>>(
        `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
        [wallet.id],
      );
      expect(row[0]?.balance).toBe('20.00');
      await assertWalletLedgerInvariant(orm, wallet.id, 'BRL');
    }
  });

  test('two concurrent outbox publishers do not lose events', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '10.00', currency: 'BRL' },
    });

    await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-outbox-publisher',
      idempotencyKey: 'provider-a:bet-outbox-publisher',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '3.00', currency: 'BRL' },
    });

    const publisherA = new PublishOutboxWorker(unitOfWork, new MetricsService());
    const publisherB = new PublishOutboxWorker(unitOfWork, new MetricsService());

    await Promise.all([publisherA.runOnce(), publisherB.runOnce()]);

    const em = orm.em.fork();
    const unpublished = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM outbox_messages WHERE published_at IS NULL`,
    );
    expect(Number(unpublished[0]?.count)).toBe(0);
  });
});
