import type { QueryResultRow } from 'pg';
import rfxOfficerPool from '@/lib/db-rfx-officer';
import { logger } from '@/lib/logger';

/**
 * Service purchase requisitions, read live from RFx Officer.
 *
 * RRSM's buyer screen starts from a released PR and converts its open items into a PO, so it
 * needs the PR lines SAP has released against a service account. Those already exist in RFx
 * Officer's `released_prs`, which ProcureGuard also reads for its requisition picker, so this
 * module reads the same table rather than keeping a copy in `rrsm_db`. A copy would need a sync
 * job, would go stale between runs, and would give two answers to "what is on PR 1012004192".
 *
 * READ-ONLY, AND NOT OURS. `rfx_officer` is RFx Officer's production database and is marked
 * `readOnly` in database/migrations/databases.mjs, so the migration runner refuses it and the
 * manifest test refuses to let it grow a migrations folder. Nothing in this file writes, and
 * nothing in this file should ever start to.
 *
 * WHAT COUNTS AS A SERVICE. `account_classification_description = 'Services'` — 1,130 lines over
 * 542 PRs at the time of writing. Deliberately not SAP's own service flag `item_category_2 = 'D'`,
 * which returns 1,132: the extra two are classified `Asset Services`, and those are out of scope
 * by decision rather than by oversight.
 *
 * THERE IS NO PRICE HERE. `quantity` is the only numeric column on the table; the feed carries no
 * net price, value or rate. So a PR line can say how much of something was asked for and never
 * what it costs, and the rate on an RRSM screen has to come from `rrsm_service_lines`. Anyone
 * adding a "value" column to this module's output is about to invent a number.
 */

const log = logger('rrsm-released-prs');

/** Every row in this slice is `closed = ''` and `release_indicator = '2'`, so released and open. */
const SERVICES = `account_classification_description = 'Services'`;

/** Enough rows to find what you meant, few enough to read without scrolling. */
const LIMIT = 50;

export interface ServicePrSummary {
  /** The ten-digit requisition number. */
  pr: string;
  /** The first line's description, which is what makes one PR recognisable among many. */
  description: string;
  /** Service lines on the requisition. */
  lines: number;
  /** The feed's own spelling, not an RRSM country code. See `feedCountryKey`. */
  country: string;
  requisitioner: string;
  /** Release date as `yyyy-mm-dd`, or '' where the feed has none. */
  releasedOn: string;
}

export interface ServicePrLine {
  pr: string;
  /** SAP item number, zero-padded: '00010'. */
  item: string;
  description: string;
  /** From the feed. Never a value — there is no price column; see the note above. */
  quantity: number;
  uom: string;
  /** 'TRVL002', 'SAFE005' — the nearest thing the feed has to a kind of service. */
  materialGroup: string;
  plant: string;
  deliveryDate: string;
}

/**
 * A country name reduced to something the feed and RRSM can be compared on.
 *
 * The two lists do not agree. `rrsm_countries` carries Catalog Manager's names, so
 * `Saudi Arabia (KSA)` and `United Arab Emirates (UAE)`, where the feed says `Saudi Arabia` and
 * `United Arab Emirates`. Dropping the parenthetical and folding case reconciles those.
 *
 * Two mismatches it CANNOT reconcile, both of which are facts about the data rather than bugs
 * here:
 *
 *   - `HQ Dubai` and `EOS` are NESR operating entities, not countries, and the feed has no
 *     notion of either. A buyer scoped to one of them matches nothing.
 *   - The feed carries `Syria` (16 lines over 9 PRs), which is not one of the nineteen countries
 *     at all. Those lines are reachable only with no country filter.
 */
export function feedCountryKey(country: string | null | undefined): string {
  return String(country ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

/**
 * Released service PRs, newest first, optionally narrowed to one country.
 *
 * The country FILTERS here, unlike ProcureGuard's picker where it only sorts. The difference is
 * what the list is for: ProcureGuard offers a convenience beside a field that accepts a typed
 * number anyway, so an over-filtered list costs a requester nothing they cannot type around. An
 * RRSM buyer works one country's cycle and a list carrying another country's requisitions is a
 * list they have to re-filter by eye. Pass no country to see everything.
 */
export async function listServicePrs(
  query: string,
  country?: string | null,
): Promise<ServicePrSummary[]> {
  const q = String(query ?? '').trim();
  const key = feedCountryKey(country);

  try {
    const { rows } = await rfxOfficerPool.query<QueryResultRow>(
      `SELECT trim(purchase_requisition)             AS pr,
              COUNT(*)::int                          AS lines,
              MIN(NULLIF(trim(description), ''))     AS description,
              MIN(NULLIF(trim(country), ''))         AS country,
              MIN(NULLIF(trim(requisitioner), ''))   AS requisitioner,
              MAX(pr_release_date_final)             AS released_on
         FROM released_prs
        WHERE ${SERVICES}
          AND ($1 = '' OR trim(purchase_requisition) LIKE $1 || '%'
                       OR description ILIKE '%' || $1 || '%')
          AND ($2 = '' OR lower(trim(COALESCE(country, ''))) = $2)
        GROUP BY trim(purchase_requisition)
        ORDER BY MAX(pr_release_date_final) DESC NULLS LAST,
                 trim(purchase_requisition) DESC
        LIMIT $3`,
      [q, key, LIMIT],
    );

    return rows.map(toSummary);
  } catch (err) {
    /* An empty list rather than a thrown page, the same choice ProcureGuard's picker makes: this
       is somebody else's database and a buyer who cannot reach it should see an empty picker,
       not a broken screen. */
    log.error('listServicePrs.failed', err, { query: q });
    return [];
  }
}

/** The service lines on one requisition, in SAP item order. */
export async function servicePrLines(pr: string): Promise<ServicePrLine[]> {
  const number = String(pr ?? '').trim();
  if (!number) return [];

  try {
    const { rows } = await rfxOfficerPool.query<QueryResultRow>(
      `SELECT trim(purchase_requisition) AS pr,
              trim(item_of_requisition)  AS item,
              trim(description)          AS description,
              quantity,
              trim(unit_of_measure)      AS uom,
              trim(material_group)       AS material_group,
              trim(plant)                AS plant,
              delivery_date
         FROM released_prs
        WHERE ${SERVICES} AND trim(purchase_requisition) = $1
        ORDER BY trim(item_of_requisition)`,
      [number],
    );

    return rows.map((r) => ({
      pr: String(r.pr ?? ''),
      item: String(r.item ?? ''),
      description: String(r.description ?? ''),
      quantity: Number(r.quantity ?? 0),
      uom: String(r.uom ?? ''),
      materialGroup: String(r.material_group ?? ''),
      plant: String(r.plant ?? ''),
      deliveryDate: asDate(r.delivery_date),
    }));
  } catch (err) {
    log.error('servicePrLines.failed', err, { pr: number });
    return [];
  }
}

function toSummary(r: QueryResultRow): ServicePrSummary {
  return {
    pr: String(r.pr ?? ''),
    description: String(r.description ?? ''),
    lines: Number(r.lines ?? 0),
    country: String(r.country ?? ''),
    requisitioner: String(r.requisitioner ?? ''),
    releasedOn: asDate(r.released_on),
  };
}

/** `yyyy-mm-dd`, or '' when the feed has no date. */
function asDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : '';
}
