import { EntityManager } from '@mikro-orm/postgresql';
import { Injectable } from '@nestjs/common';
import type { WalletRepository } from '../../../application/ports/wallet.repository.js';
import { Wallet } from '../../../domain/wallet/index.js';
import { WalletEntity } from '../entities/wallet.entity.js';
import { applyWalletToEntity, walletToDomain, walletToEntity } from '../mappers/wallet.mapper.js';

@Injectable()
export class MikroOrmWalletRepository implements WalletRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { id });
    return entity ? walletToDomain(entity) : null;
  }

  async findByPlayerAndCurrency(playerId: string, currency: string): Promise<Wallet | null> {
    const entity = await this.em.findOne(WalletEntity, { playerId, currency });
    return entity ? walletToDomain(entity) : null;
  }

  async save(wallet: Wallet): Promise<void> {
    let entity = await this.em.findOne(WalletEntity, { id: wallet.id });
    if (!entity) {
      entity = walletToEntity(wallet);
      this.em.persist(entity);
      return;
    }
    applyWalletToEntity(wallet, entity);
  }
}
