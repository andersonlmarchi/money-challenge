import { describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import { Money } from '../../src/domain/money/money';
import { Wallet } from '../../src/domain/wallet/wallet';
import {
  CurrencyMismatchError,
  InsufficientBalanceError,
} from '../../src/domain/errors/index';

describe('Wallet', () => {
  const walletId = uuidv7();
  const playerId = uuidv7();

  test('opens with initial balance and version 1', () => {
    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
    });

    expect(wallet.balance.toAmountString()).toBe('100.00');
    expect(wallet.version).toBe(1);
    expect(wallet.currency).toBe('BRL');
  });

  test('debits and increments version', () => {
    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '100.00', currency: 'BRL' }),
    });
    const at = new Date('2026-01-01T00:00:00.000Z');

    const result = wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), at);

    expect(result.balanceBefore.toAmountString()).toBe('100.00');
    expect(result.balanceAfter.toAmountString()).toBe('75.00');
    expect(wallet.balance.toAmountString()).toBe('75.00');
    expect(wallet.version).toBe(2);
    expect(wallet.updatedAt).toEqual(at);
  });

  test('credits and increments version', () => {
    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '50.00', currency: 'BRL' }),
    });
    const at = new Date('2026-01-01T00:00:00.000Z');

    wallet.credit(Money.from({ amount: '10.00', currency: 'BRL' }), at);

    expect(wallet.balance.toAmountString()).toBe('60.00');
    expect(wallet.version).toBe(2);
  });

  test('rejects debit with insufficient balance', () => {
    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '20.00', currency: 'BRL' }),
    });

    expect(() =>
      wallet.debit(Money.from({ amount: '25.00', currency: 'BRL' }), new Date()),
    ).toThrow(InsufficientBalanceError);
    expect(wallet.balance.toAmountString()).toBe('20.00');
    expect(wallet.version).toBe(1);
  });

  test('rejects currency mismatch', () => {
    const wallet = Wallet.open({
      id: walletId,
      playerId,
      initialBalance: Money.from({ amount: '20.00', currency: 'BRL' }),
    });

    expect(() =>
      wallet.debit(Money.from({ amount: '1.00', currency: 'USD' }), new Date()),
    ).toThrow(CurrencyMismatchError);
  });
});
