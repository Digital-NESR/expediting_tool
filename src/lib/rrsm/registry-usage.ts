import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';

/**
 * What RRSM holds under one Service Registry item, for the "In RRSM" panel on the Catalog's item
 * page: the rental units on hire (plate, cost center, segment) or the recurrent service's dates.
 * Read-only. Returns null when RRSM cannot be read, so the Catalog page still renders.
 */
export interface RrsmUsage {
  units: {
    id: number;
    description: string;
    assetRef: string;
    segment: string;
    costCenter: string;
    active: boolean;
    offHireDate: string | null;
  }[];
  recurrent: {
    id: number;
    name: string;
    status: string;
    contractExpiry: string | null;
    lastPoNumber: string | null;
    requesters: string[];
  }[];
}

function day(v: unknown): string | null {
  if (!v) return null;
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);
}

export async function readRrsmUsage(code: string): Promise<RrsmUsage | null> {
  try {
    const [units, recurrent] = await Promise.all([
      rrsmPool.query<QueryResultRow>(
        `SELECT id, description, COALESCE(asset_ref, '') AS asset_ref, segment, cost_center,
                active, off_hire_date
           FROM rrsm_service_lines WHERE registry_code = $1
          ORDER BY active DESC, segment, description`,
        [code],
      ),
      rrsmPool.query<QueryResultRow>(
        `SELECT id, COALESCE(service_name, description) AS name, status, contract_expiry,
                last_po_number, requesters, requester_name
           FROM rrsm_recurrent_services WHERE registry_code = $1`,
        [code],
      ),
    ]);
    return {
      units: units.rows.map((r) => ({
        id: Number(r.id),
        description: String(r.description),
        assetRef: String(r.asset_ref),
        segment: String(r.segment ?? ''),
        costCenter: String(r.cost_center ?? ''),
        active: Boolean(r.active) && !r.off_hire_date,
        offHireDate: day(r.off_hire_date),
      })),
      recurrent: recurrent.rows.map((r) => ({
        id: Number(r.id),
        name: String(r.name),
        status: String(r.status),
        contractExpiry: day(r.contract_expiry),
        lastPoNumber: r.last_po_number ? String(r.last_po_number) : null,
        requesters: (Array.isArray(r.requesters)
          ? (r.requesters as { name?: string; email?: string }[])
          : []
        )
          .map((p) => p.name || p.email || '')
          .filter(Boolean)
          .concat(
            !Array.isArray(r.requesters) && r.requester_name ? [String(r.requester_name)] : [],
          ),
      })),
    };
  } catch (err) {
    logger('rrsm-registry-usage').error('read.failed', err, { code });
    return null;
  }
}
