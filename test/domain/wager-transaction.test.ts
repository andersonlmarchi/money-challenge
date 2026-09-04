import { describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import {
  FailureCode,
  LedgerDirection,
  WagerTransactionKind,
  WagerTransactionStatus,
} from '../../src/domain/enums/index';
import { InvalidTransactionStateError } from '../../src/domain/errors/index';
import { Money } from '../../src/domain/money/money';
import { WagerTransaction } from '../../src/domain/wager-transaction/wager-transaction';

function createTransaction(kind: WagerTransactionKind): WagerTransaction {
  return WagerTransaction.create({
    id: uuidv7(),
    providerId: 'provider-a',
    externalTransactionId: `ext-${uuidv7()}`,
    idempotencyKey: `provider-a:${uuidv7()}`,
    payloadHash: 'hash-a',
    walletId: uuidv7(),
    playerId: uuidv7(),
    roundId: 'round-1',
    gameId: 'game-1',
    kind,
    money: Money.from({ amount: '10.00', currency: 'BRL' }),
    referenceExternalTransactionId:
      kind === WagerTransactionKind.Refund || kind === WagerTransactionKind.Rollback
        ? 'bet-123'
        : undefined,
  });
}

describe('WagerTransaction', () => {
  test('starts in PENDING', () => {
    const tx = createTransaction(WagerTransactionKind.Bet);
    expect(tx.status).toBe(WagerTransactionStatus.Pending);
    expect(tx.isTerminal()).toBe(false);
  });

  test('BET affects balance and debits ledger direction', () => {
    const tx = createTransaction(WagerTransactionKind.Bet);
    expect(tx.affectsBalance()).toBe(true);
    expect(tx.ledgerDirectionFor()).toBe(LedgerDirection.Debit);
  });

  test('LOSS does not affect balance', () => {
    const tx = createTransaction(WagerTransactionKind.Loss);
    expect(tx.affectsBalance()).toBe(false);
    expect(() => tx.ledgerDirectionFor()).toThrow(InvalidTransactionStateError);
  });

  test('REJECTED does not affect balance', () => {
    const tx = createTransaction(WagerTransactionKind.Bet);
    const balance = Money.from({ amount: '50.00', currency: 'BRL' });
    tx.reject(FailureCode.InsufficientBalance, balance, new Date());
    expect(tx.affectsBalance()).toBe(false);
    expect(tx.observedBalance?.toAmountString()).toBe('50.00');
  });

  test('ROLLBACK inverts reference ledger direction', () => {
    const bet = createTransaction(WagerTransactionKind.Bet);
    bet.markProcessed(undefined, Money.from({ amount: '90.00', currency: 'BRL' }), new Date());

    const rollback = createTransaction(WagerTransactionKind.Rollback);
    expect(rollback.ledgerDirectionFor(bet)).toBe(LedgerDirection.Credit);
  });

  test('terminal transactions cannot transition', () => {
    const tx = createTransaction(WagerTransactionKind.Bet);
    tx.markProcessed(undefined, Money.from({ amount: '90.00', currency: 'BRL' }), new Date());

    expect(() => tx.markPendingReference()).toThrow(InvalidTransactionStateError);
    expect(() =>
      tx.reject(FailureCode.InsufficientBalance, undefined, new Date()),
    ).toThrow(InvalidTransactionStateError);
  });

  test('matches payload hash', () => {
    const tx = createTransaction(WagerTransactionKind.Win);
    expect(tx.matchesPayload('hash-a')).toBe(true);
    expect(tx.matchesPayload('hash-b')).toBe(false);
  });

  test('rejects OPENING creation', () => {
    expect(() =>
      WagerTransaction.create({
        id: uuidv7(),
        providerId: 'provider-a',
        externalTransactionId: 'ext-1',
        idempotencyKey: 'key-1',
        payloadHash: 'hash',
        walletId: uuidv7(),
        playerId: uuidv7(),
        roundId: 'round-1',
        gameId: 'game-1',
        kind: WagerTransactionKind.Opening,
        money: Money.from({ amount: '1.00', currency: 'BRL' }),
      }),
    ).toThrow(InvalidTransactionStateError);
  });
});
