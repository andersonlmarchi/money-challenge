import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import type { UnitOfWork } from '../../application/ports/unit-of-work.js';

@Injectable()
export class MikroOrmUnitOfWork implements UnitOfWork {
  constructor(private readonly em: EntityManager) {}

  async transactional<T>(work: (em: EntityManager) => Promise<T>): Promise<T> {
    return this.em.transactional(work);
  }

  getEntityManager(): EntityManager {
    return this.em;
  }
}
