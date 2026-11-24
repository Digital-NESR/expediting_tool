/*
 * Reading stored cells and writing an upload, inside a transaction the caller owns.
 *
 * The server action (src/app/actions/health-board.ts) opens the transaction, checks access and
 * commits; this file does the reads and writes. Kept free of `@/` imports so
 * scripts/health-board-upload-check.mjs can run the same SQL against a real database inside a
 * transaction it rolls back.
 */

import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { diffUpload, type StoredCell, type UploadDiff } from './diff';
import type { ParsedRow } from './parse';

export type Queryable = Pick<PoolClient, 'query'>;

/** Serialises commits, so two admins saving at once cannot interleave. */
export const UPLOAD_LOCK = 724_201;

export async function storedFor(db: Queryable, years: number[]): Promise<StoredCell[]> {
  if (!years.length) return [];
  const { rows } = await db.query(
    `SELECT kpi, year, period, country, value::text AS value_text, target_words, category
       FROM kpi_values WHERE year = ANY($1::int[])`,
    [years],
  );
  return rows.map((r) => ({
    kpi: r.kpi,
    year: r.year,
    period: r.period,
    country: r.country,
    valueText: r.value_text,
    targetWords: r.target_words,
    category: r.category,
  }));
}

export const yearsOf = (rows: readonly ParsedRow[]) => [...new Set(rows.map((r) => r.year))];

export function fingerprintOf(diff: UploadDiff): string {
  const parts = [
    ...diff.added.map(
      (r) =>
        `a|${r.kpi}|${r.year}|${r.period}|${r.country}|${r.valueText}|${r.targetWords}|${r.category}`,
    ),
    ...diff.changed.map(
      (c) =>
        `c|${c.row.kpi}|${c.row.year}|${c.row.period}|${c.row.country}|${c.before.valueText}|${c.before.targetWords}|${c.before.category}|${c.row.valueText}|${c.row.targetWords}|${c.row.category}`,
    ),
  ].sort();
  return createHash('sha256').update(parts.join('\n')).digest('hex').slice(0, 32);
}

async function insertMany(db: Queryable, table: string, columns: string[], rows: unknown[][]) {
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const params: unknown[] = [];
    const tuples = chunk.map(
      (r) =>
        `(${r
          .map((v) => {
            params.push(v);
            return `$${params.length}`;
          })
          .join(',')})`,
    );
    await db.query(
      `INSERT INTO ${table} (${columns.join(',')}) VALUES ${tuples.join(',')}`,
      params,
    );
  }
}

export type ApplyResult =
  | { ok: true; loadId: number; added: number; changed: number; unchanged: number }
  | { ok: false; reason: 'stale' | 'nothing' };

/**
 * Write an upload. Must run inside a transaction: it takes the upload lock, re-reads the stored
 * cells, and refuses if the diff no longer matches the fingerprint the admin previewed.
 */
