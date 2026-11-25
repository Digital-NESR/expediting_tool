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
 * Read live rather than copied into rrsm_db: a copy needs a sync job and goes stale between runs.
 *
 * CACHED FOR A FEW MINUTES, per PR, per PO and per supplier (25 Nov 2026). Materials DB is loaded
 * a few times a day, so a five-minute-old answer is as current as a fresh one, and reading it on
 * every render was what made RRSM laggy: `track.po_line` has no index on `pr_number` or the
 * supplier, so one lookup costs ~0.6 s, and every click on PR & PO re-rendered the page and paid it
 * again (once per supplier for PR matching). The cache lives in the server instance's memory: a
 * cold instance reads once and every render after that is free. Misses are cached too, so a PR SAP
 * does not have yet is not looked up on every click.
 */

const log = logger('rrsm-sap-status');

const TTL_MS = 5 * 60 * 1000;
/** Bounded so a long-lived instance cannot grow without limit; oldest entries go first. */
const MAX_ENTRIES = 5000;

class TtlCache<V> {
  private map = new Map<string, { at: number; value: V }>();
  get(key: string): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (Date.now() - hit.at > TTL_MS) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }
  set(key: string, value: V): void {
    if (this.map.size >= MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { at: Date.now(), value });
  }
}

/* `null` marks "asked, and SAP has nothing": a miss is worth remembering as much as a hit. */
const prCache = new TtlCache<SapPr | null>();
const poCache = new TtlCache<SapPo | null>();
const freshCache = new TtlCache<string>();
const candidateCache = new TtlCache<PrCandidate[]>();

function day(v: unknown): string {
  return v instanceof Date ? v.toISOString().slice(0, 10) : '';
}

function uniq(values: string[]): string[] {
  return [...new Set(values.map((v) => String(v ?? '').trim()).filter(Boolean))];
}

export async function readSapStatus(poNumbers: string[], prNumbers: string[]): Promise<SapStatus> {
  const allPrs = uniq(prNumbers);
  const out: SapStatus = { ok: true, pos: {}, prs: {}, loadedAt: '' };
  if (!uniq(poNumbers).length && !allPrs.length) return out;

  /* What the cache already knows is answered from it; only the rest goes to Materials DB. */
  for (const pr of allPrs) {
    const hit = prCache.get(pr);
    if (hit) out.prs[pr] = hit;
  }
  const prs = allPrs.filter((pr) => !prCache.has(pr));
  const cachedFresh = freshCache.get('supplychain');

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
      cachedFresh !== undefined
        ? null
        : materialsPool.query<QueryResultRow>(
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
      prCache.set(pr, entry);
    }
    /* Asked about and not in SAP: remembered as such. */
    for (const pr of prs) if (!out.prs[pr]) prCache.set(pr, null);

    /* 2. Every PO's status: the ones recorded on lines plus the ones found from PRs (cached or
       fresh). Again only the ones the cache does not know. */
    const allPos = uniq([
      ...poNumbers,
      ...[...posOfPr.values()].flat(),
      ...Object.values(out.prs).flatMap((p) => p.pos),
    ]);
    for (const po of allPos) {
      const hit = poCache.get(po);
      if (hit) out.pos[po] = hit;
    }
    const pos = allPos.filter((po) => !poCache.has(po));
    const [poLines, poWait, poGr] = await Promise.all([
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
      /* GR document numbers (type WE) from the GR/IR ledger: the only place Materials DB keeps
         one; track.goods_receipt has none. Open items only, which is why RRSM saves them. */
      pos.length
        ? materialsPool
            .query<QueryResultRow>(
              `SELECT purchasing_doc AS po_number,
                      array_agg(DISTINCT document_number ORDER BY document_number) AS docs
                 FROM core.ub_grir
                WHERE purchasing_doc = ANY($1) AND document_type = 'WE'
                GROUP BY purchasing_doc`,
              [pos],
            )
            .catch((err) => {
              log.warn('readSapStatus.grDocs.failed', { error: (err as Error).message });
              return null;
            })
        : null,
    ]);
    const grOf = new Map(
      (poGr?.rows ?? []).map((r) => [String(r.po_number), (r.docs ?? []).map(String) as string[]]),
    );

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
        grDocs: grOf.get(po) ?? [],
      };
      out.pos[po] = entry;
      poCache.set(po, entry);
    }
    for (const po of pos) if (!out.pos[po]) poCache.set(po, null);

    if (cachedFresh !== undefined) out.loadedAt = cachedFresh;
    else {
      const loaded = fresh?.rows[0]?.last_loaded_at;
      out.loadedAt = loaded instanceof Date ? loaded.toISOString().slice(0, 16) : '';
      freshCache.set('supplychain', out.loadedAt);
    }
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
  const code = vendorKey(supplierCode);
  if (!code) return [];
  const cached = candidateCache.get(`${code}|${from}|${to}`);
  if (cached) return cached;
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
    const list = rows.map(toCandidate);
    candidateCache.set(`${code}|${from}|${to}`, list);
    return list;
  } catch (err) {
    log.error('readPrCandidates.failed', err, { supplierCode: code });
    return null;
  }
}

