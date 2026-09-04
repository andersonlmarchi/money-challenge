import { MikroORM } from '@mikro-orm/postgresql';
import config from '../../src/infrastructure/persistence/mikro-orm.config.js';

let orm: MikroORM | undefined;

export async function getTestOrm(): Promise<MikroORM> {
  if (!orm) {
    orm = await MikroORM.init(config);
    await orm.getMigrator().up();
  }
  return orm;
}

export async function closeTestOrm(): Promise<void> {
  if (orm) {
    await orm.close(true);
    orm = undefined;
  }
}

export async function resetDatabase(ormInstance: MikroORM): Promise<void> {
  const connection = ormInstance.em.getConnection();
  await connection.execute(`
    TRUNCATE TABLE
      wallet_ledger_entries,
      outbox_messages,
      inbox_messages,
      wager_transactions,
      wallets
    RESTART IDENTITY CASCADE
  `);
}

export function isDatabaseAvailable(): boolean {
  return process.env['RUN_INTEGRATION_TESTS'] === 'true';
}
