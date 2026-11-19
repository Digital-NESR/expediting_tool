import type { QueryResultRow } from 'pg';
import materialsPool from '@/lib/db-materials';
import { logger } from '@/lib/logger';
import {
  poReleaseFrom,
  prReleaseFrom,
  receiptFrom,
  type PrCandidate,
  type SapPo,
  type SapPr,
  type SapStatus,
} from './sap';

/**
 * Live SAP status for a set of PR and PO numbers, read from Materials DB.
 *
 * READ-ONLY, AND NOT OURS. Materials DB is the SAP extract warehouse the data pipeline loads
 * several times a day (POs from `core.supplychain`, POs in approval from `core.po_release`, PRs
 * from `core.purchase_requisation` / `core.pr_release`). This reads the curated `track` views over
 * those tables, which resolve SAP's codes into states and document every column in
 * `track.column_guide`. Nothing here writes, and nothing should start to.
 *
 * WHERE EACH STAGE IS VISIBLE. A PR and its approval are in the PR tables from the day it is
 * raised. The PR table also says when a PR went onto a PO, but never which PO. The PO number comes
 * from the PO side: `supplychain` holds a PO from the moment it is created, released or not, and
 * each of its lines names the PR it came from (not always on a fresh draft, which is why a PR can
 * sit at "converted, PO not in the data yet" for a load or two). `po_release` adds who an
 * unreleased PO is waiting with. So: PRs first, then the POs found from them, then every PO's
 * status in one pass.
 *
 * Read on every page load rather than copied into rrsm_db: a copy needs a sync job and goes stale
 * between runs, and these lookups for a whole month's cycle take well under a second.
 */

const log = logger('rrsm-sap-status');

function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : '';
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean))];
}

export async function readSapStatus(poNumbers: string[], prNumbers: string[]): Promise<SapStatus> {
  const prs = uniq(prNumbers);
  const out: SapStatus = { ok: true, pos: {}, prs: {}, loadedAt: '' };
  if (!uniq(poNumbers).length && !prs.length) return out;

  try {
    /* 1. The PRs: their approval, whether SAP has put them on a PO, and which POs name them. */
    const [prLines, prWait, prPos, fresh] = await Promise.all([
      prs.length
        ? materialsPool.query<QueryResultRow>(
            `SELECT pr_number,
                    array_agg(release_state) FILTER (WHERE NOT COALESCE(is_deleted, false)) AS states,
                    bool_and(conversion_state = 'Converted to PO')
                      FILTER (WHERE NOT COALESCE(is_deleted, false)) AS converted,
                    MAX(purchase_order_date)
                      FILTER (WHERE conversion_state <> 'Open') AS converted_on
               FROM track.pr_line WHERE pr_number = ANY($1) GROUP BY pr_number`,
            [prs],
          )
        : null,
      prs.length
        ? materialsPool.query<QueryResultRow>(
            `SELECT pr_number, MIN(waiting_with) AS waiting_with, MAX(days_waiting) AS days
               FROM track.pr_waiting_with WHERE pr_number = ANY($1) GROUP BY pr_number`,
            [prs],
          )
        : null,
      prs.length
        ? materialsPool.query<QueryResultRow>(
            `SELECT pr_number, array_agg(DISTINCT po_number ORDER BY po_number) AS pos
               FROM track.po_line
              WHERE pr_number = ANY($1) AND NOT COALESCE(is_deleted, false)
              GROUP BY pr_number`,
            [prs],
          )
        : null,
      materialsPool.query<QueryResultRow>(
        `SELECT last_loaded_at FROM track.data_freshness WHERE source_table = 'supplychain'`,
      ),
    ]);

    const posOfPr = new Map(
      (prPos?.rows ?? []).map((r) => [String(r.pr_number), (r.pos ?? []).map(String) as string[]]),
    );
    const prWaiting = new Map((prWait?.rows ?? []).map((r) => [String(r.pr_number), r]));
    for (const r of prLines?.rows ?? []) {
      const pr = String(r.pr_number);
      const w = prWaiting.get(pr);
      const entry: SapPr = {
        pr,
        release: prReleaseFrom((r.states ?? []).map(String)),
        converted: Boolean(r.converted),
        waitingWith: w?.waiting_with ? String(w.waiting_with) : null,
        daysWaiting: w?.days === null || w?.days === undefined ? null : Number(w.days),
        convertedOn: day(r.converted_on),
        pos: posOfPr.get(pr) ?? [],
      };
      out.prs[pr] = entry;
    }

    /* 2. Every PO's status: the ones recorded on lines plus the ones just found from PRs. */
    const pos = uniq([...poNumbers, ...[...posOfPr.values()].flat()]);
    const [poLines, poWait] = await Promise.all([
      pos.length
        ? materialsPool.query<QueryResultRow>(
            `SELECT po_number,
                    array_agg(release_state) AS states,
                    array_agg(COALESCE(is_deleted, false)) AS deleted,
                    array_agg(receipt_state) AS receipts,
                    bool_and(COALESCE(is_service_line, false)) AS is_service,
                    bool_or(gr_posting_date IS NOT NULL OR last_migo IS NOT NULL) AS has_receipt,
                    SUM(net_order_value) FILTER (WHERE NOT COALESCE(is_deleted, false)) AS value,
                    MIN(currency) AS currency,
                    MIN(po_created_on) AS created_on,
                    MAX(po_release_date) AS released_on,
                    MAX(GREATEST(gr_posting_date, last_migo)) AS last_receipt
               FROM track.po_line
              WHERE po_number = ANY($1)
              GROUP BY po_number`,
            [pos],
          )
        : null,
      pos.length
        ? materialsPool.query<QueryResultRow>(
            `SELECT po_number, MIN(waiting_with) AS waiting_with, MAX(days_waiting) AS days
               FROM track.po_waiting_with WHERE po_number = ANY($1) GROUP BY po_number`,
            [pos],
          )
        : null,
    ]);

    const poWaiting = new Map((poWait?.rows ?? []).map((r) => [String(r.po_number), r]));
    for (const r of poLines?.rows ?? []) {
      const po = String(r.po_number);
      const states: string[] = (r.states ?? []).map(String);
      const deleted: boolean[] = (r.deleted ?? []).map(Boolean);
      const release = poReleaseFrom(states.map((state, i) => ({ state, deleted: deleted[i] })));
      const w = poWaiting.get(po);
      const entry: SapPo = {
        po,
        release,
        waitingWith: w?.waiting_with ? String(w.waiting_with) : null,
        daysWaiting: w?.days === null || w?.days === undefined ? null : Number(w.days),
        receipt: receiptFrom({
          release,
          isService: Boolean(r.is_service),
          receiptStates: (r.receipts ?? []).map(String),
          hasReceiptDate: Boolean(r.has_receipt),
        }),
        value: r.value === null ? null : Number(r.value),
        currency: String(r.currency ?? ''),
        createdOn: day(r.created_on),
        releasedOn: day(r.released_on),
        lastReceiptOn: day(r.last_receipt),
      };
      out.pos[po] = entry;
    }

    const loaded = fresh.rows[0]?.last_loaded_at;
    out.loadedAt = loaded instanceof Date ? loaded.toISOString().slice(0, 16) : '';
    return out;
  } catch (err) {
    /* Somebody else's database. A buyer who cannot reach it gets the page with a note saying SAP
       status is unavailable, not a broken screen. */
    log.error('readSapStatus.failed', err, { pos: poNumbers.length, prs: prs.length });
    return { ok: false, pos: {}, prs: {}, loadedAt: '' };
  }
}

