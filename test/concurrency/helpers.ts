import type { MikroORM } from '@mikro-orm/postgresql';
import { Money } from '../../src/domain/money/index.js';

export async function assertWalletLedgerInvariant(
  orm: MikroORM,
  walletId: string,
  currency: string,
): Promise<void> {
  const em = orm.em.fork();
  const walletRow = await em.getConnection().execute<Array<{ balance: string }>>(
    `SELECT balance::text FROM wallets WHERE id = ?::uuid`,
    [walletId],
  );
  const ledgerRow = await em.getConnection().execute<Array<{ net: string }>>(
    `
      SELECT COALESCE(
        SUM(
          CASE
            WHEN direction = 'CREDIT' THEN amount
            WHEN direction = 'DEBIT' THEN -amount
          END
        ),
        0
      )::text AS net
      FROM wallet_ledger_entries
      WHERE wallet_id = ?::uuid AND currency = ?
    `,
    [walletId, currency],
  );

  const stored = walletRow[0]?.balance;
  const calculated = ledgerRow[0]?.net ?? '0.00';
  if (!stored) {
    throw new Error(`Wallet ${walletId} not found`);
  }

  const difference = Money.rehydrate({ amount: stored, currency }).subtract(
    Money.rehydrate({ amount: calculated, currency }),
  );
  if (!difference.isZero()) {
    throw new Error(
      `Ledger invariant violated for wallet ${walletId}: stored=${stored} calculated=${calculated}`,
    );
  }
}

export async function runParallel<T>(count: number, fn: (index: number) => Promise<T>): Promise<T[]> {
  return Promise.all(Array.from({ length: count }, (_, index) => fn(index)));
}

export function isConcurrencyAvailable(): boolean {
  return process.env['RUN_INTEGRATION_TESTS'] === 'true';
}
