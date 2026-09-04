import { Module } from '@nestjs/common';
import { ProcessInboundWagerMessageUseCase } from '../../application/use-cases/process-inbound-wager-message.use-case.js';
import { PublishOutboxWorker } from '../../application/workers/publish-outbox.worker.js';
import { WagerTransactionConsumer } from '../../application/workers/wager-transaction.consumer.js';
import { PersistenceModule } from '../../infrastructure/persistence/persistence.module.js';

@Module({
  imports: [PersistenceModule],
  providers: [
    ProcessInboundWagerMessageUseCase,
    WagerTransactionConsumer,
    PublishOutboxWorker,
  ],
  exports: [ProcessInboundWagerMessageUseCase, WagerTransactionConsumer, PublishOutboxWorker],
})
export class MessagingModule {}
