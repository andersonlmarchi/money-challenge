import { describe, expect, test } from 'bun:test';
import { v7 as uuidv7 } from 'uuid';
import { LedgerDirection } from '../../src/domain/enums/index';
import { InvalidMoneyError } from '../../src/domain/errors/index';
import { Money } from '../../src/domain/money/money';
import { WalletLedgerEntry } from '../../src/domain/ledger/wallet-ledger-entry';

describe('WalletLedgerEntry', () => {
  test('creates balanced DEBIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: uuidv7(),
      walletId: uuidv7(),
      transactionId: uuidv7(),
      direction: LedgerDirection.Debit,
      money: Money.from({ amount: '25.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '75.00', currency: 'BRL' }),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  test('creates balanced CREDIT entry', () => {
    const entry = WalletLedgerEntry.create({
      id: uuidv7(),
      walletId: uuidv7(),
      transactionId: uuidv7(),
      direction: LedgerDirection.Credit,
      money: Money.from({ amount: '10.00', currency: 'BRL' }),
      balanceBefore: Money.from({ amount: '50.00', currency: 'BRL' }),
      balanceAfter: Money.from({ amount: '60.00', currency: 'BRL' }),
    });

    expect(entry.isBalanced()).toBe(true);
  });

  test('rejects structurally unbalanced entry', () => {
    expect(() =>
      WalletLedgerEntry.create({
        id: uuidv7(),
        walletId: uuidv7(),
        transactionId: uuidv7(),
        direction: LedgerDirection.Debit,
        money: Money.from({ amount: '25.00', currency: 'BRL' }),
        balanceBefore: Money.from({ amount: '100.00', currency: 'BRL' }),
        balanceAfter: Money.from({ amount: '80.00', currency: 'BRL' }),
      }),
    ).toThrow(InvalidMoneyError);
  });
});
