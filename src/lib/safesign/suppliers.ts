import type { QueryResultRow } from 'pg';
import sourceGuidePool from '@/lib/db-sourceguide';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import { logger } from '@/lib/logger';
import { ensureSafeSignSchema, safesignPool } from './db';

/**
 * The supplier library, read from SourceGuide's `supplier_avl` (the SAP vendor master: code,
 * name, email, central block status) and SafeSign's own additions per country.
 *
 *   supplier_avl.email                 the supplier's TO addresses, shown dark green
 *   ss_vendor_contacts kind 'to'/'cc'  addresses the team added, shown outlined, remembered
 *   ss_vendor_contacts kind 'hidden'   a master address the team removed for this country
 *   ss_vendors                         "this supplier is in this country's library"
 *
 * A plain module: callers check access and the country first.
 */

const log = logger('safesign-suppliers');

export const PAGE_SIZE = 25;

export type LibraryScope = 'library' | 'bought' | 'all';
export type StatusFilter = '' | 'active' | 'blocked';
export type EmailFilter = '' | 'with' | 'without';

export interface SupplierSearch {
  countryId: string;
  q?: string;
  scope?: LibraryScope;
  category?: string;
  status?: StatusFilter;
  email?: EmailFilter;
  offset?: number;
}

export interface SupplierRow {
  code: string;
  name: string;
  blocked: boolean;
  emailCount: number;
  inLibrary: boolean;
}

export interface AddedContact {
  id: number;
  email: string;
  name: string;
  kind: 'to' | 'cc';
  addedBy: string | null;
}

export interface SupplierCard {
  code: string;
  name: string;
  blocked: boolean;
  blockStatus: string;
  categories: string[];
  /** In this country's library (an ss_vendors row), and its id. */
  vendorId: number | null;
  active: boolean;
  /** supplier_avl.email, minus what was hidden for this country. */
  masterTo: string[];
  hidden: { id: number; email: string }[];
  added: AddedContact[];
  communications: number;
}

/** supplier_avl.email holds several addresses separated by commas or semicolons. */
export function splitEmails(raw: unknown): string[] {
  const out: string[] = [];
  for (const part of String(raw ?? '').split(/[,;\s]+/)) {
    const e = part.trim().toLowerCase();
    if (e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !out.includes(e)) out.push(e);
  }
  return out;
}

async function spendCountry(countryId: string): Promise<string | null> {
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT spend_country FROM ss_countries WHERE id = $1`,
    [countryId],
  );
  return rows[0]?.spend_country ? String(rows[0].spend_country) : null;
}

async function libraryCodes(countryId: string): Promise<Set<string>> {
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT vendor_code FROM ss_vendors WHERE country_id = $1 AND active AND vendor_code IS NOT NULL`,
    [countryId],
  );
  return new Set(rows.map((r) => String(r.vendor_code)));
}

