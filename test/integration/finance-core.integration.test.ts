import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import type { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionStatus } from '../../src/domain/enums/index.js';
import { IdempotencyConflictError } from '../../src/domain/errors/index.js';
import { OpenWalletUseCase } from '../../src/application/use-cases/open-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case.js';
import { MikroOrmUnitOfWork } from '../../src/infrastructure/persistence/unit-of-work.js';
import {
  closeTestOrm,
  getTestOrm,
  isDatabaseAvailable,
  resetDatabase,
} from './setup.js';

const runIntegration = isDatabaseAvailable();

describe.skipIf(!runIntegration)('Finance core integration (PostgreSQL)', () => {
  let orm: MikroORM;
  let openWallet: OpenWalletUseCase;
  let processWager: ProcessWagerTransactionUseCase;

  beforeAll(async () => {
    orm = await getTestOrm();
    const unitOfWork = new MikroOrmUnitOfWork(orm.em);
    openWallet = new OpenWalletUseCase(unitOfWork);
    processWager = new ProcessWagerTransactionUseCase(unitOfWork);
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  beforeEach(async () => {
    await resetDatabase(orm);
  });

  test('opens wallet with OPENING ledger and outbox atomically', async () => {
    const playerId = uuidv7();
    const result = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    expect(result.balance.amount).toBe('100.00');
    expect(result.version).toBe(1);

    const em = orm.em.fork();
    const ledgerCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [result.id],
    );
    const outboxCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM outbox_messages WHERE aggregate_id = ?`,
      [result.id],
    );

    expect(Number(ledgerCount[0]?.count)).toBe(1);
    expect(Number(outboxCount[0]?.count)).toBeGreaterThanOrEqual(2);
  });

  test('processes BET with atomic debit, ledger and observed balance', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const bet = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-1',
      idempotencyKey: 'provider-a:bet-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    });

    expect(bet.status).toBe(WagerTransactionStatus.Processed);
    expect(bet.balance?.amount).toBe('75.00');
    expect(bet.idempotentReplay).toBe(false);

    const em = orm.em.fork();
    const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
      [wallet.id],
    );
    expect(walletRow[0]?.balance).toBe('75.00');
  });

  test('rejects BET with insufficient balance and persists observed balance', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '20.00', currency: 'BRL' },
    });

    const rejected = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-2',
      idempotencyKey: 'provider-a:bet-2',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '25.00', currency: 'BRL' },
    });

    expect(rejected.status).toBe(WagerTransactionStatus.Rejected);
    expect(rejected.balance?.amount).toBe('20.00');

    const em = orm.em.fork();
    const ledgerCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [wallet.id],
    );
    expect(Number(ledgerCount[0]?.count)).toBe(1);
  });

  test('replays idempotent request with original observed balance', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const command = {
      providerId: 'provider-a',
      externalTransactionId: 'bet-3',
      idempotencyKey: 'provider-a:bet-3',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET' as const,
      money: { amount: '10.00', currency: 'BRL' as const },
    };

    const first = await processWager.execute(command);
    const second = await processWager.execute(command);

    expect(first.idempotentReplay).toBe(false);
    expect(second.idempotentReplay).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(second.balance?.amount).toBe('90.00');

    await expect(
      processWager.execute({
        ...command,
        money: { amount: '11.00', currency: 'BRL' },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflictError);

    const em = orm.em.fork();
    const ledgerCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [wallet.id],
    );
    expect(Number(ledgerCount[0]?.count)).toBe(2);
  });

  test('processes LOSS without ledger entry', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '50.00', currency: 'BRL' },
    });

    const loss = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'loss-1',
      idempotencyKey: 'provider-a:loss-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'LOSS',
      money: { amount: '0.00', currency: 'BRL' },
    });

    expect(loss.status).toBe(WagerTransactionStatus.Processed);
    expect(loss.balance?.amount).toBe('50.00');

    const em = orm.em.fork();
    const ledgerCount = await em.getConnection().execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [wallet.id],
    );
    expect(Number(ledgerCount[0]?.count)).toBe(1);
  });

  test('ledger entries are immutable in PostgreSQL', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '10.00', currency: 'BRL' },
    });

    const em = orm.em.fork();
    const ledger = await em.getConnection().execute<Array<{ id: string }>>(
      `SELECT id FROM wallet_ledger_entries WHERE wallet_id = ?::uuid LIMIT 1`,
      [wallet.id],
    );
    const ledgerId = ledger[0]?.id;
    expect(ledgerId).toBeDefined();

    await expect(
      em.getConnection().execute(
        `UPDATE wallet_ledger_entries SET amount = 1.00 WHERE id = ?::uuid`,
        [ledgerId],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
  });
});
