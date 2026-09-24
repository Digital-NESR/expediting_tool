'use server';

import sourceGuidePool from '@/lib/db-sourceguide';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import { logger } from '@/lib/logger';
import { getSnsViewer } from './sns';

/**
 * Supplier lookup for the New Record wizard, over `supplier_avl` in
 * SourceGuide's database — the same approved-vendor list the rest of the
 * platform sources from.
 *
 * Searched server-side, a page at a time, rather than shipping the table to the
 * browser: there are ~4,400 suppliers, and sending the lot on every wizard open
 * is exactly the whole-table client payload the platform moved away from.
 */

const log = logger('sns-registry');

export interface SupplierOption {
  /** supplier_avl.supplier_code — the Supplier SAP ID, leading zeros intact. */
  sapId: string;
  /** supplier_avl.name — the Supplier SAP Name. */
  name: string;
  /** Present when SAP has the vendor centrally blocked; the wizard warns on it. */
  blocked: boolean;
}

const LIMIT = 25;

function mapRow(r: Record<string, unknown>): SupplierOption {
  return {
    sapId: String(r.supplier_code),
    name: String(r.name ?? ''),
    blocked: isCentrallyBlocked(r.central_block_status),
  };
}

/**
 * Suppliers matching `query`, by name or by SAP ID.
 *
 * An empty query returns the first page alphabetically, so the field is useful
 * before anything is typed. Matching is case-insensitive and unanchored on the
 * name — people search for a word in the middle of a vendor's legal name far
 * more often than its first word — but anchored on the code, since a SAP ID is
 * read left to right.
 */
export async function searchSnsSuppliers(query: string): Promise<SupplierOption[]> {
  // A `'use server'` export is a public POST endpoint, so this is gated even
  // though it only reads reference data.
  const viewer = await getSnsViewer();
  if (!viewer) return [];

  const q = query.trim();

  try {
    if (!q) {
      const { rows } = await sourceGuidePool.query(
        `SELECT supplier_code, name, central_block_status
           FROM supplier_avl
          ORDER BY name
          LIMIT $1`,
        [LIMIT],
      );
      return rows.map(mapRow);
    }

    const { rows } = await sourceGuidePool.query(
      `SELECT supplier_code, name, central_block_status
         FROM supplier_avl
        WHERE name ILIKE $1 OR supplier_code ILIKE $2
        ORDER BY
          -- Exact code first, then name-prefix matches, then the rest: typing a
          -- full SAP ID should land on that vendor, not on whatever sorts first.
          CASE WHEN supplier_code = $3 THEN 0
               WHEN name ILIKE $2 THEN 1
               ELSE 2 END,
          name
        LIMIT $4`,
      [`%${q}%`, `${q}%`, q, LIMIT],
    );
    return rows.map(mapRow);
  } catch (err) {
    log.error('supplierSearch.failed', err, { queryLength: q.length });
    return [];
  }
}

/**
 * One supplier by exact SAP ID, for re-opening a saved draft.
 *
 * A draft stores the ID and name it was saved with; this confirms the vendor is
 * still on the approved list so the picker can say so rather than silently
 * showing a code that no longer resolves.
 */
export async function getSnsSupplierById(sapId: string): Promise<SupplierOption | null> {
  const viewer = await getSnsViewer();
  if (!viewer) return null;

  const id = sapId.trim();
  if (!id) return null;

  try {
    const { rows } = await sourceGuidePool.query(
      `SELECT supplier_code, name, central_block_status
         FROM supplier_avl WHERE supplier_code = $1 LIMIT 1`,
      [id],
    );
    return rows.length ? mapRow(rows[0]) : null;
  } catch (err) {
    log.error('supplierById.failed', err);
    return null;
  }
}