/** Categories of work SourceGuide maps suppliers to in this country, for the filter. */
export async function supplierCategories(countryId: string): Promise<string[]> {
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT DISTINCT category FROM sg_supplier_matrix
        WHERE country_code = $1 AND category IS NOT NULL AND category <> '' ORDER BY category`,
      [countryId],
    );
    return rows.map((r) => String(r.category));
  } catch (err) {
    log.error('supplierCategories.failed', err, { countryId });
    return [];
  }
}

/**
 * One page of suppliers matching the search and filters, by name or SAP code.
 * `scope`: 'library' (this country's library), 'bought' (bought from in this country, from
 * purchase history), 'all' (the whole vendor master).
 */
export async function searchSuppliers(s: SupplierSearch): Promise<{ rows: SupplierRow[]; total: number }> {
  await ensureSafeSignSchema();
  const q = String(s.q ?? '').trim();
  const offset = Math.max(0, Number(s.offset) || 0);
  const library = await libraryCodes(s.countryId);

  const where: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  if (q) {
    const exact = p(q);
    const like = p(`%${q}%`);
    where.push(`(a.supplier_code = ${exact} OR a.supplier_code ILIKE ${like} OR a.name ILIKE ${like})`);
  }
  if (s.scope === 'library') {
    if (!library.size) return { rows: [], total: 0 };
    where.push(`a.supplier_code = ANY(${p([...library])}::text[])`);
  } else if (s.scope === 'bought') {
    const spend = await spendCountry(s.countryId);
    if (!spend) return { rows: [], total: 0 };
    where.push(
      `EXISTS (SELECT 1 FROM historic_spend h WHERE h.supplier = a.supplier_code AND h.country = ${p(spend)})`,
    );
  }
  if (s.category) {
    where.push(
      `EXISTS (SELECT 1 FROM sg_supplier_matrix m WHERE m.supplier_code = a.supplier_code
                 AND m.country_code = ${p(s.countryId)} AND m.category = ${p(s.category)})`,
    );
  }
  if (s.status === 'active') where.push(`COALESCE(a.central_block_status, '') IN ('', 'Active')`);
  if (s.status === 'blocked') where.push(`COALESCE(a.central_block_status, '') NOT IN ('', 'Active')`);
  if (s.email === 'with') where.push(`COALESCE(a.email, '') LIKE '%@%'`);
  if (s.email === 'without') where.push(`COALESCE(a.email, '') NOT LIKE '%@%'`);

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const orderParam = p(q);
  const limit = p(PAGE_SIZE);
  const off = p(offset);

  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT a.supplier_code, a.name, COALESCE(a.email, '') AS email,
              COALESCE(a.central_block_status, '') AS central_block_status,
              COUNT(*) OVER () AS total
         FROM supplier_avl a
         ${whereSql}
        ORDER BY CASE WHEN a.supplier_code = ${orderParam} THEN 0
                      WHEN ${orderParam} <> '' AND a.name ILIKE ${orderParam} || '%' THEN 1 ELSE 2 END,
                 a.name
        LIMIT ${limit} OFFSET ${off}`,
      params,
    );
    return {
      total: rows.length ? Number(rows[0].total) : 0,
      rows: rows.map((r) => ({
        code: String(r.supplier_code),
        name: String(r.name ?? ''),
        blocked: isCentrallyBlocked(r.central_block_status),
        emailCount: splitEmails(r.email).length,
        inLibrary: library.has(String(r.supplier_code)),
      })),
    };
  } catch (err) {
    log.error('searchSuppliers.failed', err, { countryId: s.countryId, scope: s.scope });
    return { rows: [], total: 0 };
  }
}

export interface MasterSupplier {
  code: string;
  name: string;
  email: string;
  blockStatus: string;
}

/** Vendor master rows by SAP code. */
export async function masterSuppliers(codes: string[]): Promise<Map<string, MasterSupplier>> {
  const list = [...new Set(codes.filter(Boolean))];
  if (!list.length) return new Map();
  const { rows } = await sourceGuidePool.query<QueryResultRow>(
    `SELECT supplier_code, name, COALESCE(email, '') AS email,
            COALESCE(central_block_status, '') AS central_block_status
       FROM supplier_avl WHERE supplier_code = ANY($1::text[])`,
    [list],
  );
  return new Map(
    rows.map((r) => [
      String(r.supplier_code),
      {
        code: String(r.supplier_code),
        name: String(r.name ?? ''),
        email: String(r.email ?? ''),
        blockStatus: String(r.central_block_status ?? ''),
      },
    ]),
  );
}

export async function supplierCategoriesFor(countryId: string, code: string): Promise<string[]> {
  try {
    const { rows } = await sourceGuidePool.query<QueryResultRow>(
      `SELECT DISTINCT category FROM sg_supplier_matrix
        WHERE country_code = $1 AND supplier_code = $2 AND category IS NOT NULL ORDER BY category`,
      [countryId, code],
    );
    return rows.map((r) => String(r.category));
  } catch {
    return [];
  }
}

