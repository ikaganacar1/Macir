import { describe, it, expect } from 'vitest';
import { formatCurrency, formatShortDate, formatFullDate } from '../format';

describe('formatCurrency', () => {
  it('formats a number with ₺ prefix and 2 decimal places', () => {
    expect(formatCurrency(10)).toBe('₺10.00');
    expect(formatCurrency(5.5)).toBe('₺5.50');
    expect(formatCurrency(0)).toBe('₺0.00');
  });

  it('accepts a string', () => {
    expect(formatCurrency('12.345')).toBe('₺12.35');
  });
});

describe('formatShortDate', () => {
  it('returns Turkish abbreviated month and day', () => {
    expect(formatShortDate('2026-04-14')).toBe('14 Nis');
    expect(formatShortDate('2026-01-01')).toBe('1 Oca');
    expect(formatShortDate('2026-12-31')).toBe('31 Ara');
  });
});

describe('formatFullDate', () => {
  it('returns Turkish long date', () => {
    expect(formatFullDate('2026-04-14')).toBe('14 Nisan 2026');
    expect(formatFullDate('2026-01-01')).toBe('1 Ocak 2026');
  });
});
