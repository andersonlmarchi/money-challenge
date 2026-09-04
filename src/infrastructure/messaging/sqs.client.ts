import {
  CreateQueueCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
  SendMessageCommand,
  SQSClient,
  ChangeMessageVisibilityCommand,
} from '@aws-sdk/client-sqs';
import type { MessagingConfig } from './messaging.config.js';

export interface ReceivedSqsMessage {
  receiptHandle: string;
  sqsMessageId: string;
  body: string;
  receiveCount: number;
}

export class SqsClientWrapper {
  readonly client: SQSClient;

  constructor(private readonly config: MessagingConfig) {
    this.client = new SQSClient({
      region: config.region,
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ensureQueues(): Promise<void> {
    const dlqUrl = await this.ensureFifoQueue('wager-transactions-dlq.fifo');
    const dlqArn = await this.getQueueArn(dlqUrl);

    await this.ensureFifoQueue('wager-transactions.fifo', {
      RedrivePolicy: JSON.stringify({
        deadLetterTargetArn: dlqArn,
        maxReceiveCount: String(this.config.maxReceiveCount),
      }),
    });

    await this.ensureFifoQueue('integration-events.fifo');
  }

  async receiveMessages(
    queueUrl: string,
    maxMessages: number,
    waitTimeSeconds = 1,
  ): Promise<ReceivedSqsMessage[]> {
    const response = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: maxMessages,
        WaitTimeSeconds: waitTimeSeconds,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
        MessageAttributeNames: ['All'],
      }),
    );

    return (response.Messages ?? []).map((message) => ({
      receiptHandle: message.ReceiptHandle!,
      sqsMessageId: message.MessageId!,
      body: message.Body ?? '',
      receiveCount: Number(message.Attributes?.ApproximateReceiveCount ?? 1),
    }));
  }

  async deleteMessage(queueUrl: string, receiptHandle: string): Promise<void> {
    await this.client.send(
      new DeleteMessageCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
      }),
    );
  }

  async changeMessageVisibility(
    queueUrl: string,
    receiptHandle: string,
    visibilityTimeoutSeconds: number,
  ): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: visibilityTimeoutSeconds,
      }),
    );
  }

  async sendFifoMessage(input: {
    queueUrl: string;
    body: string;
    messageGroupId: string;
    messageDeduplicationId: string;
  }): Promise<void> {
    await this.client.send(
      new SendMessageCommand({
        QueueUrl: input.queueUrl,
        MessageBody: input.body,
        MessageGroupId: input.messageGroupId,
        MessageDeduplicationId: input.messageDeduplicationId,
      }),
    );
  }

  async sendToDlq(body: string, messageGroupId: string, messageDeduplicationId: string): Promise<void> {
    await this.sendFifoMessage({
      queueUrl: this.config.wagerTransactionsDlqUrl,
      body,
      messageGroupId,
      messageDeduplicationId,
    });
  }

  private async ensureFifoQueue(
    queueName: string,
    attributes?: Record<string, string>,
  ): Promise<string> {
    const response = await this.client.send(
      new CreateQueueCommand({
        QueueName: queueName,
        Attributes: {
          FifoQueue: 'true',
          ContentBasedDeduplication: 'false',
          ...attributes,
        },
      }),
    );

    if (!response.QueueUrl) {
      throw new Error(`Failed to create or resolve queue ${queueName}`);
    }

    return response.QueueUrl;
  }

  private async getQueueArn(queueUrl: string): Promise<string> {
    const response = await this.client.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['QueueArn'],
      }),
    );

    const arn = response.Attributes?.QueueArn;
    if (!arn) {
      throw new Error(`Queue ARN not found for ${queueUrl}`);
    }

    return arn;
  }
}
