import type { QueryResultRow } from 'pg';
import materialsPool from '@/lib/db-materials';
import { logger } from '@/lib/logger';
import {
  poReleaseFrom,
  prReleaseFrom,
  receiptFrom,
  type SapPo,
  type SapPr,
  type SapStatus,
} from './sap';

/**
 * Live SAP status for a set of PR and PO numbers, read from Materials DB.
 *
 * READ-ONLY, AND NOT OURS. Materials DB is the SAP extract warehouse the data pipeline loads
 * several times a day (released POs from `core.supplychain`, POs still in approval from
 * `core.po_release`, PRs from `core.purchase_requisation` / `core.pr_release`). This reads the
 * curated `track` views over those tables, which resolve SAP's codes into states and document
 * every column in `track.column_guide`. Nothing here writes, and nothing should start to.
 *
 * Read on every page load rather than copied into rrsm_db: a copy needs a sync job and goes stale
 * between runs, and the four lookups for a whole month's cycle take tens of milliseconds.
 */

const log = logger('rrsm-sap-status');

function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : '';
}

export async function readSapStatus(poNumbers: string[], prNumbers: string[]): Promise<SapStatus> {
  const pos = [...new Set(poNumbers.map((p) => p.trim()).filter(Boolean))];
  const prs = [...new Set(prNumbers.map((p) => p.trim()).filter(Boolean))];
  const out: SapStatus = { ok: true, pos: {}, prs: {}, loadedAt: '' };
  if (!pos.length && !prs.length) return out;

  try {
    const [poLines, poWait, prLines, prWait, fresh] = await Promise.all([
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
      prs.length
        ? materialsPool.query<QueryResultRow>(
            `SELECT pr_number,
                    array_agg(release_state) FILTER (WHERE NOT COALESCE(is_deleted, false)) AS states,
                    bool_and(conversion_state = 'Converted to PO')
                      FILTER (WHERE NOT COALESCE(is_deleted, false)) AS converted
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
      materialsPool.query<QueryResultRow>(
        `SELECT last_loaded_at FROM track.data_freshness WHERE source_table = 'supplychain'`,
      ),
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
      };
      out.prs[pr] = entry;
    }

    const loaded = fresh.rows[0]?.last_loaded_at;
    out.loadedAt = loaded instanceof Date ? loaded.toISOString().slice(0, 16) : '';
    return out;
  } catch (err) {
    /* Somebody else's database. A buyer who cannot reach it gets the page with a note saying SAP
       status is unavailable, not a broken screen. */
    log.error('readSapStatus.failed', err, { pos: pos.length, prs: prs.length });
    return { ok: false, pos: {}, prs: {}, loadedAt: '' };
  }
}
