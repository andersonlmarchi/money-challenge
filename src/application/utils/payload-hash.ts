import { createHash } from 'node:crypto';
import { toCanonicalJson } from './canonical-json.js';

export function computePayloadHash(payload: Record<string, unknown>): string {
  return createHash('sha256').update(toCanonicalJson(payload)).digest('hex');
}

export function buildWagerPayloadHashInput(input: {
  providerId: string;
  externalTransactionId: string;
  playerId: string;
  walletId: string;
  roundId: string;
  gameId: string;
  kind: string;
  money: { amount: string; currency: string };
  referenceExternalTransactionId?: string;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    providerId: input.providerId,
    externalTransactionId: input.externalTransactionId,
    playerId: input.playerId,
    walletId: input.walletId,
    roundId: input.roundId,
    gameId: input.gameId,
    kind: input.kind,
    money: input.money,
  };

  if (input.referenceExternalTransactionId !== undefined) {
    payload.referenceExternalTransactionId = input.referenceExternalTransactionId;
  }

  return payload;
}
