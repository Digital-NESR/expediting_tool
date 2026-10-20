import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { entryNotExcluded, notExcludedVendorNo } from '@/lib/soa/exclusions';

/**
 * Intercompany exclusions, applied everywhere or not applied at all.
 *
 * `scopeCandidates` took them out of its denominator and nothing else did, so the Scoping
 * screen told Egypt's champion they had covered the quarter while the Corporate Rollup said
 * 23.70% — Egypt being 57.8% intercompany. The fix was one definition used by five queries,
 * and the failure mode it has to survive is the sixth query, written later, that computes a
 * coverage figure and forgets.
 *
 * So the last test here reads the source. A unit test over the helpers would pass happily
 * while a new `SUM(e.pos_value)` somewhere else re-opened exactly the same gap, because the
 * bug was never in the arithmetic — it was in which queries did it.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the exclusion fragments', () => {
  it('tests the vendor number the caller names', () => {
    expect(notExcludedVendorNo('e.supplier_id')).toContain('x.vendor_no = e.supplier_id');
    expect(notExcludedVendorNo('e.supplier_id')).toMatch(/^NOT EXISTS/);
  });

  it('reaches a cycle entry"s vendor number without needing a join', () => {
    const sql = entryNotExcluded('vce');
    expect(sql).toContain('ev.id = vce.vendor_id');
    expect(sql).toContain('excluded_vendors');
    /* Its own subquery on purpose: a query that drops a join to `vendors` must not silently
       stop excluding. */
    expect(sql).toContain('FROM vendors ev');
  });

  it('takes the alias it is given', () => {
    expect(entryNotExcluded('entry')).toContain('ev.id = entry.vendor_id');
  });
});

describe('every coverage denominator', () => {
  /* The files that divide by a country's PO balance. Adding one to this list is cheaper than
     explaining another pair of screens that disagree. */
  const FILES = [
    'src/lib/soa/read.ts',
    'src/lib/soa/candidates.ts',
    'src/app/actions/soa/workflow.ts',
    'src/app/api/soa/evidence-pack/[country]/route.ts',
  ];

  it.each(FILES)('%s totals pos_value only with the exclusion list in hand', (file) => {
    const src = read(file);
    /* `candidates.ts` adds its balance up in JS and the other three in SQL, so the test asks
       about pos_value rather than about SUM(). */
    expect(src, `${file} no longer reads pos_value; drop it from this list`).toContain('pos_value');
    expect(
      src.includes('excluded_vendors') || src.includes('notExcludedVendorNo'),
      `${file} totals pos_value without any reference to the exclusion list`,
    ).toBe(true);
  });

  it('the rollup filters all four of its balance figures, not just the one on display', () => {
    /* Coverage is what the quarter is judged on, but the funnel beside it is read as "a subset
       of the row above". A scoped bar measured over a different population than the answered
       bar makes the gap between them meaningless. */
    const src = read('src/lib/soa/read.ts');
    const rollup = src.slice(
      src.indexOf('async function rollup('),
      src.indexOf('export async function loadSoa('),
    );
    for (const figure of [
      'scoped_balance',
      'requested_balance',
      'reminded_balance',
      'received_balance',
    ]) {
      const line = rollup.slice(0, rollup.indexOf(figure));
      const filter = line.lastIndexOf('FILTER (WHERE');
      expect(
        line.slice(filter).includes('${INCLUDED}'),
        `${figure} is summed without the exclusion filter`,
      ).toBe(true);
    }
  });

  it('the country payload takes them off the numerator too', () => {
    /* Six countries have an intercompany entity locked into their chase list from before the
       exclusion existed. Dropping it from the denominator alone lets coverage exceed 100%. */
    const src = read('src/app/soa-consolidation/lib.ts');
    const receivedBalance = src.slice(src.indexOf('const receivedBalance = vendors'));
    expect(receivedBalance.slice(0, 200)).toContain('!v.excluded');
  });
});
