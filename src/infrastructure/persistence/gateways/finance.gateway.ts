import type { EntityManager } from '@mikro-orm/postgresql';
import { LockMode } from '@mikro-orm/core';
import {
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../../domain/enums/index.js';
import { WagerTransaction } from '../../../domain/wager-transaction/index.js';
import { Wallet } from '../../../domain/wallet/index.js';
import { WalletLedgerEntry } from '../../../domain/ledger/index.js';
import { OutboxMessage } from '../../../domain/outbox/index.js';
import {
  applyWagerTransactionToEntity,
  wagerTransactionToDomain,
  wagerTransactionToEntity,
} from '../mappers/wager-transaction.mapper.js';
import { applyWalletToEntity, walletToDomain, walletToEntity } from '../mappers/wallet.mapper.js';
import { ledgerEntryToEntity } from '../mappers/wallet-ledger-entry.mapper.js';
import { outboxToEntity } from '../mappers/outbox-message.mapper.js';
import { WalletEntity } from '../entities/wallet.entity.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';

export interface AtomicWalletUpdateResult {
  balance: string;
  version: number;
  updatedAt: Date;
}

export class FinanceGateway {
  constructor(private readonly em: EntityManager) {}

  async saveWallet(wallet: Wallet): Promise<void> {
    let entity = await this.em.findOne(WalletEntity, { id: wallet.id });
    if (!entity) {
      this.em.persist(walletToEntity(wallet));
    } else {
      applyWalletToEntity(wallet, entity);
    }
    await this.em.flush();
  }

  async findWalletByIdForUpdate(walletId: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(
      WalletEntity,
      { id: walletId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    return entity ? walletToDomain(entity) : null;
  }

  async findReferenceTransaction(
    providerId: string,
    referenceExternalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      providerId,
      externalTransactionId: referenceExternalTransactionId,
    });
    return entity ? wagerTransactionToDomain(entity) : null;
  }

  async findProcessedReversal(
    referenceTransactionId: string,
    kind: WagerTransactionKind.Refund | WagerTransactionKind.Rollback,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      referenceTransactionId,
      kind,
      status: WagerTransactionStatus.Processed,
    });
    return entity ? wagerTransactionToDomain(entity) : null;
  }

  async findDuePendingReferenceTransactions(
    now: Date,
    limit: number,
  ): Promise<WagerTransaction[]> {
    const entities = await this.em.find(
      WagerTransactionEntity,
      {
        status: WagerTransactionStatus.PendingReference,
        $or: [{ nextReferenceAttemptAt: null }, { nextReferenceAttemptAt: { $lte: now } }],
      },
      {
        orderBy: { createdAt: 'ASC' },
        limit,
        lockMode: LockMode.PESSIMISTIC_WRITE,
      },
    );
    return entities.map(wagerTransactionToDomain);
  }

  async getWalletBalance(walletId: string): Promise<string | null> {
    const rows = await this.em.execute<Array<{ balance: string }>>(
      `SELECT balance::text AS balance FROM wallets WHERE id = ?::uuid`,
      [walletId],
    );
    return rows[0]?.balance ?? null;
  }

  async sumLedgerNet(walletId: string, currency: string): Promise<string> {
    const rows = await this.em.execute<Array<{ net: string }>>(
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
    return rows[0]?.net ?? '0.00';
  }

  async countLedgerEntries(walletId: string): Promise<number> {
    const rows = await this.em.execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE wallet_id = ?::uuid`,
      [walletId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async findWalletById(walletId: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id: walletId });
    return entity ? walletToDomain(entity) : null;
  }

  async findWalletByPlayerAndCurrency(
    playerId: string,
    currency: string,
  ): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { playerId, currency });
    return entity ? walletToDomain(entity) : null;
  }

  async insertWagerTransactionOrConflict(
    transaction: WagerTransaction,
  ): Promise<'inserted' | 'conflict'> {
    const entity = wagerTransactionToEntity(transaction);
    const rows = await this.em.execute<Array<{ id: string }>>(
      `
        INSERT INTO wager_transactions (
          id, provider_id, external_transaction_id, idempotency_key, payload_hash,
          wallet_id, player_id, round_id, game_id, kind, amount, currency,
          reference_external_transaction_id, reference_transaction_id, status,
          failure_code, observed_balance, processed_at, created_at,
          reference_retry_attempts, next_reference_attempt_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id
      `,
      [
        entity.id,
        entity.providerId,
        entity.externalTransactionId,
        entity.idempotencyKey,
        entity.payloadHash,
        entity.walletId,
        entity.playerId,
        entity.roundId,
        entity.gameId,
        entity.kind,
        entity.amount,
        entity.currency,
        entity.referenceExternalTransactionId ?? null,
        entity.referenceTransactionId ?? null,
        entity.status,
        entity.failureCode ?? null,
        entity.observedBalance ?? null,
        entity.processedAt ?? null,
        entity.createdAt,
        entity.referenceRetryAttempts ?? 0,
        entity.nextReferenceAttemptAt ?? null,
      ],
    );

    return rows.length > 0 ? 'inserted' : 'conflict';
  }

  async findWagerTransactionByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { idempotencyKey });
    return entity ? wagerTransactionToDomain(entity) : null;
  }

  async updateWagerTransaction(transaction: WagerTransaction): Promise<void> {
    const entity = await this.em.findOneOrFail(WagerTransactionEntity, { id: transaction.id });
    applyWagerTransactionToEntity(transaction, entity);
  }

  async atomicDebit(
    walletId: string,
    amount: string,
  ): Promise<AtomicWalletUpdateResult | null> {
    const rows = await this.em.execute<
      Array<{ balance: string; version: number; updated_at: Date }>
    >(
      `
        UPDATE wallets
        SET balance = balance - ?::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE id = ?::uuid
          AND balance >= ?::numeric
        RETURNING balance::text AS balance, version, updated_at
      `,
      [amount, walletId, amount],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      balance: row.balance,
      version: row.version,
      updatedAt: row.updated_at,
    };
  }

  async atomicCredit(
    walletId: string,
    amount: string,
  ): Promise<AtomicWalletUpdateResult | null> {
    const rows = await this.em.execute<
      Array<{ balance: string; version: number; updated_at: Date }>
    >(
      `
        UPDATE wallets
        SET balance = balance + ?::numeric,
            version = version + 1,
            updated_at = NOW()
        WHERE id = ?::uuid
        RETURNING balance::text AS balance, version, updated_at
      `,
      [amount, walletId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    return {
      balance: row.balance,
      version: row.version,
      updatedAt: row.updated_at,
    };
  }

  async insertLedgerEntry(entry: WalletLedgerEntry): Promise<void> {
    this.em.persist(ledgerEntryToEntity(entry));
  }

  async insertOutbox(message: OutboxMessage): Promise<void> {
    this.em.persist(outboxToEntity(message));
  }

  async countLedgerEntriesForTransaction(transactionId: string): Promise<number> {
    const rows = await this.em.execute<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count FROM wallet_ledger_entries WHERE transaction_id = ?::uuid`,
      [transactionId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countOutboxForAggregate(aggregateId: string, eventType: string): Promise<number> {
    const rows = await this.em.execute<Array<{ count: string }>>(
      `
        SELECT COUNT(*)::text AS count
        FROM outbox_messages
        WHERE aggregate_id = ? AND event_type = ?
      `,
      [aggregateId, eventType],
    );
    return Number(rows[0]?.count ?? 0);
  }
}

export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}
