/**
 * A country's whole balance for a cycle: the denominator every percentage in this tool
 * divides by.
 *
 * Its own module for the same reason `exclusions.ts` is one. The figure is read as
 * "coverage" on the dashboard, as "target met" on Scoping, as a share per supplier on
 * Response Tracking and Consolidation, and now as a column in the vendor-status CSV. Every
 * one of those has to be the same number, and the way that breaks is not a wrong formula
 * but a second copy of the right one that stops being updated.
 *
 * Two things about it that are easy to get wrong:
 *
 * It is the whole COUNTRY, from the PO extract -- not the sum of the vendors anybody chose
 * to chase. A country of 600 suppliers is typically scoped down to the few dozen that carry
 * the balance, so dividing by the scoped list instead would have every share come out
 * several times too large, and the last row of a chase list would read 100%.
 *
 * And the exclusions come off BOTH sides. NESR's own entities turn up in the extract like
 * any supplier; there is no third party to ask and no balance anyone outside the group
 * could confirm, so their spend is not reconcilable and belongs on neither side of the
 * division. See `exclusions.ts` for what taking it off only one side did.
 */

import type { QueryResultRow } from 'pg';
import { sql } from './db';
import { notExcludedVendorNo } from './exclusions';

export async function countryBalance(cycleId: number, countryId: string): Promise<number> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT COALESCE(SUM(e.pos_value), 0) AS total
       FROM supplier_po_extract e
       JOIN countries c ON e.po_country = ANY (c.spend_names)
      WHERE e.cycle_id = ? AND c.id = ?
        AND ${notExcludedVendorNo('e.supplier_id')}`,
    [cycleId, countryId],
  );
  return Number(rows[0]?.total ?? 0);
}
