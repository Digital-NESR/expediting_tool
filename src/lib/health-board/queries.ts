/*
 * Reading the Health Board's numbers from `all_kpis`. Server-side only; callers gate access.
 */

import allKpisPool from '@/lib/db-all-kpis';
import { requireSchema } from '@/lib/db/schema-version';
import type { KpiValue } from './calc';
import type { Country, Period } from './definitions';

const SCHEMA = '001_baseline';

async function ready() {
  await requireSchema(allKpisPool, 'all-kpis', SCHEMA);
}

/** Every stored value for one year. A few thousand rows; the overview is computed from them. */
export async function loadYearValues(year: number): Promise<KpiValue[]> {
  await ready();
  /* value::text so numeric arrives as its exact decimal string; Number() of that is the closest
     double, which is what every comparison and average in calc.ts works in. */
  const { rows } = await allKpisPool.query<{
    kpi: string;
    year: number;
    period: Period;
    country: Country;
    value: string | null;
    target_words: string | null;
    category: string;
  }>(
    `SELECT kpi, year, period, country, value::text AS value, target_words, category
       FROM kpi_values WHERE year = $1`,
    [year],
  );
  return rows.map((r) => ({
    kpi: r.kpi,
    year: r.year,
    period: r.period,
    country: r.country,
    value: r.value === null ? null : Number(r.value),
    targetWords: r.target_words,
    category: r.category,
  }));
}

/** The years that have any value, newest first. */
export async function loadYears(): Promise<number[]> {
  await ready();
  const { rows } = await allKpisPool.query<{ year: number }>(
    'SELECT DISTINCT year FROM kpi_values ORDER BY year DESC',
  );
  return rows.map((r) => r.year);
}

export interface LoadSummary {
  id: number;
  kind: 'initial-load' | 'upload';
  fileName: string;
  loadedBy: string;
  loadedAt: string;
  rowsInFile: number;
  rowsAdded: number;
  rowsChanged: number;
  rowsUnchanged: number;
  rowsRejected: number;
  note: string | null;
}

/** Every load and upload, newest first. */
export async function loadHistory(limit = 50): Promise<LoadSummary[]> {
  await ready();
  const { rows } = await allKpisPool.query(
    `SELECT id, kind, file_name, loaded_by, loaded_at, rows_in_file, rows_added, rows_changed,
            rows_unchanged, rows_rejected, note
       FROM kpi_loads ORDER BY id DESC LIMIT $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    fileName: r.file_name,
    loadedBy: r.loaded_by,
    loadedAt: new Date(r.loaded_at).toISOString(),
    rowsInFile: r.rows_in_file,
    rowsAdded: r.rows_added,
    rowsChanged: r.rows_changed,
    rowsUnchanged: r.rows_unchanged,
    rowsRejected: r.rows_rejected,
    note: r.note,
  }));
}
