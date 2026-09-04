import { loadMessagingConfig } from '../../src/infrastructure/messaging/messaging.config.js';
import { SqsClientWrapper } from '../../src/infrastructure/messaging/sqs.client.js';
import {
  PurgeQueueCommand,
  ReceiveMessageCommand,
} from '@aws-sdk/client-sqs';

let sqsClient: SqsClientWrapper | undefined;

export function isMessagingAvailable(): boolean {
  return (
    process.env['RUN_INTEGRATION_TESTS'] === 'true' &&
    process.env['RUN_MESSAGING_TESTS'] === 'true'
  );
}

export function getMessagingConfig() {
  return loadMessagingConfig();
}

export async function getSqsClient(): Promise<SqsClientWrapper> {
  if (!sqsClient) {
    sqsClient = new SqsClientWrapper(getMessagingConfig());
    await sqsClient.ensureQueues();
  }
  return sqsClient;
}

export async function purgeMessagingQueues(): Promise<void> {
  const client = await getSqsClient();
  const config = getMessagingConfig();
  await client.client.send(new PurgeQueueCommand({ QueueUrl: config.wagerTransactionsQueueUrl }));
  await client.client.send(new PurgeQueueCommand({ QueueUrl: config.integrationEventsQueueUrl }));
  await client.client.send(new PurgeQueueCommand({ QueueUrl: config.wagerTransactionsDlqUrl }));
}

export async function sendWagerMessage(body: string, messageId: string, groupId: string): Promise<void> {
  const client = await getSqsClient();
  const config = getMessagingConfig();
  await client.sendFifoMessage({
    queueUrl: config.wagerTransactionsQueueUrl,
    body,
    messageGroupId: groupId,
    messageDeduplicationId: messageId,
  });
}

export async function receiveIntegrationEvents(maxMessages = 10): Promise<string[]> {
  const client = await getSqsClient();
  const config = getMessagingConfig();
  const response = await client.client.send(
    new ReceiveMessageCommand({
      QueueUrl: config.integrationEventsQueueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 1,
    }),
  );

  return (response.Messages ?? []).map((message) => message.Body ?? '');
}
