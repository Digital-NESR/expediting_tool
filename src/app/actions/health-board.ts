'use server';

/**
 * The Health Board's data upload (/admin → Supply Chain Analytics → Health Board Data).
 *
 * EVERY EXPORT OF A `'use server'` MODULE IS A PUBLIC POST ENDPOINT, so each one starts with
 * `requireAdmin()`. The client reads the file into a grid of cells and sends it; the server parses
 * and diffs it itself, both for the preview and again for the commit, so what is written never
 * depends on what the browser claims the preview said.
 *
 * A file with any rejected row is not loaded at all: KPI numbers are all-or-nothing, and a
 * half-loaded month is worse than none. The commit re-reads the stored values inside its own
 * transaction under a lock (src/lib/health-board/apply.ts) and refuses if they no longer match
 * what the admin previewed. Rules: src/lib/health-board/RULES.md.
 */

import { revalidatePath } from 'next/cache';
import allKpisPool from '@/lib/db-all-kpis';
import { requireSchema } from '@/lib/db/schema-version';
import { AccessError, forbidden, requireAdmin } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { kpiByCode } from '@/lib/health-board/definitions';
import { parseKpiGrid, type ParsedRow, type Problem } from '@/lib/health-board/parse';
import { diffUpload, type StoredCell } from '@/lib/health-board/diff';
import { applyUpload, fingerprintOf, storedFor, yearsOf } from '@/lib/health-board/apply';
import { loadHistory, type LoadSummary } from '@/lib/health-board/queries';

const log = logger('health-board');

/** Far above a month's upload (~400 rows) and the full history (~7,000); stops a runaway file. */
const MAX_ROWS = 20_000;

export interface UploadPreviewLine {
  line: number;
  kpi: string;
  country: string;
  period: string;
  year: number;
  before: string | null;
  after: string | null;
  targetBefore: string | null;
  targetAfter: string | null;
}

export interface UploadPreview {
  fileName: string;
  rowsInFile: number;
  added: number;
  changed: number;
  unchanged: number;
  rejected: Problem[];
  warnings: Problem[];
  categoryNotes: string[];
  /** Every cell that would change. */
  changes: UploadPreviewLine[];
  /** The first 200 new cells, for a look before confirming. */
  additions: UploadPreviewLine[];
  /** A fingerprint of the diff; the commit refuses if the stored data moved since the preview. */
  fingerprint: string;
}

type Result<T> = { success: true; data: T } | { success: false; error: string };

function parseGrid(grid: unknown) {
  if (!Array.isArray(grid)) throw new Error('The file could not be read.');
  if (grid.length > MAX_ROWS + 5) {
    throw new Error(`The file has more than ${MAX_ROWS.toLocaleString('en-US')} rows.`);
  }
  const cleanGrid = grid.map((row) => (Array.isArray(row) ? row.map((c) => String(c ?? '')) : []));
  return { cleanGrid, parsed: parseKpiGrid(cleanGrid, { duplicates: 'reject' }) };
}

const nameOf = (code: string) => kpiByCode(code)?.name ?? code;

/** Parse and diff an upload without writing anything. */
export async function previewHealthBoardUpload(
  fileName: string,
  grid: string[][],
): Promise<Result<UploadPreview>> {
  try {
    await requireAdmin();
    await requireSchema(allKpisPool, 'all-kpis', '001_baseline');
    const { parsed } = parseGrid(grid);
    const diff = diffUpload(parsed.rows, await storedFor(allKpisPool, yearsOf(parsed.rows)));
    const line = (r: ParsedRow, before: StoredCell | null): UploadPreviewLine => ({
      line: r.line,
      kpi: nameOf(r.kpi),
      country: r.country,
      period: r.period,
      year: r.year,
      before: before?.valueText ?? null,
      after: r.valueText,
      targetBefore: before?.targetWords ?? null,
      targetAfter: r.targetWords,
    });
    const rejected = parsed.problems.filter((p) => p.severity === 'reject');
    return {
      success: true,
      data: {
        fileName,
        rowsInFile: parsed.rows.length + new Set(rejected.map((p) => p.line)).size,
        added: diff.added.length,
        changed: diff.changed.length,
        unchanged: diff.unchanged.length,
        rejected,
        warnings: parsed.problems.filter((p) => p.severity === 'warn'),
        categoryNotes: diff.categoryNotes,
        changes: diff.changed.map((c) => line(c.row, c.before)),
        additions: diff.added.slice(0, 200).map((r) => line(r, null)),
        fingerprint: fingerprintOf(diff),
      },
    };
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('preview.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not read the file.',
    };
  }
}

/** Write an upload the admin has previewed. Re-parses and re-diffs; refuses on any rejection. */
export async function commitHealthBoardUpload(
  fileName: string,
  grid: string[][],
  fingerprint: string,
): Promise<Result<{ loadId: number; added: number; changed: number; unchanged: number }>> {
  let actorEmail = '';
  try {
    const actor = await requireAdmin();
    actorEmail = actor.email;
    await requireSchema(allKpisPool, 'all-kpis', '001_baseline');
    const { cleanGrid, parsed } = parseGrid(grid);
    const rejected = parsed.problems.filter((p) => p.severity === 'reject');
    if (rejected.length) {
      return {
        success: false,
        error: `${rejected.length} row(s) were rejected. Nothing was saved.`,
      };
    }

    const client = await allKpisPool.connect();
    try {
      await client.query('BEGIN');
      const r = await applyUpload(client, {
        rows: parsed.rows,
        grid: cleanGrid,
        fileName,
        by: actor.email,
        fingerprint,
      });
      if (!r.ok) {
        await client.query('ROLLBACK');
        return {
          success: false,
          error:
            r.reason === 'stale'
              ? 'The stored numbers changed since this preview. Preview the file again before saving.'
              : 'Nothing to save: every row matches what the board already has.',
        };
      }
      await client.query('COMMIT');
      log.info('upload.saved', {
        loadId: r.loadId,
        by: actor.email,
        added: r.added,
        changed: r.changed,
      });
      revalidatePath('/supply-chain-analytics/health-board');
      return {
        success: true,
        data: { loadId: r.loadId, added: r.added, changed: r.changed, unchanged: r.unchanged },
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('commit.failed', err, { by: actorEmail });
    return { success: false, error: 'The upload could not be saved. Nothing was changed.' };
  }
}

/** The load and upload log for the admin panel. */
export async function getHealthBoardLoads(): Promise<Result<LoadSummary[]>> {
  try {
    await requireAdmin();
    return { success: true, data: await loadHistory() };
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('loads.failed', err);
    return { success: false, error: 'Could not read the upload history.' };
  }
}
