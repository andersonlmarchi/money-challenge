import { Decimal } from 'decimal.js';
import { CurrencyMismatchError, InvalidMoneyError } from '../errors/index.js';

export interface MoneyProps {
  amount: string;
  currency: string;
}

const MONEY_SCALE = 2;
const MONEY_PATTERN = /^\d+\.\d{2}$/;

export class Money {
  private constructor(
    private readonly value: Decimal,
    public readonly currency: string,
  ) {}

  static from(props: MoneyProps): Money {
    const currency = props.currency.trim().toUpperCase();
    if (!currency) {
      throw new InvalidMoneyError('Currency is required');
    }

    const amount = props.amount.trim();
    if (!amount) {
      throw new InvalidMoneyError('Amount must not be empty');
    }

    if (/[eE]/.test(amount)) {
      throw new InvalidMoneyError('Scientific notation is not allowed');
    }

    if (!MONEY_PATTERN.test(amount)) {
      throw new InvalidMoneyError('Amount must be a decimal string with exactly 2 fractional digits');
    }

    const decimal = new Decimal(amount);

    if (!decimal.isFinite()) {
      throw new InvalidMoneyError('Amount must be a finite decimal');
    }

    if (decimal.isNaN()) {
      throw new InvalidMoneyError('Amount must not be NaN');
    }

    if (decimal.isNegative()) {
      throw new InvalidMoneyError('Amount must not be negative');
    }

    if (decimal.decimalPlaces() > MONEY_SCALE) {
      throw new InvalidMoneyError('Amount must have at most 2 decimal places');
    }

    return new Money(decimal.toDecimalPlaces(MONEY_SCALE), currency);
  }

  static zero(currency: string): Money {
    return Money.from({ amount: '0.00', currency });
  }

  /** Rehydrates persisted state without re-validating business transition rules. */
  static rehydrate(props: MoneyProps): Money {
    const currency = props.currency.trim().toUpperCase();
    return new Money(new Decimal(props.amount), currency);
  }

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.plus(other.value), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.value.minus(other.value), this.currency);
  }

  negate(): Money {
    return new Money(this.value.negated(), this.currency);
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.gt(0);
  }

  isNegative(): boolean {
    return this.value.isNegative();
  }

  isLessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.value.lt(other.value);
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.value.eq(other.value);
  }

  toJSON(): MoneyProps {
    return {
      amount: this.toAmountString(),
      currency: this.currency,
    };
  }

  toAmountString(): string {
    return this.value.toFixed(MONEY_SCALE);
  }

  toString(): string {
    return `${this.toAmountString()} ${this.currency}`;
  }

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new CurrencyMismatchError(
        `Cannot operate on different currencies: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
