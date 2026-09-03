import { describe, expect, test } from 'bun:test';
import { Money } from '../../src/domain/money/money';
import { CurrencyMismatchError, InvalidMoneyError } from '../../src/domain/errors/index';

describe('Money', () => {
  test('accepts valid amounts', () => {
    expect(Money.from({ amount: '0.00', currency: 'BRL' }).toAmountString()).toBe('0.00');
    expect(Money.from({ amount: '0.01', currency: 'BRL' }).toAmountString()).toBe('0.01');
    expect(Money.from({ amount: '10.00', currency: 'BRL' }).toAmountString()).toBe('10.00');
    expect(Money.from({ amount: '10.50', currency: 'BRL' }).toAmountString()).toBe('10.50');
    expect(Money.from({ amount: '9999999999999999.99', currency: 'BRL' }).toAmountString()).toBe(
      '9999999999999999.99',
    );
  });

  test('performs decimal operations immutably', () => {
    const left = Money.from({ amount: '10.00', currency: 'BRL' });
    const right = Money.from({ amount: '2.50', currency: 'BRL' });

    const added = left.add(right);
    const subtracted = left.subtract(right);
    const negated = left.negate();

    expect(added.toAmountString()).toBe('12.50');
    expect(subtracted.toAmountString()).toBe('7.50');
    expect(negated.toAmountString()).toBe('-10.00');
    expect(left.toAmountString()).toBe('10.00');
  });

  test('rejects invalid inputs', () => {
    const invalid = [
      { amount: '', currency: 'BRL' },
      { amount: 'NaN', currency: 'BRL' },
      { amount: 'Infinity', currency: 'BRL' },
      { amount: '1e2', currency: 'BRL' },
      { amount: '10.123', currency: 'BRL' },
      { amount: '-1.00', currency: 'BRL' },
      { amount: '10.5', currency: 'BRL' },
    ];

    for (const props of invalid) {
      expect(() => Money.from(props)).toThrow(InvalidMoneyError);
    }
  });

  test('rejects currency mismatch', () => {
    const brl = Money.from({ amount: '1.00', currency: 'BRL' });
    const usd = Money.from({ amount: '1.00', currency: 'USD' });

    expect(() => brl.add(usd)).toThrow(CurrencyMismatchError);
  });

  test('serializes and rehydrates', () => {
    const original = Money.from({ amount: '25.00', currency: 'BRL' });
    const json = original.toJSON();
    const rehydrated = Money.rehydrate(json);

    expect(rehydrated.equals(original)).toBe(true);
    expect(rehydrated.toJSON()).toEqual(json);
  });
});
