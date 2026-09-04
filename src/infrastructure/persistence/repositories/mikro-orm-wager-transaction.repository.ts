import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { WagerTransactionRepository } from '../../../application/ports/wager-transaction.repository.js';
import { WagerTransaction } from '../../../domain/wager-transaction/index.js';
import { WagerTransactionEntity } from '../entities/wager-transaction.entity.js';
import {
  applyWagerTransactionToEntity,
  wagerTransactionToDomain,
  wagerTransactionToEntity,
} from '../mappers/wager-transaction.mapper.js';

@Injectable()
export class MikroOrmWagerTransactionRepository implements WagerTransactionRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { id });
    return entity ? wagerTransactionToDomain(entity) : null;
  }

  async findByIdempotencyKey(idempotencyKey: string): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, { idempotencyKey });
    return entity ? wagerTransactionToDomain(entity) : null;
  }

  async findByProviderExternalId(
    providerId: string,
    externalTransactionId: string,
  ): Promise<WagerTransaction | null> {
    const entity = await this.em.findOne(WagerTransactionEntity, {
      providerId,
      externalTransactionId,
    });
    return entity ? wagerTransactionToDomain(entity) : null;
  }

  async save(transaction: WagerTransaction): Promise<void> {
    let entity = await this.em.findOne(WagerTransactionEntity, { id: transaction.id });
    if (!entity) {
      entity = wagerTransactionToEntity(transaction);
      this.em.persist(entity);
      return;
    }
    applyWagerTransactionToEntity(transaction, entity);
  }
}
