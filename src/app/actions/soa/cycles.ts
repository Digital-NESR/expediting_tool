'use server';

/**
 * Opening a cycle, taking its spend snapshot, and scoping a country.
 *
 * EVERY export of a `'use server'` module is a public POST endpoint, so each one below starts with
 * its own guard. Opening a cycle and running an extract are admin-only; scoping a country is the
 * champion's own job for their own country.
 */

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { ensureSoaSchema, exec, sql } from '@/lib/soa/db';
import { requireSoaActor, requireSoaCountry } from '@/lib/soa/access';
import { runExtract, windowFor, type ExtractSummary } from '@/lib/soa/extract';
import { scopeCountry, type CountryScopeSummary } from '@/lib/soa/scope';

const log = logger('soa-cycles');

export interface SoaCycle {
  id: number;
  label: string;
  period_start: string;
  period_end: string;
  submission_deadline: string;
  coverage_target_pct: number;
  year_end_target_pct: number;
  vendor_threshold_usd: number;
  lookback_months: number;
  is_active: boolean;
  extract_from: string | null;
  extract_to: string | null;
  extracted_at: string | null;
}

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

const asDate = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : v ? String(v).slice(0, 10) : '';

function serialiseCycle(r: QueryResultRow): SoaCycle {
  return {
    id: Number(r.id),
    label: String(r.label),
    period_start: asDate(r.period_start),
    period_end: asDate(r.period_end),
    submission_deadline: asDate(r.submission_deadline),
    coverage_target_pct: Number(r.coverage_target_pct),
    year_end_target_pct: Number(r.year_end_target_pct),
    vendor_threshold_usd: Number(r.vendor_threshold_usd),
    lookback_months: Number(r.lookback_months),
    is_active: r.is_active === true,
    extract_from: r.extract_from ? asDate(r.extract_from) : null,
    extract_to: r.extract_to ? asDate(r.extract_to) : null,
    extracted_at: r.extracted_at instanceof Date ? r.extracted_at.toISOString() : null,
  };
}

/** Every cycle, newest period first. Any approved user — a champion needs to know the deadline. */
export async function getSoaCycles(): Promise<SoaCycle[]> {
  try {
    await requireSoaActor('viewer');
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM cycles ORDER BY period_start DESC`);
    return rows.map(serialiseCycle);
  } catch (err) {
    log.error('getSoaCycles.failed', err);
    return [];
  }
}

/** The cycle the tool opens on, or null when an admin has not opened one yet. */
export async function getActiveSoaCycle(): Promise<SoaCycle | null> {
  try {
    await requireSoaActor('viewer');
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM cycles WHERE is_active LIMIT 1`);
    return rows.length ? serialiseCycle(rows[0]) : null;
  } catch (err) {
    log.error('getActiveSoaCycle.failed', err);
    return null;
  }
}

/**
 * Open a cycle.
 *
 * The thresholds are stored on the cycle rather than read from a constant, so changing next
 * quarter's coverage target leaves last quarter's evidence describing the rule it was actually
 * judged against.
 */