export async function applyUpload(
  db: Queryable,
  input: {
    rows: readonly ParsedRow[];
    grid: string[][];
    fileName: string;
    by: string;
    fingerprint: string;
  },
): Promise<ApplyResult> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [UPLOAD_LOCK]);
  const diff = diffUpload(input.rows, await storedFor(db, yearsOf(input.rows)));
  if (fingerprintOf(diff) !== input.fingerprint) return { ok: false, reason: 'stale' };
  if (!diff.added.length && !diff.changed.length) return { ok: false, reason: 'nothing' };

  const { rows: load } = await db.query(
    `INSERT INTO kpi_loads (kind, file_name, loaded_by, rows_in_file, rows_added, rows_changed, rows_unchanged, rows_rejected)
     VALUES ('upload', $1, $2, $3, $4, $5, $6, 0) RETURNING id`,
    [
      input.fileName.slice(0, 255),
      input.by,
      input.rows.length,
      diff.added.length,
      diff.changed.length,
      diff.unchanged.length,
    ],
  );
  const loadId = Number(load[0].id);

  await insertMany(
    db,
    'kpi_values',
    [
      'kpi',
      'year',
      'period',
      'country',
      'country_raw',
      'value',
      'target_words',
      'category',
      'source_ref',
      'load_id',
      'updated_by',
    ],
    diff.added.map((r) => [
      r.kpi,
      r.year,
      r.period,
      r.country,
      r.countryRaw,
      r.valueText,
      r.targetWords,
      r.category,
      r.sourceRef,
      loadId,
      input.by,
    ]),
  );
  await insertMany(
    db,
    'kpi_value_history',
    [
      'kpi',
      'year',
      'period',
      'country',
      'old_value',
      'new_value',
      'old_target_words',
      'new_target_words',
      'old_category',
      'new_category',
      'load_id',
      'changed_by',
    ],
    diff.changed.map(({ row: r, before: b }) => [
      r.kpi,
      r.year,
      r.period,
      r.country,
      b.valueText,
      r.valueText,
      b.targetWords,
      r.targetWords,
      b.category,
      r.category,
      loadId,
      input.by,
    ]),
  );
  for (const { row: r } of diff.changed) {
    const { rowCount } = await db.query(
      `UPDATE kpi_values
          SET value = $5, target_words = $6, category = $7, country_raw = $8, source_ref = $9,
              source_modified = NULL, load_id = $10, updated_at = now(), updated_by = $11
        WHERE kpi = $1 AND year = $2 AND period = $3 AND country = $4`,
      [
        r.kpi,
        r.year,
        r.period,
        r.country,
        r.valueText,
        r.targetWords,
        r.category,
        r.countryRaw,
        r.sourceRef,
        loadId,
        input.by,
      ],
    );
    if (rowCount !== 1) {
      throw new Error(
        `Expected one row for ${r.kpi} ${r.country} ${r.period} ${r.year}, found ${rowCount}`,
      );
    }
  }

  const header = input.grid.find((row) => row.some((c) => c.trim().toLowerCase() === 'kpi')) ?? [];
  const cellsOf = (line: number) =>
    JSON.stringify(Object.fromEntries(header.map((h, i) => [h, input.grid[line - 1]?.[i] ?? ''])));
  await insertMany(
    db,
    'kpi_source_rows',
    ['load_id', 'line', 'cells', 'outcome'],
    [
      ...diff.added.map((r) => [loadId, r.line, cellsOf(r.line), 'added']),
      ...diff.changed.map((c) => [loadId, c.row.line, cellsOf(c.row.line), 'changed']),
      ...diff.unchanged.map((r) => [loadId, r.line, cellsOf(r.line), 'unchanged']),
    ],
  );

  return {
    ok: true,
    loadId,
    added: diff.added.length,
    changed: diff.changed.length,
    unchanged: diff.unchanged.length,
  };
}

export const UNDO_PREFIX = 'Undo of load ';

export type UndoResult =
  | { ok: true; undoLoadId: number; restored: number; removed: number }
  | {
      ok: false;
      reason: 'not-latest' | 'not-an-upload' | 'is-an-undo' | 'already-undone' | 'not-found';
    };

/**
 * Reverse an upload (UX phase 5). Must run inside a transaction. Only the most recent load can be
 * undone, so no later upload can have built on it; an undo is itself never undone (upload again
 * instead). Changed cells get their previous value, target text and category back from
 * kpi_value_history; cells the upload added are removed. Every reversal is written to the history
 * under a new load, and the original load is marked as undone, so nothing disappears from the
 * record.
 */
