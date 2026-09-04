import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { loadMessagingConfig } from '../../infrastructure/messaging/messaging.config.js';
import { SqsClientWrapper } from '../../infrastructure/messaging/sqs.client.js';
import { MessagingGateway } from '../../infrastructure/persistence/gateways/messaging.gateway.js';
import { MikroOrmUnitOfWork } from '../../infrastructure/persistence/unit-of-work.js';

@Injectable()
export class PublishOutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PublishOutboxWorker.name);
  private readonly config = loadMessagingConfig();
  private readonly sqs = new SqsClientWrapper(this.config);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly unitOfWork: MikroOrmUnitOfWork) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('Outbox publisher disabled');
      return;
    }

    void this.sqs.ensureQueues().catch((error: unknown) => {
      this.logger.error('Failed to bootstrap SQS queues for outbox publisher', error);
    });

    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.logger.error('Outbox publisher failed', error);
      });
    }, this.config.outboxPollIntervalMs);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  async runOnce(): Promise<number> {
    const now = new Date();
    let publishedCount = 0;

    await this.unitOfWork.transactional(async (em) => {
      const gateway = new MessagingGateway(em);
      const pending = await gateway.claimPendingOutboxMessages(now, this.config.outboxBatchSize);

      for (const message of pending) {
        try {
          await this.sqs.sendFifoMessage({
            queueUrl: this.config.integrationEventsQueueUrl,
            body: JSON.stringify(message.payload),
            messageGroupId: message.aggregateId,
            messageDeduplicationId: message.id,
          });
          message.markPublished(now);
          await gateway.updateOutbox(message);
          publishedCount += 1;
        } catch (error) {
          message.scheduleRetry(now);
          await gateway.updateOutbox(message);
          this.logger.error(`Failed to publish outbox message id=${message.id}`, error);
        }
      }
    });

    return publishedCount;
  }
}
