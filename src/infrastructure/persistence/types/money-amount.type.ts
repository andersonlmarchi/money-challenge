import { Type } from '@mikro-orm/core';

/**
 * Maps PostgreSQL NUMERIC(19,2) to JavaScript string — never to number.
 */
export class MoneyAmountType extends Type<string, string> {
  override convertToDatabaseValue(value: string): string {
    return value;
  }

  override convertToJSValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined) {
      return '0.00';
    }
    return String(value);
  }

  override getColumnType(): string {
    return 'numeric(19,2)';
  }
}

export const MONEY_AMOUNT_TYPE = new MoneyAmountType();
