'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { canAccessCountry, currentRrsmActor, rolesIn } from '@/lib/rrsm/access';
import type { CycleStage } from '@/lib/rrsm/cycle';

/**
 * RRSM · Reports: what a country is getting, by supplier and by category (user request,
 * 25 Nov 2026).
 *
 * One flat list of units for the chosen source; the page groups it either way round, so the two
 * views always add up to the same total. The source is a month (its cycle lines, with the quantity
 * and rate that month carries) or, for a country with no month open yet, what is on hire on the
 * register today.
 *
 * EVERY EXPORT IS A PUBLIC POST ENDPOINT: it re-checks that the caller buys for the country.
 */

const log = logger('rrsm-reports');

export interface ReportUnit {
  supplierCode: string;
  supplierName: string;
  category: string;
  description: string;
  assetRef: string;
  segment: string;
  costCenter: string;
  uom: string;
  qty: number;
  rate: number | null;
  value: number;
  /** The line's stage in that month; null when reading the register. */
  stage: CycleStage | null;
  onHire: boolean;
}

export interface ReportSource {
  /** 'register' or a cycle id. */
  key: string;
  label: string;
}

export interface RrsmReport {
  sources: ReportSource[];
  /** The source shown. */
  source: string;
  units: ReportUnit[];
}

const EMPTY: RrsmReport = { sources: [], source: 'register', units: [] };

function monthLabel(v: unknown): string {
  const d = v instanceof Date ? v : new Date(String(v).slice(0, 10) + 'T00:00:00Z');
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export async function getRrsmReport(
  countryCode: string,
  requested?: string | null,
): Promise<RrsmReport> {
  try {
    const actor = await currentRrsmActor();
    const code = String(countryCode ?? '').trim();
    if (!actor || !code || !canAccessCountry(actor, code, 'buyer')) return EMPTY;
    if (!rolesIn(actor, code).canBuy) return EMPTY;

    const { rows: cycles } = await rrsmPool.query<QueryResultRow>(
      `SELECT id, period FROM rrsm_cycles WHERE country_code = $1 ORDER BY period DESC`,
      [code],
    );
    const sources: ReportSource[] = [
      ...cycles.map((c) => ({ key: String(c.id), label: monthLabel(c.period) })),
      { key: 'register', label: 'On hire now (register)' },
    ];
    /* The latest month by default; the register when the country has no month yet. */
    const source = sources.some((s) => s.key === requested)
      ? String(requested)
      : (sources[0]?.key ?? 'register');

    const { rows } =
      source === 'register'
        ? await rrsmPool.query<QueryResultRow>(
            `SELECT s.supplier_code, sup.name AS supplier_name, COALESCE(s.category, '') AS category,
                    s.description, COALESCE(s.asset_ref, '') AS asset_ref, s.segment,
                    s.cost_center, s.uom, 1 AS qty, s.rate, COALESCE(s.rate, 0) AS value,
                    NULL AS stage, TRUE AS on_hire
               FROM rrsm_service_lines s
               JOIN rrsm_suppliers sup ON sup.code = s.supplier_code
              WHERE s.country_code = $1 AND s.active AND s.off_hire_date IS NULL`,
            [code],
          )
        : await rrsmPool.query<QueryResultRow>(
            `SELECT s.supplier_code, sup.name AS supplier_name, COALESCE(s.category, '') AS category,
                    s.description, COALESCE(s.asset_ref, '') AS asset_ref, s.segment,
                    s.cost_center, COALESCE(l.uom, s.uom) AS uom, l.qty, l.rate, l.value,
                    l.stage, l.on_hire
               FROM rrsm_cycle_lines l
               JOIN rrsm_cycles c        ON c.id = l.cycle_id
               JOIN rrsm_service_lines s ON s.id = l.service_line_id
               JOIN rrsm_suppliers sup   ON sup.code = s.supplier_code
              WHERE l.cycle_id = $1 AND c.country_code = $2`,
            [Number(source), code],
          );

    return {
      sources,
      source,
      units: rows.map((r) => ({
        supplierCode: String(r.supplier_code),
        supplierName: String(r.supplier_name),
        category: String(r.category || 'Uncategorised'),
        description: String(r.description),
        assetRef: String(r.asset_ref ?? ''),
        segment: String(r.segment ?? ''),
        costCenter: String(r.cost_center ?? ''),
        uom: String(r.uom ?? ''),
        qty: Number(r.qty ?? 0),
        rate: r.rate === null || r.rate === undefined ? null : Number(r.rate),
        value: Number(r.value ?? 0),
        stage: r.stage ? (String(r.stage) as CycleStage) : null,
        onHire: Boolean(r.on_hire),
      })),
    };
  } catch (err) {
    log.error('getRrsmReport.failed', err, { countryCode });
    return EMPTY;
  }
}
