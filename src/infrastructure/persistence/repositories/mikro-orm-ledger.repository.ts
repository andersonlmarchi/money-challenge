import { EntityManager, QueryOrder } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { LedgerRepository } from '../../../application/ports/ledger.repository.js';
import { WalletLedgerEntry } from '../../../domain/ledger/index.js';
import { WalletLedgerEntryEntity } from '../entities/wallet-ledger-entry.entity.js';
import { ledgerEntryToDomain, ledgerEntryToEntity } from '../mappers/wallet-ledger-entry.mapper.js';

@Injectable()
export class MikroOrmLedgerRepository implements LedgerRepository {
  constructor(private readonly em: EntityManager) {}

  async save(entry: WalletLedgerEntry): Promise<void> {
    const existing = await this.em.findOne(WalletLedgerEntryEntity, { id: entry.id });
    if (existing) {
      return;
    }
    this.em.persist(ledgerEntryToEntity(entry));
  }

  async findByWalletId(
    walletId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<{ entries: WalletLedgerEntry[]; nextCursor?: string }> {
    const limit = options?.limit ?? 50;
    const qb = this.em
      .createQueryBuilder(WalletLedgerEntryEntity, 'l')
      .where({ walletId })
      .orderBy({ createdAt: QueryOrder.ASC, id: QueryOrder.ASC })
      .limit(limit + 1);

    if (options?.cursor) {
      const [createdAt, id] = decodeCursor(options.cursor);
      qb.andWhere('(l.created_at, l.id) > (?, ?)', [createdAt, id]);
    }

    const entities = await qb.getResultList();
    const hasMore = entities.length > limit;
    const page = hasMore ? entities.slice(0, limit) : entities;
    const entries = page.map(ledgerEntryToDomain);
    const last = page.at(-1);

    return {
      entries,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : undefined,
    };
  }

  async sumBalanceFromLedger(walletId: string, currency: string): Promise<string | null> {
    const rows = await this.em.getConnection().execute<Array<{ net: string | null }>>(
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
        WHERE wallet_id = ? AND currency = ?
      `,
      [walletId, currency],
    );

    return rows[0]?.net ?? null;
  }
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id })).toString(
    'base64url',
  );
}

function decodeCursor(cursor: string): [Date, string] {
  const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as {
    createdAt: string;
    id: string;
  };
  return [new Date(parsed.createdAt), parsed.id];
}