/**
 * PRs SAP has put on a service PO for one supplier between two dates: the candidates for a line.
 *
 * From the PO side because SAP's PRs carry no vendor (none of Abu Dhabi's November PRs has a fixed
 * or desired vendor), so a PR that is not on a PO yet cannot be tied to a supplier at all. Those
 * the buyer types. Service lines only, which keeps the same supplier's spare parts and diesel out.
 */
export async function readPrCandidates(
  supplierCode: string,
  from: string,
  to: string,
): Promise<PrCandidate[] | null> {
  const code = String(supplierCode ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
  if (!code) return [];
  try {
    const { rows } = await materialsPool.query<QueryResultRow>(
      `SELECT pr_number,
              array_agg(DISTINCT po_number ORDER BY po_number) AS pos,
              SUM(net_order_value) AS value,
              MIN(currency) AS currency,
              MAX(po_created_on) AS created_on,
              MIN(NULLIF(trim(description), '')) AS description
         FROM track.po_line
        WHERE ltrim(supplier_num, '0') = $1
          AND COALESCE(is_service_line, false)
          AND NOT COALESCE(is_deleted, false)
          AND COALESCE(pr_number, '') <> ''
          AND po_created_on >= $2::date AND po_created_on < $3::date
        GROUP BY pr_number
        LIMIT 40`,
      [code, from, to],
    );
    return rows.map((r) => ({
      pr: String(r.pr_number),
      pos: (r.pos ?? []).map(String),
      value: r.value === null ? null : Number(r.value),
      currency: String(r.currency ?? ''),
      createdOn: day(r.created_on),
      description: String(r.description ?? ''),
    }));
  } catch (err) {
    log.error('readPrCandidates.failed', err, { supplierCode: code });
    return null;
  }
}