export async function createSoaCycle(input: {
  label: string;
  periodStart: string;
  periodEnd: string;
  submissionDeadline: string;
  coverageTargetPct?: number;
  yearEndTargetPct?: number;
  vendorThresholdUsd?: number;
  lookbackMonths?: number;
  makeActive?: boolean;
}): Promise<SoaResult<SoaCycle>> {
  try {
    await requireSoaActor('admin');
    await ensureSoaSchema();

    const label = input.label.trim();
    if (!label) return { success: false, error: 'A label is required, e.g. "Q3 2026".' };
    if (!(new Date(input.periodStart) < new Date(input.periodEnd))) {
      return { success: false, error: 'The period must start before it ends.' };
    }

    const rows = await sql<QueryResultRow[]>(
      `INSERT INTO cycles (label, period_start, period_end, submission_deadline,
                           coverage_target_pct, year_end_target_pct, vendor_threshold_usd,
                           lookback_months)
       VALUES (?, ?, ?, ?, COALESCE(?, 70), COALESCE(?, 95), COALESCE(?, 250000), COALESCE(?, 18))
       ON CONFLICT (label) DO UPDATE SET
         period_start = EXCLUDED.period_start,
         period_end = EXCLUDED.period_end,
         submission_deadline = EXCLUDED.submission_deadline,
         coverage_target_pct = EXCLUDED.coverage_target_pct,
         year_end_target_pct = EXCLUDED.year_end_target_pct,
         vendor_threshold_usd = EXCLUDED.vendor_threshold_usd,
         lookback_months = EXCLUDED.lookback_months
       RETURNING *`,
      [
        label,
        input.periodStart,
        input.periodEnd,
        input.submissionDeadline,
        input.coverageTargetPct ?? null,
        input.yearEndTargetPct ?? null,
        input.vendorThresholdUsd ?? null,
        input.lookbackMonths ?? null,
      ],
    );

    const cycle = serialiseCycle(rows[0]);
    if (input.makeActive) await activateCycleRow(cycle.id);

    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true, data: cycle };
  } catch (err) {
    log.error('createSoaCycle.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not open the cycle.',
    };
  }
}

/* A partial unique index allows only one active cycle, so the previous one has to be stood down
   in the same statement pair. Not exported: nothing outside this module should be able to flip
   the active cycle without going through the guarded action below. */
async function activateCycleRow(cycleId: number): Promise<void> {
  await exec(`UPDATE cycles SET is_active = FALSE WHERE is_active AND id <> ?`, [cycleId]);
  await exec(`UPDATE cycles SET is_active = TRUE WHERE id = ?`, [cycleId]);
}

/** Make one cycle the active one; the previous active cycle is stood down. */
export async function activateSoaCycle(cycleId: number): Promise<SoaResult> {
  try {
    await requireSoaActor('admin');
    await activateCycleRow(cycleId);
    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true };
  } catch (err) {
    log.error('activateSoaCycle.failed', err);
    return { success: false, error: 'Could not activate the cycle.' };
  }
}

/**
 * Take the cycle's spend snapshot from historic_spend.
 *
 * Slow by the standards of a server action — it aggregates every GRN'd PO line in the window — so
 * it is deliberately a thing an admin triggers once per cycle rather than something that happens
 * on a page load.
 */
export async function runSoaExtract(cycleId: number): Promise<SoaResult<ExtractSummary>> {
  try {
    await requireSoaActor('admin');
    const rows = await sql<QueryResultRow[]>(
      `SELECT id, period_end, lookback_months FROM cycles WHERE id = ?`,
      [cycleId],
    );
    if (!rows.length) return { success: false, error: 'No such cycle.' };

    const summary = await runExtract(
      windowFor({
        id: Number(rows[0].id),
        period_end: rows[0].period_end as Date,
        lookback_months: Number(rows[0].lookback_months),
      }),
    );

    revalidatePath('/admin/soa');
    revalidatePath('/soa-consolidation');
    return { success: true, data: summary };
  } catch (err) {
    log.error('runSoaExtract.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'The extract failed.',
    };
  }
}

/**
 * Scope one country against the active cycle's snapshot.
 *
 * The champion's own job for their own country, so this is guarded on the country rather than on
 * being an admin — `requireSoaCountry` refuses a champion of Oman asking to scope Saudi Arabia.
 */
export async function scopeSoaCountry(input: {
  cycleId: number;
  countryId: string;
}): Promise<SoaResult<CountryScopeSummary>> {
  try {
    const actor = await requireSoaCountry(input.countryId, 'champion');
    const summary = await scopeCountry(input.cycleId, input.countryId, actor.email);
    revalidatePath('/soa-consolidation');
    return { success: true, data: summary };
  } catch (err) {
    log.error('scopeSoaCountry.failed', err);
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not scope the country.',
    };
  }
}
