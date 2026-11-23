import type { QueryResultRow } from 'pg';
import materialsPool from '@/lib/db-materials';
import {
  matchServicePos,
  rollupByYear,
  type HistoryPo,
  type HistoryYear,
  type PoLineIn,
} from './po-history';

/**
 * Reads a recurrent service's PO history from Materials DB (`track.po_line`, READ-ONLY, not ours)
 * and works out which POs were for the service; the rules are in ./po-history.
 *
 * Reads every line of the supplier's POs plus any recorded PO from another supplier (a renewal
 * moved to a reseller). A busy supplier has a few thousand lines at most, read in one query.
 */
export interface PoHistory {
  ok: boolean;
  pos: HistoryPo[];
  years: HistoryYear[];
}

function day(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v ?? '').slice(0, 10);
}

export async function readPoHistory(service: {
  text: string;
  supplierName: string;
  supplierCode: string;
  recorded: string[];
}): Promise<PoHistory> {
  const vendor = service.supplierCode.replace(/^0+/, '');
  const recorded = [...new Set(service.recorded.map((p) => p.trim()).filter(Boolean))];
  if (!vendor && !recorded.length) return { ok: true, pos: [], years: [] };

  const { rows } = await materialsPool.query<QueryResultRow>(
    `SELECT po_number, po_item::text AS item, COALESCE(description, '') AS description,
            COALESCE(net_order_value, 0)::float AS value, COALESCE(currency, '') AS currency,
            po_created_on::date::text AS created, COALESCE(release_state, '') AS release_state
       FROM track.po_line
      WHERE NOT COALESCE(is_deleted, false)
        AND po_created_on IS NOT NULL
        AND (($1 <> '' AND ltrim(supplier_num, '0') = $1) OR po_number = ANY($2))`,
    [vendor, recorded],
  );
  const lines: PoLineIn[] = rows.map((r) => ({
    poNumber: String(r.po_number),
    item: String(r.item ?? ''),
    description: String(r.description),
    value: Number(r.value) || 0,
    currency: String(r.currency),
    created: day(r.created),
    releaseState: String(r.release_state),
  }));
  const pos = matchServicePos(service.text, service.supplierName, lines, recorded);
  return { ok: true, pos, years: rollupByYear(pos) };
}
