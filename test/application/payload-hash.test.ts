import { describe, expect, test } from 'bun:test';
import {
  buildWagerPayloadHashInput,
  computePayloadHash,
} from '../../src/application/utils/payload-hash.js';
import { toCanonicalJson } from '../../src/application/utils/canonical-json.js';

describe('payload hash', () => {
  test('uses canonical JSON with sorted keys', () => {
    const canonical = toCanonicalJson({ b: 1, a: { d: 2, c: 3 } });
    expect(canonical).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  test('produces stable sha256 hash', () => {
    const payload = buildWagerPayloadHashInput({
      providerId: 'provider-a',
      externalTransactionId: 'tx-1',
      playerId: 'player-1',
      walletId: 'wallet-1',
      roundId: 'round-1',
      gameId: 'game-1',
      kind: 'BET',
      money: { amount: '10.00', currency: 'BRL' },
    });

    const first = computePayloadHash(payload);
    const second = computePayloadHash(payload);
    expect(first).toBe(second);
    expect(first).toHaveLength(64);
  });
});
