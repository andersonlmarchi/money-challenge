import { Migration } from '@mikro-orm/migrations';

export class Migration20260303180000_initial_schema extends Migration {
  override async up(): Promise<void> {
    this.addSql(`
      CREATE TABLE wallets (
        id UUID PRIMARY KEY,
        player_id UUID NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance NUMERIC(19, 2) NOT NULL DEFAULT 0,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT wallets_player_currency_unique UNIQUE (player_id, currency),
        CONSTRAINT wallets_balance_non_negative CHECK (balance >= 0),
        CONSTRAINT wallets_version_positive CHECK (version >= 1)
      );
    `);

    this.addSql(`
      CREATE TABLE wager_transactions (
        id UUID PRIMARY KEY,
        provider_id VARCHAR(255) NOT NULL,
        external_transaction_id VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(512) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        wallet_id UUID NOT NULL REFERENCES wallets (id),
        player_id UUID NOT NULL,
        round_id VARCHAR(255) NOT NULL,
        game_id VARCHAR(255) NOT NULL,
        kind VARCHAR(32) NOT NULL,
        amount NUMERIC(19, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        reference_external_transaction_id VARCHAR(255) NULL,
        reference_transaction_id UUID NULL REFERENCES wager_transactions (id),
        status VARCHAR(32) NOT NULL,
        failure_code VARCHAR(64) NULL,
        observed_balance NUMERIC(19, 2) NULL,
        processed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT wager_transactions_idempotency_key_unique UNIQUE (idempotency_key),
        CONSTRAINT wager_transactions_provider_external_unique UNIQUE (provider_id, external_transaction_id),
        CONSTRAINT wager_transactions_amount_non_negative CHECK (amount >= 0),
        CONSTRAINT wager_transactions_kind_valid CHECK (
          kind IN ('OPENING', 'BET', 'WIN', 'LOSS', 'REFUND', 'ROLLBACK')
        ),
        CONSTRAINT wager_transactions_status_valid CHECK (
          status IN ('PENDING', 'PENDING_REFERENCE', 'PROCESSED', 'REJECTED', 'FAILED')
        )
      );
    `);

    this.addSql(`
      CREATE INDEX wager_transactions_wallet_id_idx ON wager_transactions (wallet_id);
      CREATE INDEX wager_transactions_reference_external_idx
        ON wager_transactions (provider_id, reference_external_transaction_id)
        WHERE reference_external_transaction_id IS NOT NULL;
      CREATE INDEX wager_transactions_pending_reference_idx
        ON wager_transactions (status, created_at)
        WHERE status = 'PENDING_REFERENCE';
    `);

    this.addSql(`
      CREATE UNIQUE INDEX wager_transactions_reversal_once_idx
        ON wager_transactions (reference_transaction_id, kind)
        WHERE kind IN ('REFUND', 'ROLLBACK')
          AND status = 'PROCESSED'
          AND reference_transaction_id IS NOT NULL;
    `);

    this.addSql(`
      CREATE TABLE wallet_ledger_entries (
        id UUID PRIMARY KEY,
        wallet_id UUID NOT NULL REFERENCES wallets (id),
        transaction_id UUID NOT NULL REFERENCES wager_transactions (id),
        direction VARCHAR(16) NOT NULL,
        amount NUMERIC(19, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        balance_before NUMERIC(19, 2) NOT NULL,
        balance_after NUMERIC(19, 2) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT wallet_ledger_wallet_transaction_unique UNIQUE (wallet_id, transaction_id),
        CONSTRAINT wallet_ledger_direction_valid CHECK (direction IN ('DEBIT', 'CREDIT')),
        CONSTRAINT wallet_ledger_amount_positive CHECK (amount > 0),
        CONSTRAINT wallet_ledger_structural_balance CHECK (
          (direction = 'DEBIT' AND balance_before - amount = balance_after)
          OR (direction = 'CREDIT' AND balance_before + amount = balance_after)
        )
      );
    `);

    this.addSql(`
      CREATE INDEX wallet_ledger_entries_wallet_id_created_at_idx
        ON wallet_ledger_entries (wallet_id, created_at, id);
    `);

    this.addSql(`
      CREATE OR REPLACE FUNCTION prevent_wallet_ledger_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'wallet_ledger_entries is immutable: % operations are forbidden', TG_OP;
      END;
      $$ LANGUAGE plpgsql;
    `);

    this.addSql(`
      CREATE TRIGGER wallet_ledger_entries_immutable
      BEFORE UPDATE OR DELETE ON wallet_ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_wallet_ledger_mutation();
    `);

    this.addSql(`
      CREATE TABLE inbox_messages (
        message_id VARCHAR(255) NOT NULL,
        consumer_name VARCHAR(255) NOT NULL,
        payload_hash VARCHAR(64) NOT NULL,
        received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        processed_at TIMESTAMPTZ NULL,
        CONSTRAINT inbox_messages_consumer_message_unique UNIQUE (consumer_name, message_id)
      );
    `);

    this.addSql(`
      CREATE TABLE outbox_messages (
        id UUID PRIMARY KEY,
        aggregate_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(255) NOT NULL,
        payload JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TIMESTAMPTZ NULL,
        published_at TIMESTAMPTZ NULL,
        CONSTRAINT outbox_messages_attempts_non_negative CHECK (attempts >= 0)
      );
    `);

    this.addSql(`
      CREATE INDEX outbox_messages_pending_idx
        ON outbox_messages (next_attempt_at, occurred_at)
        WHERE published_at IS NULL;
    `);
  }

  override async down(): Promise<void> {
    this.addSql(`DROP TRIGGER IF EXISTS wallet_ledger_entries_immutable ON wallet_ledger_entries;`);
    this.addSql(`DROP FUNCTION IF EXISTS prevent_wallet_ledger_mutation;`);
    this.addSql(`DROP TABLE IF EXISTS outbox_messages;`);
    this.addSql(`DROP TABLE IF EXISTS inbox_messages;`);
    this.addSql(`DROP TABLE IF EXISTS wallet_ledger_entries;`);
    this.addSql(`DROP TABLE IF EXISTS wager_transactions;`);
    this.addSql(`DROP TABLE IF EXISTS wallets;`);
  }
}
