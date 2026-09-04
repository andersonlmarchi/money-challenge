import { Injectable } from '@nestjs/common';
import {
  Counter,
  Gauge,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry = new Registry();

  readonly wagerTransactionsTotal: Counter<'status' | 'kind'>;
  readonly idempotencyDuplicatesTotal: Counter;
  readonly reconciliationMismatchTotal: Counter;
  readonly dlqMessagesTotal: Counter;
  readonly outboxPendingGauge: Gauge;
  readonly processingLatencySeconds: Histogram<'kind'>;

  constructor() {
    collectDefaultMetrics({ register: this.registry });

    this.wagerTransactionsTotal = new Counter({
      name: 'wager_transactions_total',
      help: 'Total wager transactions processed by status and kind',
      labelNames: ['status', 'kind'] as const,
      registers: [this.registry],
    });

    this.idempotencyDuplicatesTotal = new Counter({
      name: 'idempotency_duplicates_total',
      help: 'Total idempotent replays detected',
      registers: [this.registry],
    });

    this.reconciliationMismatchTotal = new Counter({
      name: 'reconciliation_mismatch_total',
      help: 'Total wallet reconciliation mismatches detected',
      registers: [this.registry],
    });

    this.dlqMessagesTotal = new Counter({
      name: 'dlq_messages_total',
      help: 'Total messages routed to DLQ',
      registers: [this.registry],
    });

    this.outboxPendingGauge = new Gauge({
      name: 'outbox_pending_messages',
      help: 'Current count of unpublished outbox messages',
      registers: [this.registry],
    });

    this.processingLatencySeconds = new Histogram({
      name: 'wager_processing_latency_seconds',
      help: 'Wager transaction processing latency',
      labelNames: ['kind'] as const,
      buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
      registers: [this.registry],
    });
  }

  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  recordWagerResult(kind: string, status: string, idempotentReplay: boolean): void {
    this.wagerTransactionsTotal.inc({ status, kind });
    if (idempotentReplay) {
      this.idempotencyDuplicatesTotal.inc();
    }
  }

  recordReconciliationMismatch(): void {
    this.reconciliationMismatchTotal.inc();
  }

  recordDlqMessage(): void {
    this.dlqMessagesTotal.inc();
  }

  setOutboxPending(count: number): void {
    this.outboxPendingGauge.set(count);
  }
}
