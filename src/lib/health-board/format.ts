import type { KpiDefinition } from './definitions';

/*
 * One format per unit, the same in every column (RULES.md): % and Days to 2 decimals, $ as whole
 * dollars, Suppliers as whole numbers. Fixed to en-US so a reader's browser locale cannot turn
 * 1,239.50 into 1.239,50 on a board people compare by eye.
 */
const TWO_DP = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const WHOLE = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

export function formatKpiValue(unit: KpiDefinition['unit'], value: number | null): string {
  if (value === null) return '';
  const v = unit === '$' || unit === 'Suppliers' ? WHOLE.format(value) : TWO_DP.format(value);
  /* -0 after rounding (e.g. -0.002) reads as a negative number that is not there. */
  return v === '-0' || v === '-0.00' ? v.slice(1) : v;
}

/**
 * The same number with its unit, for places without a Units column:
 * 57.01%, 5.67 days, $24,891,160, 2,357 (suppliers). Negative dollars read -$4,000,000.
 */
export function formatWithUnit(unit: KpiDefinition['unit'], value: number | null): string {
  if (value === null) return '';
  const n = formatKpiValue(unit, value);
  switch (unit) {
    case '%':
      return `${n}%`;
    case 'Days':
      return `${n} days`;
    case '$':
      return n.startsWith('-') ? `-$${n.slice(1)}` : `$${n}`;
    case 'Suppliers':
      return n;
  }
}
