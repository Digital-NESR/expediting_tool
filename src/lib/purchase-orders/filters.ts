/**
 * The filter bar shared by both Purchase Order boards.
 *
 * One definition, used by the overview and the past-due analysis, so a reader who narrows to
 * Kuwait on one tab sees the same population on the other. Both boards read
 * `core.supplychain`, which is what makes that possible: the curated `track.po_*` views are a
 * projection of it (see `openPoScope` below) but drop the four dimensions this bar filters on.
 *
 * ── EVERY VALUE IS A BOUND PARAMETER ────────────────────────────────────────────────────────
 * Column names come from the `FILTER_COLUMNS` allow-list and never from a caller; values go in
 * as `$n` placeholders. `buildFilterSql` returns the fragments and the parameter array
 * together so a caller cannot accidentally use one without the other.
 */

export interface PoFilters {
  /** SAP account assignment category — 'K9', 'A0', … See `core.account_classification_mapping`. */
  accountClassification: string[];
  /** Purchasing group name, which is how this data expresses the reporting segment. */
  segment: string[];
  country: string[];
  purchasingOrg: string[];
  /** SAP supplier number; the label shown comes from `track.supplier_directory`. */
  supplier: string[];
  /** The person who raised the PO (`created_by`). */
  buyer: string[];
  /** Inclusive `YYYY-MM-DD` bounds on po_release_date. */
  releasedFrom: string | null;
  releasedTo: string | null;
  /** Inclusive `YYYY-MM-DD` bounds on po_first_release_date. */
  firstReleasedFrom: string | null;
  firstReleasedTo: string | null;
}

export const EMPTY_FILTERS: PoFilters = {
  accountClassification: [],
  segment: [],
  country: [],
  purchasingOrg: [],
  supplier: [],
  buyer: [],
  releasedFrom: null,
  releasedTo: null,
  firstReleasedFrom: null,
  firstReleasedTo: null,
};

/** Which column each multi-select filters on. The allow-list — nothing else is interpolated. */
const FILTER_COLUMNS = {
  accountClassification: 'account_classification',
  segment: 'pg_name',
  country: 'country',
  purchasingOrg: 'purchasing_org',
  supplier: 'supplier_num',
  buyer: 'created_by',
} as const;

type MultiKey = keyof typeof FILTER_COLUMNS;

const MULTI_KEYS = Object.keys(FILTER_COLUMNS) as MultiKey[];

/** Qualifies a column with the table alias a query uses, or leaves it bare when there is none. */
const col = (alias: string) => (name: string) => (alias ? `${alias}.${name}` : name);

/** True when nothing is selected anywhere — lets a caller skip the WHERE entirely. */
export function isUnfiltered(f: PoFilters): boolean {
  return (
    MULTI_KEYS.every((k) => f[k].length === 0) &&
    !f.releasedFrom &&
    !f.releasedTo &&
    !f.firstReleasedFrom &&
    !f.firstReleasedTo
  );
}

/**
 * Rows every figure on the *overview* is computed from.
 *
 * `net_order_val_usd` is the common-currency column — the table also carries native `currency`
 * and `net_order_value`, which cannot be summed across countries.
 */
export const BASE_SCOPE = baseScope();

/** `BASE_SCOPE`, qualified for a query that aliases the table. */
export function baseScope(alias = ''): string {
  const c = col(alias);
  return `${c('po_release_date')} IS NOT NULL AND ${c('net_order_val_usd')} IS NOT NULL`;
}

/**
 * Rows the *past-due* board is computed from: open purchase order lines.
 *
 * This is the warehouse's own definition, not one invented here. `track.po_open` is
 * `release_state = 'Released' AND outstanding_qty > 0 AND NOT is_deleted`, and `track.po_line`
 * derives those three from `core.supplychain` as `status = 'Approved'`, `still_delv_qty`, and
 * an empty `deletion_indicator`. Expressed against the base table it reproduces `track.po_open`
 * exactly — 15,194 lines and $422.11M on the 3 Nov 2026 load, matched line-for-line by joining
 * the two on (purchase_doc, item).
 *
 * Written out rather than selected from the view because the view drops the four dimensions
 * the filter bar needs.
 */
export const OPEN_PO_SCOPE = openPoScope();

/** `OPEN_PO_SCOPE`, qualified for a query that aliases the table. */
export function openPoScope(alias = ''): string {
  const c = col(alias);
  return `${c('status')} = 'Approved'
  AND COALESCE(${c('still_delv_qty')}, 0) > 0
  AND COALESCE(${c('deletion_indicator')}, '') = ''`;
}

export interface FilterSql {
  /** `AND …` fragments, already joined; empty string when nothing is selected. */
  where: string;
  params: unknown[];
}

/**
 * Turns the selected filters into SQL.
 *
 * @param startIndex 1-based position of the first placeholder, so a caller that already has
 *   its own `$1` can append these after it.
 * @param alias table alias to qualify every column with, for a query that joins.
 */
export function buildFilterSql(f: PoFilters, startIndex = 1, alias = ''): FilterSql {
  const clauses: string[] = [];
  const params: unknown[] = [];
  const c = col(alias);
  let i = startIndex;

  for (const key of MULTI_KEYS) {
    const values = f[key];
    if (!values.length) continue;
    clauses.push(`${c(FILTER_COLUMNS[key])} = ANY($${i})`);
    params.push(values);
    i += 1;
  }

  const dateRange = (column: string, from: string | null, to: string | null) => {
    if (from) {
      clauses.push(`${column} >= $${i}::date`);
      params.push(from);
      i += 1;
    }
    if (to) {
      /* `< to + 1 day` rather than `<= to`: the column is a timestamp, and `<= '2026-10-31'`
         compares against midnight and silently drops that whole day. */
      clauses.push(`${column} < ($${i}::date + 1)`);
      params.push(to);
      i += 1;
    }
  };

  dateRange(c('po_release_date'), f.releasedFrom, f.releasedTo);
  dateRange(c('po_first_release_date'), f.firstReleasedFrom, f.firstReleasedTo);

  return { where: clauses.length ? ` AND ${clauses.join(' AND ')}` : '', params };
}

/** Narrows an unknown payload (a server action argument) to a usable filter set. */
export function coerceFilters(raw: unknown): PoFilters {
  const src = (raw ?? {}) as Partial<Record<keyof PoFilters, unknown>>;
  const list = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
  const day = (v: unknown): string | null =>
    typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

  return {
    accountClassification: list(src.accountClassification),
    segment: list(src.segment),
    country: list(src.country),
    purchasingOrg: list(src.purchasingOrg),
    supplier: list(src.supplier),
    buyer: list(src.buyer),
    releasedFrom: day(src.releasedFrom),
    releasedTo: day(src.releasedTo),
    firstReleasedFrom: day(src.firstReleasedFrom),
    firstReleasedTo: day(src.firstReleasedTo),
  };
}

/* ─── Option lists ─────────────────────────────────────────────────────────── */

export interface FilterOption {
  value: string;
  label: string;
  lines: number;
}

export interface PoFilterOptions {
  accountClassification: FilterOption[];
  segment: FilterOption[];
  country: FilterOption[];
  purchasingOrg: FilterOption[];
  supplier: FilterOption[];
  buyer: FilterOption[];
  /** Earliest and latest po_release_date, to bound the date inputs. */
  releaseRange: { min: string | null; max: string | null };
}
