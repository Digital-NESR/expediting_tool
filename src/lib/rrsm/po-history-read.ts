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

/** One PO's value for a service, as SAP has it. */
export interface PoValue {
  poNumber: string;
  value: number;
  currency: string;
  created: string;
  releaseState: string;
  /** The first line counted, to recognise the PO by. */
  description: string;
  /** Lines on the PO left out as belonging to something else (a shared PO). */
  otherLines: number;
  supplierCode: string;
  supplierName: string;
}

/**
 * What a PO is worth for a service: the PO's lines that name the service, or the whole PO when
 * none does. Null when SAP does not have the PO (yet: a PO can take a load or two to appear).
 */
export async function readPoValue(input: {
  poNumber: string;
  text: string;
  supplierName: string;
}): Promise<PoValue | null> {
  const po = input.poNumber.trim();
  if (!/^\d{6,12}$/.test(po)) return null;
  const { rows } = await materialsPool.query<QueryResultRow>(
    `SELECT po_number, po_item::text AS item, COALESCE(description, '') AS description,
            COALESCE(net_order_value, 0)::float AS value, COALESCE(currency, '') AS currency,
            po_created_on::date::text AS created, COALESCE(release_state, '') AS release_state,
            ltrim(COALESCE(supplier_num, ''), '0') AS supplier_code,
            COALESCE(supplier_name, '') AS supplier_name
       FROM track.po_line
      WHERE po_number = $1 AND NOT COALESCE(is_deleted, false)`,
    [po],
  );
  if (!rows.length) return null;
  const lines: PoLineIn[] = rows.map((r) => ({
    poNumber: String(r.po_number),
    item: String(r.item ?? ''),
    description: String(r.description),
    value: Number(r.value) || 0,
    currency: String(r.currency),
    created: day(r.created),
    releaseState: String(r.release_state),
  }));
  const [hit] = matchServicePos(input.text, input.supplierName, lines, [po]);
  if (!hit) return null;
  return {
    poNumber: po,
    value: hit.value,
    currency: hit.currency,
    created: hit.created,
    releaseState: hit.releaseState,
    description: hit.lines[0]?.description ?? '',
    otherLines: hit.otherLines,
    supplierCode: String(rows[0].supplier_code),
    supplierName: String(rows[0].supplier_name),
  };
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
