import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { WagerTransactionProcessor } from '../services/wager-transaction.processor.js';
import { FinanceGateway } from '../../infrastructure/persistence/gateways/finance.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';

const BATCH_SIZE = 20;
const POLL_INTERVAL_MS = 5_000;

@Injectable()
export class ReprocessPendingReferenceWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReprocessPendingReferenceWorker.name);
  private readonly processor = new WagerTransactionProcessor();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error('Pending reference worker failed', error);
      });
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runOnce(): Promise<void> {
    const now = new Date();

    await this.unitOfWork.transactional(async (em) => {
      const gateway = new FinanceGateway(em);
      const pending = await gateway.findDuePendingReferenceTransactions(now, BATCH_SIZE);

      for (const transaction of pending) {
        await this.processor.retryPendingReference(gateway, transaction, now);
      }
    });
  }
}
