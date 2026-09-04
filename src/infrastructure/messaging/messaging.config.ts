export interface MessagingConfig {
  region: string;
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
  consumerName: string;
  wagerTransactionsQueueUrl: string;
  wagerTransactionsDlqUrl: string;
  integrationEventsQueueUrl: string;
  maxReceiveCount: number;
  pollIntervalMs: number;
  outboxPollIntervalMs: number;
  outboxBatchSize: number;
  enabled: boolean;
}

export function loadMessagingConfig(): MessagingConfig {
  return {
    region: process.env['AWS_REGION'] ?? 'us-east-1',
    endpoint: process.env['SQS_ENDPOINT'] ?? 'http://localhost:4566',
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? 'test',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? 'test',
    consumerName: process.env['SQS_CONSUMER_NAME'] ?? 'wager-transactions-consumer',
    wagerTransactionsQueueUrl:
      process.env['SQS_WAGER_TRANSACTIONS_QUEUE_URL'] ??
      'http://localhost:4566/000000000000/wager-transactions.fifo',
    wagerTransactionsDlqUrl:
      process.env['SQS_WAGER_TRANSACTIONS_DLQ_URL'] ??
      'http://localhost:4566/000000000000/wager-transactions-dlq.fifo',
    integrationEventsQueueUrl:
      process.env['SQS_INTEGRATION_EVENTS_QUEUE_URL'] ??
      'http://localhost:4566/000000000000/integration-events.fifo',
    maxReceiveCount: Number(process.env['SQS_MAX_RECEIVE_COUNT'] ?? 5),
    pollIntervalMs: Number(process.env['SQS_POLL_INTERVAL_MS'] ?? 1_000),
    outboxPollIntervalMs: Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? 1_000),
    outboxBatchSize: Number(process.env['OUTBOX_BATCH_SIZE'] ?? 20),
    enabled: process.env['MESSAGING_ENABLED'] !== 'false',
  };
}
