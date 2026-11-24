import { describe, expect, it } from 'vitest';
import {
  compactTargetWords,
  exactTitle,
  formatCompact,
  formatCompactWithUnit,
  formatKpiValue,
  formatWithUnit,
} from '@/lib/health-board/format';

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

  it('shortens dollars for narrow columns and keeps the exact figure for the hover', () => {
    expect(formatCompact('$', 135009145.14)).toBe('135.01M');
    expect(formatCompact('$', -1744654.42)).toBe('-1.74M');
    expect(formatCompact('$', 497854.21)).toBe('497.85K');
    expect(formatCompact('$', 950)).toBe('950');
    expect(formatCompact('%', 57.0123)).toBe('57.01');
    expect(formatCompact('Suppliers', 2587)).toBe('2,587');
    expect(exactTitle('$', 135009145.14)).toBe('Exactly $135,009,145.');
    expect(exactTitle('$', 950)).toBeUndefined();
    expect(exactTitle('%', 57.01)).toBeUndefined();
  });

  it('shortens dollar YTDs and dollar targets the same way', () => {
    expect(formatCompactWithUnit('$', 138651316.42)).toBe('$138.65M');
    expect(formatCompactWithUnit('$', -4000000)).toBe('-$4.00M');
    expect(formatCompactWithUnit('Days', 113)).toBe('113.00 days');
    expect(compactTargetWords('$', '<= 77,153,985.57')).toBe('<= 77.15M');
    expect(compactTargetWords('$', '<= -4,000,000')).toBe('<= -4.00M');
    expect(compactTargetWords('%', '>= 60')).toBe('>= 60');
  });
});
