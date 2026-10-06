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
  /** This supplier alone, as a percentage of the total. */
  sharePct: number | null;
  /** This supplier and everyone above them. */
  cumulativePct: number | null;
}

/** Two decimals, which is the precision both figures are written at. */
const round2 = (pct: number): number => Math.round(pct * 100) / 100;

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
      sharePct: usable ? round2((row.value / totalBalance) * 100) : null,
      cumulativePct: usable ? round2((running / totalBalance) * 100) : null,
    });
  });
  return out;
}

/**
 * A percentage as it is written on screen, for both of these columns.
 *
 * Two decimals on both, so the running total can be read against the coverage figure without
 * wondering whether a gap is real or rounding, and so a supplier worth a fraction of a per cent
 * is still a number rather than a zero.
 *
 * Anything above zero but below 0.005 rounds to "0.00%", which reads as nothing at all for a
 * supplier who is really there, so it is given its own form. A true zero stays "0%".
 */
export function formatPct(pct: number | null): string {
  if (pct === null) return '';
  if (pct === 0) return '0%';
  if (pct < 0.01) return '<0.01%';
  return `${pct.toFixed(2)}%`;
}
