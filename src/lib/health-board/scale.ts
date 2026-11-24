/*
 * Chart and gauge scales for the detail pages: always from zero, each end rounded outwards to a
 * round number, so nothing is ever drawn outside its axis (the owner chose this over Power BI's
 * fixed per-page ranges, which cut values off).
 */

/** A round number at or above x: 1, 2, 2.5 or 5 × 10^n. */
export function niceCeil(x: number): number {
  if (x <= 0) return 0;
  const p = 10 ** Math.floor(Math.log10(x));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x - 1e-9 * p) return m * p;
  return 10 * p;
}

/** The scale for some values: includes zero, and every value lies within it. */
export function scaleFor(values: number[]): { lo: number; hi: number } {
  const hi = niceCeil(Math.max(0, ...values));
  const lo = -niceCeil(-Math.min(0, ...values)) || 0; // `|| 0`: never -0, which prints as "-0"
  return hi === lo ? { lo: 0, hi: 1 } : { lo, hi };
}

/** Gridline values for a scale from scaleFor: round steps (a 0–250 axis steps by 50, not 62.5). */
export function ticksFor(lo: number, hi: number): number[] {
  const span = hi - lo;
  const lead = span / 10 ** Math.floor(Math.log10(span));
  const parts = Math.abs(lead - 2.5) < 1e-9 ? 5 : 4;
  return Array.from({ length: parts + 1 }, (_, i) => lo + (span * i) / parts);
}
