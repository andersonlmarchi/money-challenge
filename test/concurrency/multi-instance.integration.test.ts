import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import type { MikroORM } from '@mikro-orm/postgresql';
import { WagerTransactionStatus } from '../../src/domain/enums/index.js';
import { OpenWalletUseCase } from '../../src/application/use-cases/open-wallet.use-case.js';
import { MikroOrmUnitOfWork } from '../../src/infrastructure/persistence/unit-of-work.js';
import {
  closeTestOrm,
  getTestOrm,
  resetDatabase,
} from '../integration/setup.js';
import { assertWalletLedgerInvariant, isConcurrencyAvailable } from './helpers.js';

const runConcurrency = isConcurrencyAvailable();

describe.skipIf(!runConcurrency)('Multi-instance concurrency', () => {
  let orm: MikroORM;
  let unitOfWork: MikroOrmUnitOfWork;
  let openWallet: OpenWalletUseCase;

  beforeAll(async () => {
    orm = await getTestOrm();
    unitOfWork = new MikroOrmUnitOfWork(orm.em);
    openWallet = new OpenWalletUseCase(unitOfWork);
  });

  afterAll(async () => {
    await closeTestOrm();
  });

  beforeEach(async () => {
    await resetDatabase(orm);
  });

  test('three child processes disputing the same wallet keep correctness', async () => {
    const playerId = uuidv7();
    const wallet = await openWallet.execute({
      playerId,
      initialBalance: { amount: '100.00', currency: 'BRL' },
    });

    const workerPath = new URL('./scripts/process-bet.worker.ts', import.meta.url).pathname;
    const processes = await Promise.all(
      [0, 1, 2].map((index) =>
        Bun.spawn({
          cmd: ['bun', workerPath, wallet.id, playerId, `bet-instance-${index}`],
          stdout: 'pipe',
          stderr: 'pipe',
          env: { ...process.env, NODE_ENV: 'production' },
        }),
      ),
    );

    const outputs = await Promise.all(
      processes.map(async (proc) => {
        const [stdout, stderr, exitCode] = await Promise.all([
          new Response(proc.stdout).text(),
          new Response(proc.stderr).text(),
          proc.exited,
        ]);
        if (exitCode !== 0) {
          throw new Error(
            `Worker exited with code ${exitCode}\nstdout:\n${stdout}\nstderr:\n${stderr}`,
          );
        }
        const jsonLine = stdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.startsWith('{'))
          .at(-1);
        if (!jsonLine) {
          throw new Error(`Worker produced no JSON output\nstdout:\n${stdout}\nstderr:\n${stderr}`);
        }
        return JSON.parse(jsonLine);
      }),
    );

    const processed = outputs.filter(
      (result) => result.status === WagerTransactionStatus.Processed,
    );
    const rejected = outputs.filter(
      (result) => result.status === WagerTransactionStatus.Rejected,
    );

    expect(processed.length).toBe(1);
    expect(rejected.length).toBe(2);

    const em = orm.em.fork();
    const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
      `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
      [wallet.id],
    );
    expect(walletRow[0]?.balance).toBe('20.00');
    await assertWalletLedgerInvariant(orm, wallet.id, 'BRL');
  }, 30_000);
});