export async function undoUpload(db: Queryable, loadId: number, by: string): Promise<UndoResult> {
  await db.query('SELECT pg_advisory_xact_lock($1)', [UPLOAD_LOCK]);
  const { rows: loads } = await db.query(
    'SELECT id, kind, file_name, note, (SELECT max(id) FROM kpi_loads) AS latest FROM kpi_loads WHERE id = $1',
    [loadId],
  );
  const load = loads[0];
  if (!load) return { ok: false, reason: 'not-found' };
  if (Number(load.latest) !== loadId) return { ok: false, reason: 'not-latest' };
  if (load.kind !== 'upload') return { ok: false, reason: 'not-an-upload' };
  if (String(load.file_name).startsWith(UNDO_PREFIX)) return { ok: false, reason: 'is-an-undo' };
  if (String(load.note ?? '').includes('Undone by load'))
    return { ok: false, reason: 'already-undone' };

  const { rows: changed } = await db.query(
    `SELECT kpi, year, period, country, old_value::text AS old_value, new_value::text AS new_value,
            old_target_words, new_target_words, old_category, new_category
       FROM kpi_value_history WHERE load_id = $1`,
    [loadId],
  );
  const { rows: written } = await db.query(
    `SELECT kpi, year, period, country, value::text AS value, target_words, category
       FROM kpi_values WHERE load_id = $1`,
    [loadId],
  );
  const changedKeys = new Set(changed.map((c) => `${c.kpi}|${c.year}|${c.period}|${c.country}`));
  const added = written.filter(
    (w) => !changedKeys.has(`${w.kpi}|${w.year}|${w.period}|${w.country}`),
  );

  const { rows: undo } = await db.query(
    `INSERT INTO kpi_loads (kind, file_name, loaded_by, rows_in_file, rows_added, rows_changed, rows_unchanged, rows_rejected, note)
     VALUES ('upload', $1, $2, $3, 0, $3, 0, 0, $4) RETURNING id`,
    [
      `${UNDO_PREFIX}${loadId}: ${load.file_name}`.slice(0, 255),
      by,
      changed.length + added.length,
      `Reverses load ${loadId}: ${changed.length} value(s) restored, ${added.length} removed.`,
    ],
  );
  const undoId = Number(undo[0].id);

  for (const c of changed) {
    await db.query(
      `INSERT INTO kpi_value_history (kpi, year, period, country, old_value, new_value, old_target_words, new_target_words, old_category, new_category, load_id, changed_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        c.kpi,
        c.year,
        c.period,
        c.country,
        c.new_value,
        c.old_value,
        c.new_target_words,
        c.old_target_words,
        c.new_category,
        c.old_category,
        undoId,
        by,
      ],
    );
    const { rowCount } = await db.query(
      `UPDATE kpi_values
          SET value = $5, target_words = $6, category = $7, load_id = $8, updated_at = now(), updated_by = $9
        WHERE kpi = $1 AND year = $2 AND period = $3 AND country = $4 AND load_id = $10`,
      [
        c.kpi,
        c.year,
        c.period,
        c.country,
        c.old_value,
        c.old_target_words,
        c.old_category,
        undoId,
        by,
        loadId,
      ],
    );
    if (rowCount !== 1)
      throw new Error(`Could not restore ${c.kpi} ${c.country} ${c.period} ${c.year}`);
  }
  for (const a of added) {
    await db.query(
      `INSERT INTO kpi_value_history (kpi, year, period, country, old_value, new_value, old_target_words, new_target_words, old_category, new_category, load_id, changed_by)
       VALUES ($1,$2,$3,$4,$5,NULL,$6,NULL,$7,NULL,$8,$9)`,
      [a.kpi, a.year, a.period, a.country, a.value, a.target_words, a.category, undoId, by],
    );
    const { rowCount } = await db.query(
      'DELETE FROM kpi_values WHERE kpi = $1 AND year = $2 AND period = $3 AND country = $4 AND load_id = $5',
      [a.kpi, a.year, a.period, a.country, loadId],
    );
    if (rowCount !== 1)
      throw new Error(`Could not remove ${a.kpi} ${a.country} ${a.period} ${a.year}`);
  }
  await db.query(`UPDATE kpi_loads SET note = concat_ws(' ', note, $2::text) WHERE id = $1`, [
    loadId,
    `Undone by load ${undoId}.`,
  ]);
  return { ok: true, undoLoadId: undoId, restored: changed.length, removed: added.length };
}