/** Everything the supplier panel shows for one supplier in one country. */
export async function getSupplierCard(countryId: string, code: string): Promise<SupplierCard | null> {
  await ensureSafeSignSchema();
  const master = (await masterSuppliers([code])).get(code);
  if (!master) return null;

  const [{ rows: vendor }, categories] = await Promise.all([
    safesignPool.query<QueryResultRow>(
      `SELECT v.id, v.active,
              (SELECT COUNT(*) FROM ss_requests r WHERE r.vendor_id = v.id)::int AS communications
         FROM ss_vendors v WHERE v.country_id = $1 AND v.vendor_code = $2`,
      [countryId, code],
    ),
    supplierCategoriesFor(countryId, code),
  ]);
  const v = vendor[0];
  const vendorId = v ? Number(v.id) : null;

  const { rows: contacts } = vendorId
    ? await safesignPool.query<QueryResultRow>(
        `SELECT id, email, COALESCE(name, '') AS name, kind, added_by
           FROM ss_vendor_contacts WHERE vendor_id = $1 ORDER BY id`,
        [vendorId],
      )
    : { rows: [] as QueryResultRow[] };

  const hidden = contacts
    .filter((c) => c.kind === 'hidden')
    .map((c) => ({ id: Number(c.id), email: String(c.email).toLowerCase() }));
  const hiddenSet = new Set(hidden.map((h) => h.email));

  return {
    code: master.code,
    name: master.name,
    blocked: isCentrallyBlocked(master.blockStatus),
    blockStatus: master.blockStatus,
    categories,
    vendorId,
    active: v ? Boolean(v.active) : false,
    masterTo: splitEmails(master.email).filter((e) => !hiddenSet.has(e)),
    hidden,
    added: contacts
      .filter((c) => c.kind === 'to' || c.kind === 'cc')
      .map((c) => ({
        id: Number(c.id),
        email: String(c.email),
        name: String(c.name),
        kind: c.kind as 'to' | 'cc',
        addedBy: c.added_by ? String(c.added_by) : null,
      })),
    communications: v ? Number(v.communications) : 0,
  };
}

/**
 * Who a communication goes to, per library supplier: the master TO addresses (minus hidden) plus
 * the added TO, and the added CC. The sender is added to CC by the caller.
 */
export async function recipientsFor(
  vendorIds: number[],
): Promise<Map<number, { to: string[]; cc: string[] }>> {
  const out = new Map<number, { to: string[]; cc: string[] }>();
  if (!vendorIds.length) return out;
  const { rows: vendors } = await safesignPool.query<QueryResultRow>(
    `SELECT v.id, v.vendor_code,
            COALESCE(json_agg(json_build_object('email', LOWER(c.email), 'kind', c.kind))
                     FILTER (WHERE c.id IS NOT NULL), '[]') AS contacts
       FROM ss_vendors v LEFT JOIN ss_vendor_contacts c ON c.vendor_id = v.id
      WHERE v.id = ANY($1::bigint[]) GROUP BY v.id`,
    [vendorIds],
  );
  const master = await masterSuppliers(vendors.map((v) => String(v.vendor_code ?? '')));
  for (const v of vendors) {
    const contacts = v.contacts as { email: string; kind: string }[];
    const hidden = new Set(contacts.filter((c) => c.kind === 'hidden').map((c) => c.email));
    const to = splitEmails(master.get(String(v.vendor_code ?? ''))?.email).filter((e) => !hidden.has(e));
    for (const c of contacts) if (c.kind === 'to' && !to.includes(c.email)) to.push(c.email);
    const cc = contacts.filter((c) => c.kind === 'cc' && !to.includes(c.email)).map((c) => c.email);
    out.set(Number(v.id), { to, cc: [...new Set(cc)] });
  }
  return out;
}
