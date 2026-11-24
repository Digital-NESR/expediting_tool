import { describe, expect, it } from 'vitest';
import { formatKpiValue, formatWithUnit } from '@/lib/health-board/format';

describe('number formats', () => {
  it('formats by unit, the same everywhere', () => {
    expect(formatKpiValue('%', 57.0123)).toBe('57.01');
    expect(formatKpiValue('$', 24891159.88)).toBe('24,891,160');
    expect(formatKpiValue('Days', -0.002)).toBe('0.00');
  });

  it('puts the unit next to the number', () => {
    expect(formatWithUnit('%', 57.0123)).toBe('57.01%');
    expect(formatWithUnit('Days', 5.6667)).toBe('5.67 days');
    expect(formatWithUnit('$', 24891159.88)).toBe('$24,891,160');
    expect(formatWithUnit('$', -4000000)).toBe('-$4,000,000');
    expect(formatWithUnit('Suppliers', 2357)).toBe('2,357');
    expect(formatWithUnit('%', null)).toBe('');
  });
});
