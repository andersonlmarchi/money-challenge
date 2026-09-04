import { describe, expect, test } from 'bun:test';
import { MoneyAmountType } from '../../src/infrastructure/persistence/types/money-amount.type';

describe('MoneyAmountType', () => {
  const type = new MoneyAmountType();

  test('keeps database values as string', () => {
    expect(type.convertToJSValue('123.45')).toBe('123.45');
    expect(type.convertToJSValue(123.45)).toBe('123.45');
  });

  test('persists string values unchanged', () => {
    expect(type.convertToDatabaseValue('99.99')).toBe('99.99');
  });

  test('uses numeric(19,2) column type', () => {
    expect(type.getColumnType()).toBe('numeric(19,2)');
  });
});
