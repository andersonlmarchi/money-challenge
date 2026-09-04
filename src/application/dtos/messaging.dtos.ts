export interface WagerTransactionRequestedData {
  providerId: string;
  externalTransactionId: string;
  idempotencyKey: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
}

export interface WagerTransactionRequestedMessage {
  messageId: string;
  type: 'WagerTransactionRequested';
  occurredAt: string;
  data: WagerTransactionRequestedData;
}

export type InboundMessageDisposition = 'ack' | 'retry' | 'dlq';

export interface ProcessInboundWagerMessageResult {
  disposition: InboundMessageDisposition;
  duplicate: boolean;
  transaction?: {
    transactionId: string;
    status: string;
    idempotentReplay: boolean;
  };
  reason?: string;
}

export interface ProcessInboundWagerMessageInput {
  consumerName: string;
  message: WagerTransactionRequestedMessage;
}
