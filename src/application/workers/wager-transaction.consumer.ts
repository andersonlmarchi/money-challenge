import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { loadMessagingConfig } from '../../infrastructure/messaging/messaging.config.js';
import { SqsClientWrapper } from '../../infrastructure/messaging/sqs.client.js';
import {
  InvalidMessageError,
  parseWagerTransactionMessage,
  ProcessInboundWagerMessageUseCase,
} from '../use-cases/process-inbound-wager-message.use-case.js';

const VISIBILITY_BACKOFF_SECONDS = 30;

interface InFlightMessage {
  receiptHandle: string;
  body: string;
  receiveCount: number;
}

@Injectable()
export class WagerTransactionConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WagerTransactionConsumer.name);
  private readonly config = loadMessagingConfig();
  private readonly sqs = new SqsClientWrapper(this.config);
  private timer: ReturnType<typeof setInterval> | undefined;
  private shuttingDown = false;
  private inFlight = 0;
  private readonly inFlightMessages = new Map<string, InFlightMessage>();

  constructor(private readonly processInbound: ProcessInboundWagerMessageUseCase) {}

  onModuleInit(): void {
    if (!this.config.enabled) {
      this.logger.log('Messaging consumer disabled');
      return;
    }

    void this.sqs.ensureQueues().catch((error: unknown) => {
      this.logger.error('Failed to bootstrap SQS queues', error);
    });

    this.timer = setInterval(() => {
      void this.poll().catch((error: unknown) => {
        this.logger.error('Consumer poll failed', error);
      });
    }, this.config.pollIntervalMs);
  }

  async onModuleDestroy(): Promise<void> {
    this.shuttingDown = true;
    if (this.timer) {
      clearInterval(this.timer);
    }

    while (this.inFlight > 0) {
      await sleep(100);
    }

    for (const [receiptHandle, message] of this.inFlightMessages) {
      await this.sqs
        .changeMessageVisibility(
          this.config.wagerTransactionsQueueUrl,
          receiptHandle,
          0,
        )
        .catch((error: unknown) => {
          this.logger.error('Failed to release in-flight message visibility', error);
        });
      this.logger.warn(
        `Returned message to queue on shutdown messageId=${message.body.slice(0, 64)}`,
      );
    }
  }

  async pollOnce(): Promise<void> {
    await this.poll();
  }

  private async poll(): Promise<void> {
    if (this.shuttingDown) {
      return;
    }

    const messages = await this.sqs.receiveMessages(this.config.wagerTransactionsQueueUrl, 1);
    for (const message of messages) {
      if (this.shuttingDown) {
        await this.sqs.changeMessageVisibility(
          this.config.wagerTransactionsQueueUrl,
          message.receiptHandle,
          0,
        );
        continue;
      }

      this.inFlight += 1;
      this.inFlightMessages.set(message.receiptHandle, message);

      try {
        await this.handleMessage(message.body, message.receiptHandle, message.receiveCount);
      } finally {
        this.inFlight -= 1;
        this.inFlightMessages.delete(message.receiptHandle);
      }
    }
  }

  private async handleMessage(
    body: string,
    receiptHandle: string,
    receiveCount: number,
  ): Promise<void> {
    let parsedMessageId = 'unknown';

    try {
      const parsed = parseWagerTransactionMessage(body);
      parsedMessageId = parsed.messageId;

      const result = await this.processInbound.execute({
        consumerName: this.config.consumerName,
        message: parsed,
      });

      if (result.disposition === 'ack') {
        await this.sqs.deleteMessage(this.config.wagerTransactionsQueueUrl, receiptHandle);
        this.logger.log(
          `Acked message messageId=${parsedMessageId} duplicate=${result.duplicate}`,
        );
        return;
      }

      if (result.disposition === 'dlq') {
        await this.moveToDlq(body, parsed.messageId, receiptHandle, result.reason);
        return;
      }

      await this.retryMessage(body, receiptHandle, receiveCount, parsedMessageId);
    } catch (error) {
      if (error instanceof InvalidMessageError) {
        await this.moveToDlq(body, parsedMessageId, receiptHandle, error.message);
        return;
      }

      this.logger.error(`Transient failure messageId=${parsedMessageId}`, error);
      await this.retryMessage(body, receiptHandle, receiveCount, parsedMessageId);
    }
  }

  private async moveToDlq(
    body: string,
    messageId: string,
    receiptHandle: string,
    reason?: string,
  ): Promise<void> {
    if (body) {
      await this.sqs.sendToDlq(body, messageId, `${messageId}:dlq`);
    }
    await this.sqs.deleteMessage(this.config.wagerTransactionsQueueUrl, receiptHandle);
    this.logger.warn(`Moved message to DLQ messageId=${messageId} reason=${reason ?? 'unknown'}`);
  }

  private async retryMessage(
    body: string,
    receiptHandle: string,
    receiveCount: number,
    messageId: string,
  ): Promise<void> {
    if (receiveCount >= this.config.maxReceiveCount) {
      await this.moveToDlq(body, messageId, receiptHandle, 'max receive count exceeded');
      return;
    }

    const visibilityTimeout = Math.min(
      VISIBILITY_BACKOFF_SECONDS * receiveCount,
      900,
    );

    await this.sqs.changeMessageVisibility(
      this.config.wagerTransactionsQueueUrl,
      receiptHandle,
      visibilityTimeout,
    );
    this.logger.warn(
      `Scheduled retry messageId=${messageId} receiveCount=${receiveCount} visibility=${visibilityTimeout}s`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
