import { Injectable } from '@nestjs/common';
import { EntityManager } from '@mikro-orm/postgresql';
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs';
import { loadMessagingConfig } from '../messaging/messaging.config.js';
import { SqsClientWrapper } from '../messaging/sqs.client.js';

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  checks: Record<string, { status: 'up' | 'down'; detail?: string }>;
}

@Injectable()
export class HealthService {
  private readonly sqs = new SqsClientWrapper(loadMessagingConfig());

  constructor(private readonly em: EntityManager) {}

  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async ready(): Promise<HealthStatus> {
    const checks: HealthStatus['checks'] = {};

    try {
      await this.em.getConnection().execute('SELECT 1');
      checks['postgres'] = { status: 'up' };
    } catch (error) {
      checks['postgres'] = {
        status: 'down',
        detail: error instanceof Error ? error.message : 'unknown error',
      };
    }

    try {
      const config = loadMessagingConfig();
      await this.sqs.client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.wagerTransactionsQueueUrl,
          AttributeNames: ['QueueArn'],
        }),
      );
      checks['sqs'] = { status: 'up' };
    } catch (error) {
      checks['sqs'] = {
        status: 'down',
        detail: error instanceof Error ? error.message : 'unknown error',
      };
    }

    const allUp = Object.values(checks).every((check) => check.status === 'up');
    return {
      status: allUp ? 'ok' : 'error',
      checks,
    };
  }
}
