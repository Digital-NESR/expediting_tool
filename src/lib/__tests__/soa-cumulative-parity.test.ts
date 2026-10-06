import { describe, expect, it } from 'vitest';
import { spendShares } from '@/lib/soa/spend-share';
import { countsTowardCoverage } from '@/lib/soa/status';

/*
 * The Consolidation page's last row has to land on the country's coverage figure.
 *
 * It did not. Cumulative was accumulated over every scoped vendor while the page listed only the
 * ones who had answered, so for Saudi Arabia the last of its 29 rows read 76% — the running total
 * having climbed through 66 suppliers that page does not display — while the Corporate Rollup said
 * 20% for the same country on the same day. The denominator was never the problem: both divide by
 * the country's whole balance.
 *
 * Two rules together make them agree, and this pins both:
 *   the cumulative runs over the rows the screen shows, not over every vendor;
 *   the rows the screen shows are the ones that count towards coverage, which includes a
 *   nil-balance vendor — it is in the consolidated workbook as a marker row saying so.
 */

const COUNTRY_BALANCE = 1_474_476_659;

/** Saudi Arabia as it stands: 29 answered out of 95 scoped. */
const vendors = [
  ...Array.from({ length: 29 }, (_, i) => ({
    id: `answered-${i}`,
    openPO: 300_154_669 / 29,
    status: 'received',
  })),
  ...Array.from({ length: 66 }, (_, i) => ({
    id: `silent-${i}`,
    openPO: (1_114_120_441 - 300_154_669) / 66,
    status: 'requested',
  })),
];

const lastCumulative = (subset: { id: string; openPO: number }[]) => {
  const shares = spendShares(
    subset.map((v) => ({ key: v.id, value: v.openPO })),
    COUNTRY_BALANCE,
  );
  return Math.max(...[...shares.values()].map((s) => s.cumulativePct ?? 0));
};

describe('consolidation cumulative against coverage', () => {
  const coverage = Math.round(
    (vendors.filter((v) => countsTowardCoverage(v.status)).reduce((s, v) => s + v.openPO, 0) /
      COUNTRY_BALANCE) *
      100,
  );

  it('the rollup figure is the one being matched', () => {
    expect(coverage).toBe(20);
  });

  it('accumulating over the rows the page shows lands on it', () => {
    const shown = vendors.filter((v) => countsTowardCoverage(v.status));
    expect(lastCumulative(shown)).toBe(coverage);
  });

  /* The shape of the original bug, kept so the fix cannot be quietly undone. */
  it('accumulating over every scoped vendor does not', () => {
    expect(lastCumulative(vendors)).toBe(76);
    expect(lastCumulative(vendors)).not.toBe(coverage);
  });

  /* EOS Jafza and Iraq: the rows the page shows have to include nil-balance vendors, or the last
     row falls short of coverage by exactly their weight. */
  it('counts a nil-balance vendor, which the workbook also carries', () => {
    const withNil = [
      { id: 'answered', openPO: 83_247_621, status: 'received' },
      { id: 'nil', openPO: 18_300_000, status: 'nil_balance' },
    ];
    const total = 225_000_000;
    const shares = spendShares(
      withNil
        .filter((v) => countsTowardCoverage(v.status))
        .map((v) => ({ key: v.id, value: v.openPO })),
      total,
    );
    const last = Math.max(...[...shares.values()].map((s) => s.cumulativePct ?? 0));
    const coverageHere = Math.round(((83_247_621 + 18_300_000) / total) * 100);
    expect(last).toBe(coverageHere);

    // Dropping it, as the page used to, leaves the last row short.
    const receivedOnly = spendShares([{ key: 'answered', value: 83_247_621 }], total);
    expect(receivedOnly.get('answered')!.cumulativePct).toBeLessThan(coverageHere);
  });
});
