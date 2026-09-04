import { Money } from '../money/index.js';
import { CurrencyMismatchError, InsufficientBalanceError } from '../errors/index.js';

export interface WalletState {
  id: string;
  playerId: string;
  currency: string;
  balance: Money;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface WalletMovementResult {
  balanceBefore: Money;
  balanceAfter: Money;
  version: number;
}

export class Wallet {
  private constructor(
    public readonly id: string,
    public readonly playerId: string,
    public readonly currency: string,
    private _balance: Money,
    private _version: number,
    public readonly createdAt: Date,
    private _updatedAt: Date,
  ) {}

  static open(props: { id: string; playerId: string; initialBalance: Money }): Wallet {
    const now = new Date();
    return new Wallet(
      props.id,
      props.playerId,
      props.initialBalance.currency,
      props.initialBalance,
      1,
      now,
      now,
    );
  }

  static rehydrate(state: WalletState): Wallet {
    return new Wallet(
      state.id,
      state.playerId,
      state.currency,
      state.balance,
      state.version,
      state.createdAt,
      state.updatedAt,
    );
  }

  get balance(): Money {
    return this._balance;
  }

  get version(): number {
    return this._version;
  }

  get updatedAt(): Date {
    return this._updatedAt;
  }

  debit(amount: Money, at: Date): WalletMovementResult {
    this.assertSameCurrency(amount);

    if (this._balance.isLessThan(amount)) {
      throw new InsufficientBalanceError(
        `Insufficient balance for wallet ${this.id}: has ${this._balance.toAmountString()}, needs ${amount.toAmountString()}`,
      );
    }

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.subtract(amount);
    this.applyBalanceChange(balanceAfter, at);

    return {
      balanceBefore,
      balanceAfter,
      version: this._version,
    };
  }

  credit(amount: Money, at: Date): WalletMovementResult {
    this.assertSameCurrency(amount);

    const balanceBefore = this._balance;
    const balanceAfter = this._balance.add(amount);
    this.applyBalanceChange(balanceAfter, at);

    return {
      balanceBefore,
      balanceAfter,
      version: this._version,
    };
  }

  applyPersistedBalance(balance: Money, version: number, at: Date): void {
    this._balance = balance;
    this._version = version;
    this._updatedAt = at;
  }

  private applyBalanceChange(balanceAfter: Money, at: Date): void {
    if (!balanceAfter.equals(this._balance)) {
      this._balance = balanceAfter;
      this._version += 1;
      this._updatedAt = at;
    }
  }

  private assertSameCurrency(money: Money): void {
    if (money.currency !== this.currency) {
      throw new CurrencyMismatchError(
        `Wallet currency ${this.currency} does not match operation currency ${money.currency}`,
      );
    }
  }
}