/** SAP vendor numbers come zero-padded on one side and not the other. */
function vendorKey(code: string): string {
  return String(code ?? '')
    .trim()
    .replace(/^0+(?=\d)/, '');
}

function toCandidate(r: QueryResultRow): PrCandidate {
  return {
    pr: String(r.pr_number),
    pos: (r.pos ?? []).map(String),
    value: r.value === null ? null : Number(r.value),
    currency: String(r.currency ?? ''),
    createdOn: day(r.created_on),
    description: String(r.description ?? ''),
  };
}

/**
 * `readPrCandidates` for many suppliers in ONE query, keyed by the supplier code as given.
 *
 * The board matches PRs for every supplier with an unlinked line on each render. One query per
 * supplier, one after another, was ~0.6 s each: 15-30 s for a country with 25-50 suppliers and no
 * PRs yet. Same filters and the same 40-per-supplier cap, cached per supplier like the single one.
 * Null when Materials DB could not be read.
 */
export async function readPrCandidatesMany(
  supplierCodes: string[],
  from: string,
  to: string,
): Promise<Map<string, PrCandidate[]> | null> {
  const out = new Map<string, PrCandidate[]>();
  const want = new Map<string, string[]>();
  for (const given of uniq(supplierCodes)) {
    const key = vendorKey(given);
    if (!key) continue;
    const hit = candidateCache.get(`${key}|${from}|${to}`);
    if (hit) out.set(given, hit);
    else want.set(key, [...(want.get(key) ?? []), given]);
  }
  if (!want.size) return out;
  try {
    const { rows } = await materialsPool.query<QueryResultRow>(
      `SELECT supplier, pr_number, pos, value, currency, created_on, description
         FROM (SELECT ltrim(supplier_num, '0') AS supplier, pr_number,
                      array_agg(DISTINCT po_number ORDER BY po_number) AS pos,
                      SUM(net_order_value) AS value,
                      MIN(currency) AS currency,
                      MAX(po_created_on) AS created_on,
                      MIN(NULLIF(trim(description), '')) AS description,
                      row_number() OVER (PARTITION BY ltrim(supplier_num, '0') ORDER BY pr_number) AS n
                 FROM track.po_line
                WHERE ltrim(supplier_num, '0') = ANY($1)
                  AND COALESCE(is_service_line, false)
                  AND NOT COALESCE(is_deleted, false)
                  AND COALESCE(pr_number, '') <> ''
                  AND po_created_on >= $2::date AND po_created_on < $3::date
                GROUP BY ltrim(supplier_num, '0'), pr_number) x
        WHERE n <= 40`,
      [[...want.keys()], from, to],
    );
    const found = new Map<string, PrCandidate[]>();
    for (const r of rows) {
      const key = String(r.supplier);
      found.set(key, [...(found.get(key) ?? []), toCandidate(r)]);
    }
    for (const [key, givens] of want) {
      const list = found.get(key) ?? [];
      candidateCache.set(`${key}|${from}|${to}`, list);
      for (const g of givens) out.set(g, list);
    }
    return out;
  } catch (err) {
    log.error('readPrCandidatesMany.failed', err, { suppliers: want.size });
    return null;
  }
}
