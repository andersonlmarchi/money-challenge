import { Migration } from '@mikro-orm/migrations';

export class Migration20260304000000_reference_retry_columns extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      ALTER TABLE wager_transactions
      ADD COLUMN reference_retry_attempts INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN next_reference_attempt_at TIMESTAMPTZ NULL;
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_reference_retry_idx
        ON wager_transactions (status, next_reference_attempt_at, created_at)
        WHERE status = 'PENDING_REFERENCE';
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP INDEX IF EXISTS wager_transactions_reference_retry_idx;`);
    this.addSql(`
      ALTER TABLE wager_transactions
      DROP COLUMN IF EXISTS next_reference_attempt_at,
      DROP COLUMN IF EXISTS reference_retry_attempts;
    `);
  }
}
