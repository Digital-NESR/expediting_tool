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
