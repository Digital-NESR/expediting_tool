/**
 * Each supplier's share of the country's balance, and the running total down the list.
 *
 * A plain module with no imports, so the scoping screen, the tracking screen and the consolidation
 * screen all divide by the same denominator and round the same way. They were going to compute it
 * three times otherwise, and the one that drifted would be found by a champion reading two screens
 * that disagreed about the same supplier.
 *
 * Two different questions, which is why both are here:
 *   share      — how much of the country this ONE supplier is. "Is chasing them worth it?"
 *   cumulative — how much is covered by this supplier and everyone above them. "Where do I stop?"
 *
 * Cumulative is only meaningful on a value-ordered list, so it is computed on a sorted copy and
 * handed back by key. The screens can then order their rows however they like — by status, by name,
 * by response date — and still show the right figure for each supplier.
 */

export interface SpendShare {
  /** 1 = largest by value. */
  rank: number;
  /** This supplier alone, as a percentage of the total. One decimal: most are under 1%. */
  sharePct: number | null;
  /** This supplier and everyone above them. Whole percent, as the scoping screen has always read. */
  cumulativePct: number | null;
}

/**
 * @param rows one entry per supplier; `value` is their balance in the denominator's currency
 * @param totalBalance the country's whole balance, the same denominator the coverage figure uses
 */
export function spendShares(
  rows: { key: string; value: number }[],
  totalBalance: number,
): Map<string, SpendShare> {
  const out = new Map<string, SpendShare>();
  /* A zero or negative denominator is not an error worth throwing over: a country whose extract
     has not landed has no shares to report, and every figure is simply absent. */
  const usable = totalBalance > 0;

  const sorted = [...rows].sort((a, b) => b.value - a.value);
  let running = 0;
  sorted.forEach((row, i) => {
    running += row.value;
    out.set(row.key, {
      rank: i + 1,
      sharePct: usable ? Math.round((row.value / totalBalance) * 1000) / 10 : null,
      cumulativePct: usable ? Math.round((running / totalBalance) * 100) : null,
    });
  });
  return out;
}

/**
 * A share as it is written on screen.
 *
 * Anything above zero but below 0.05 rounds to "0.0%", which reads as nothing at all for a
 * supplier who is really there, so it is given its own form. A true zero stays "0%".
 */
export function formatSharePct(pct: number | null): string {
  if (pct === null) return '';
  if (pct === 0) return '0%';
  if (pct < 0.1) return '<0.1%';
  return `${pct.toFixed(1)}%`;
}
