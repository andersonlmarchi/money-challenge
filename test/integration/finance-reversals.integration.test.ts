import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import type { MikroORM } from '@mikro-orm/postgresql';
import {
  FailureCode,
  WagerTransactionStatus,
} from '../../src/domain/enums/index.js';
import { OpenWalletUseCase } from '../../src/application/use-cases/open-wallet.use-case.js';
import { ProcessWagerTransactionUseCase } from '../../src/application/use-cases/process-wager-transaction.use-case.js';
import { ReconcileWalletUseCase } from '../../src/application/use-cases/reconcile-wallet.use-case.js';
import { ReprocessPendingReferenceWorker } from '../../src/application/workers/reprocess-pending-reference.worker.js';
import { MikroOrmUnitOfWork } from '../../src/infrastructure/persistence/unit-of-work.js';
import {
  closeTestOrm,
  getTestOrm,
  isDatabaseAvailable,
  resetDatabase,
} from './setup.js';

const runIntegration = isDatabaseAvailable();

describe.skipIf(!runIntegration)('Finance reversals integration (PostgreSQL)', () => {
  let orm: MikroORM;
  let openWallet: OpenWalletUseCase;
  let processWager: ProcessWagerTransactionUseCase;
  let reconcileWallet: ReconcileWalletUseCase;
  let pendingReferenceWorker: ReprocessPendingReferenceWorker;
  let unitOfWork: MikroOrmUnitOfWork;

  beforeAll(async () => {
    orm = await getTestOrm();
    unitOfWork = new MikroOrmUnitOfWork(orm.em);
    openWallet = new OpenWalletUseCase(unitOfWork);
    processWager = new ProcessWagerTransactionUseCase(unitOfWork);
    reconcileWallet = new ReconcileWalletUseCase(unitOfWork);
    pendingReferenceWorker = new ReprocessPendingReferenceWorker(unitOfWork);
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  beforeEach(async () => {
    await resetDatabase(orm);
  });

  test('processes REFUND after BET and restores balance', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const bet = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-refund-1',
      idempotencyKey: 'provider-a:bet-refund-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '40.00', currency: 'BRL' },
    });
    expect(bet.status).toBe(WagerTransactionStatus.Processed);

    const refund = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'refund-1',
      idempotencyKey: 'provider-a:refund-1',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'REFUND',
      money: { amount: '40.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-refund-1',
    });

    expect(refund.status).toBe(WagerTransactionStatus.Processed);
    expect(refund.balance?.amount).toBe('100.00');

    const em = orm.em.fork();
    const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
      [wallet.id],
    );
    expect(walletRow[0]?.balance).toBe('100.00');
  });

  test('holds REFUND as PENDING_REFERENCE until reference arrives and worker reprocesses', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const refundFirst = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'refund-early',
      idempotencyKey: 'provider-a:refund-early',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'REFUND',
      money: { amount: '30.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-late',
    });

    expect(refundFirst.status).toBe(WagerTransactionStatus.PendingReference);

    const bet = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-late',
      idempotencyKey: 'provider-a:bet-late',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '30.00', currency: 'BRL' },
    });
    expect(bet.status).toBe(WagerTransactionStatus.Processed);

    const em = orm.em.fork();
    await em.getConnection().execute(
      `UPDATE wager_transactions SET next_reference_attempt_at = NOW() - INTERVAL '1 second' WHERE external_transaction_id = ?`,
      ['refund-early'],
    );

    await pendingReferenceWorker.runOnce();

    const refundRow = await em.getConnection().execute<
      Array<{ status: string; observed_balance: string | null }>
    >(
      `SELECT status, observed_balance::text FROM wager_transactions WHERE external_transaction_id = ?`,
      ['refund-early'],
    );

    expect(refundRow[0]?.status).toBe(WagerTransactionStatus.Processed);
    expect(refundRow[0]?.observed_balance).toBe('100.00');
  });

  test('rejects duplicate REFUND for the same BET', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-double-refund',
      idempotencyKey: 'provider-a:bet-double-refund',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '20.00', currency: 'BRL' },
    });

    const firstRefund = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'refund-a',
      idempotencyKey: 'provider-a:refund-a',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'REFUND',
      money: { amount: '20.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-double-refund',
    });
    expect(firstRefund.status).toBe(WagerTransactionStatus.Processed);

    const secondRefund = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'refund-b',
      idempotencyKey: 'provider-a:refund-b',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'REFUND',
      money: { amount: '20.00', currency: 'BRL' },
      referenceExternalTransactionId: 'bet-double-refund',
    });

    expect(secondRefund.status).toBe(WagerTransactionStatus.Rejected);
    expect(secondRefund.failureCode).toBe(FailureCode.ReferenceAlreadyReversed);
  });

  test('processes ROLLBACK of WIN as debit', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '50.00', currency: 'BRL' },
    });

    await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-win-rollback',
      idempotencyKey: 'provider-a:bet-win-rollback',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '10.00', currency: 'BRL' },
    });

    await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'win-rollback',
      idempotencyKey: 'provider-a:win-rollback',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'WIN',
      money: { amount: '25.00', currency: 'BRL' },
    });

    const rollback = await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'rollback-win',
      idempotencyKey: 'provider-a:rollback-win',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'ROLLBACK',
      money: { amount: '25.00', currency: 'BRL' },
      referenceExternalTransactionId: 'win-rollback',
    });

    expect(rollback.status).toBe(WagerTransactionStatus.Processed);
    expect(rollback.balance?.amount).toBe('40.00');
  });

  test('reconciles wallet when stored balance matches ledger sum', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    await processWager.execute({
      providerId: 'provider-a',
      externalTransactionId: 'bet-reconcile',
      idempotencyKey: 'provider-a:bet-reconcile',
      playerId,
      walletId: wallet.id,
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '15.00', currency: 'BRL' },
    });

    const result = await reconcileWallet.execute({ walletId: wallet.id });

    expect(result.consistent).toBe(true);
    expect(result.storedBalance.amount).toBe('85.00');
    expect(result.calculatedBalance.amount).toBe('85.00');
    expect(result.difference.amount).toBe('0.00');
    expect(result.checkedEntries).toBe(2);
  });
});
