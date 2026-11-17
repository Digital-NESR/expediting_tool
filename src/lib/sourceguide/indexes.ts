/* ─── The in-process search indexes. Fuzzy matching runs in the app layer rather than in Postgres,
   so these hold the commodity, supplier and AVL tables behind a short TTL. A mapping change
   invalidates them, which is why the mutations import from here. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import type { CommodityRow } from '@/lib/sourceguide/internals';

/* ─── search ─────────────────────────────────────────────────── */

/* ─── cached search indexes (fuzzy matching runs in the app layer) ── */

export interface CommodityIndexRow extends CommodityRow {
  keywords: string | null;
}

export const INDEX_TTL_MS = 60_000;

export let _comCache: { rows: CommodityIndexRow[]; at: number } | null = null;

export async function getCommodityIndex(): Promise<CommodityIndexRow[]> {
  if (_comCache && Date.now() - _comCache.at < INDEX_TTL_MS) return _comCache.rows;
  const { rows } = await sourceGuidePool.query(
    `SELECT id, code, name, category, category_id, sub_category, family, spend_type, description,
            COALESCE(keywords, '') AS keywords
     FROM sg_commodities`,
  );
  _comCache = { rows: rows as CommodityIndexRow[], at: Date.now() };
  return _comCache.rows;
}

export interface SupplierIndexRow {
  code: string;
  name: string;
  countries: string[];
}

export let _supCache: { rows: SupplierIndexRow[]; at: number } | null = null;

export async function getMappedSupplierIndex(): Promise<SupplierIndexRow[]> {
  if (_supCache && Date.now() - _supCache.at < INDEX_TTL_MS) return _supCache.rows;
  const { rows } = await sourceGuidePool.query(
    `SELECT a.supplier_code, a.name,
            COALESCE(ARRAY_AGG(DISTINCT m.country_code) FILTER (WHERE m.country_code IS NOT NULL), '{}') AS countries
     FROM supplier_avl a
     JOIN sg_mappings m ON m.supplier_code = a.supplier_code AND m.status='Active'
     GROUP BY a.supplier_code, a.name`,
  );
  _supCache = {
    rows: rows.map((r) => ({ code: r.supplier_code, name: r.name, countries: r.countries || [] })),
    at: Date.now(),
  };
  return _supCache.rows;
}

export let _avlCache: { rows: { code: string; name: string }[]; at: number } | null = null;

export async function getAvlIndex(): Promise<{ code: string; name: string }[]> {
  if (_avlCache && Date.now() - _avlCache.at < INDEX_TTL_MS) return _avlCache.rows;
  const { rows } = await sourceGuidePool.query(`SELECT supplier_code, name FROM supplier_avl`);
  _avlCache = { rows: rows.map((r) => ({ code: r.supplier_code, name: r.name })), at: Date.now() };
  return _avlCache.rows;
}

/**
 * One row per active mapping — the whole supplier↔commodity relation.
 *
 * 10,976 rows, 283 KB serialised as compact arrays, which is the reason the Explorer needs no
 * new SQL. Every "how many suppliers sit under this node" figure in the tool is a fold over
 * this table joined to {@link getCommodityIndex} in memory, rather than a GROUP BY per node:
 * there are 1,714 nodes across five levels and the alternative is either a query per expanded
 * node or a materialised view of a table small enough to hold entirely.
 *
 * Deliberately narrow. The supplier's name, block status and the commodity's taxonomy all live
 * in the other indexes and are joined by key, so this stays the one thing it is — the relation.
 */
export interface MappingFact {
  commodityId: number;
  country: string;
  supplier: string;
  preferred: boolean;
}

export let _factCache: { rows: MappingFact[]; at: number } | null = null;

export async function getMappingFacts(): Promise<MappingFact[]> {
  if (_factCache && Date.now() - _factCache.at < INDEX_TTL_MS) return _factCache.rows;
  const { rows } = await sourceGuidePool.query(
    `SELECT commodity_id, country_code, supplier_code, tier
     FROM sg_mappings WHERE status = 'Active'`,
  );
  _factCache = {
    rows: rows.map((r) => ({
      commodityId: Number(r.commodity_id),
      country: r.country_code,
      supplier: r.supplier_code,
      preferred: r.tier === 'Preferred',
    })),
    at: Date.now(),
  };
  return _factCache.rows;
}

export let _ctryCache: {
  rows: { code: string; name: string; tone: string | null }[];
  at: number;
} | null = null;

export async function getCountriesLite(): Promise<
  { code: string; name: string; tone: string | null }[]
> {
  if (_ctryCache && Date.now() - _ctryCache.at < INDEX_TTL_MS) return _ctryCache.rows;
  const { rows } = await sourceGuidePool.query(
    `SELECT code, name, tone FROM sg_countries ORDER BY sort_order, name`,
  );
  _ctryCache = { rows, at: Date.now() };
  return _ctryCache.rows;
}

/**
 * Drop the caches a mapping write invalidates. The mapped-supplier index is
 * derived from `sg_mappings`, so without this an edit stayed invisible to
 * search until the TTL expired. Called by every mapping mutation below.
 */
export function invalidateMappingCaches(): void {
  _supCache = null;
  /* The fact table is derived from `sg_mappings` too. Without this a newly added mapping would
     show in search -- which reads the supplier index -- while the Explorer's counts still said
     it did not exist, for up to a minute. Two caches disagreeing is worse than one being stale. */
  _factCache = null;
}

/** Extra searchable text for a commodity (weighted below the name in the fuzzy scorer). */
export function commodityExtra(r: CommodityIndexRow): string {
  return `${r.category} ${r.sub_category ?? ''} ${r.family ?? ''} ${r.code ?? ''} ${r.keywords ?? ''}`;
}
