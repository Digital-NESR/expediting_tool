import type { QueryResultRow } from 'pg';
import sourceGuidePool from '@/lib/db-sourceguide';
import { logger } from '@/lib/logger';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import { cleanEmails } from './recurrent';

/**
 * Suppliers for a recurrent service, from SourceGuide's `supplier_avl` (the SAP vendor master,
 * loaded nightly; READ-ONLY here).
 *
 * Searched by code or by name, active suppliers first: a recurrent service is renewed with a
 * supplier the company can still buy from, and a blocked one is shown only so the buyer sees it.
 * Codes come back without SAP's leading zeros ("0001103384" → "1103384"), the way RRSM stores
 * them and the way SAP POs name the vendor.
 *
 * `email` is the vendor master's, and is often several addresses in one field; it is returned
 * cleaned up as "a@x.com; b@y.com".
 */

const log = logger('rrsm-avl');
const LIMIT = 20;

export interface RrsmSupplierOption {
  code: string;
  name: string;
  email: string;
  blocked: boolean;
}

export async function searchRrsmSuppliers(query: string): Promise<RrsmSupplierOption[]> {
  const q = String(query ?? '').trim();
  if (q.length < 2) return [];
  const code = q.replace(/^0+/, '');
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT ltrim(supplier_code, '0') AS code, name, COALESCE(email, '') AS email,
              COALESCE(central_block_status, '') AS status
         FROM supplier_avl
        WHERE ($2 <> '' AND ltrim(supplier_code, '0') LIKE $2 || '%')
           OR name ILIKE '%' || $1 || '%'
        ORDER BY (COALESCE(central_block_status, '') NOT IN ('', 'Active')),
                 (ltrim(supplier_code, '0') = $2) DESC,
                 (name ILIKE $1 || '%') DESC,
                 name
        LIMIT $3`,
      [q, /^\d+$/.test(code) ? code : '', LIMIT],
    );
    return rows.map((r) => ({
      code: String(r.code ?? ''),
      name: String(r.name ?? ''),
      email: cleanEmails(String(r.email ?? '')),
      blocked: isCentrallyBlocked(String(r.status ?? '')),
    }));
  } catch (err) {
    /* A type-ahead: without it the buyer can still type the supplier in. */
    log.error('searchRrsmSuppliers.failed', err, { query: q });
    return [];
  }
}
