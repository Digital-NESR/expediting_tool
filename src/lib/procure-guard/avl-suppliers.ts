import type { QueryResultRow } from 'pg';
import sourceGuidePool from '@/lib/db-sourceguide';
import { logger } from '@/lib/logger';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';

/**
 * Suppliers already in SAP, for an adhoc request raised against one of them.
 *
 * The case this serves: a supplier exists in the vendor master but is centrally blocked, and a
 * buyer needs a single urgent purchase. Rather than unblocking them, the buyer raises an adhoc
 * request naming the existing supplier, and the approval chain decides.
 *
 * Read from SourceGuide's `supplier_avl`, which carries the whole vendor master: 8,516 suppliers
 * of which 444 are centrally blocked.
 *
 * NOT FILTERED BY COUNTRY, deliberately, although the form has a country on it. `supplier_avl`
 * has no country column, and the two things that could stand in for one do not cover this case:
 * `sg_mappings` places only 10 of the 444 blocked suppliers, and purchase history places 29. A
 * country filter would therefore empty the list for exactly the suppliers the feature exists
 * for. The buyer searches the whole master instead, and the request carries its own country.
 */

const log = logger('procure-guard-avl');

/** Enough to find the one you mean, few enough to read. */
const LIMIT = 25;

export interface AvlSupplierOption {
  /** The SAP supplier ID, which is what the request records in place of a tax number. */
  code: string;
  name: string;
  email: string;
  /** Shown as a badge, and the reason most of these requests exist. */
  blocked: boolean;
  blockStatus: string;
}

export async function searchAvlSuppliers(query: string): Promise<AvlSupplierOption[]> {
  const q = String(query ?? '').trim();

  try {
    /* Matched on name and on code, because a buyer who has the SAP record searches by number
       and one working from a quote searches by name.

       Blocked suppliers sort first. They are the reason this list exists, and a buyer who types
       a company's name should not have to scroll past its active sister entities to find the
       blocked one they are raising the request for. */
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT supplier_code, name, COALESCE(email, '') AS email,
              COALESCE(central_block_status, '') AS central_block_status
         FROM supplier_avl
        WHERE $1 = ''
           OR supplier_code ILIKE $1 || '%'
           OR name ILIKE '%' || $1 || '%'
        ORDER BY (COALESCE(central_block_status, '') NOT IN ('', 'Active')) DESC,
                 name ASC
        LIMIT $2`,
      [q, LIMIT],
    );

    return rows.map((r) => ({
      code: String(r.supplier_code ?? ''),
      name: String(r.name ?? ''),
      email: String(r.email ?? ''),
      blocked: isCentrallyBlocked(r.central_block_status),
      blockStatus: String(r.central_block_status ?? ''),
    }));
  } catch (err) {
    /* An empty list rather than a thrown page. This is a type-ahead on a form a buyer can still
       complete the other way, so a database that is down costs them the convenience and not the
       request. */
    log.error('searchAvlSuppliers.failed', err, { query: q });
    return [];
  }
}

/**
 * One supplier by code, for the server to re-read what the browser claims was picked.
 *
 * The form posts a name and an ID, and neither can be trusted: the action is a public endpoint
 * and the pair could be anything. The name and block status stored on the request come from
 * here, so what an approver reads is the vendor master's answer rather than the requester's.
 */
export async function getAvlSupplier(code: string): Promise<AvlSupplierOption | null> {
  const c = String(code ?? '').trim();
  if (!c) return null;
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT supplier_code, name, COALESCE(email, '') AS email,
              COALESCE(central_block_status, '') AS central_block_status
         FROM supplier_avl WHERE supplier_code = $1 LIMIT 1`,
      [c],
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
      code: String(r.supplier_code ?? ''),
      name: String(r.name ?? ''),
      email: String(r.email ?? ''),
      blocked: isCentrallyBlocked(r.central_block_status),
      blockStatus: String(r.central_block_status ?? ''),
    };
  } catch (err) {
    log.error('getAvlSupplier.failed', err, { code: c });
    return null;
  }
}
