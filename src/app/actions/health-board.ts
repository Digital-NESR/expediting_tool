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
import { kpiByCode, normalisePeriod } from '@/lib/health-board/definitions';
import {
  checklist,
  expectedCells,
  templateCsv,
  type ChecklistRow,
} from '@/lib/health-board/template';
import { parseKpiGrid, type ParsedRow, type Problem } from '@/lib/health-board/parse';
import { diffUpload, type StoredCell } from '@/lib/health-board/diff';
import {
  applyUpload,
  fingerprintOf,
  storedFor,
  undoUpload,
  yearsOf,
} from '@/lib/health-board/apply';
import { loadHistory, loadYearValues, type LoadSummary } from '@/lib/health-board/queries';

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
  /** Lines left blank in the file: ignored, nothing stored or cleared. */
  blank: number;
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
        rowsInFile:
          parsed.rows.length + new Set(rejected.map((p) => p.line)).size + parsed.blank.length,
        blank: parsed.blank.length,
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

/* ═══ Phase 5: preparing a month, checking it, undoing a mistake ═══ */

async function expectedFor(year: number, periodRaw: string) {
  const period = normalisePeriod(periodRaw);
  if (!period || !Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new Error('Choose a year and a month, Baseline, Target or YTD.');
  }
  const [thisYear, lastYear] = await Promise.all([loadYearValues(year), loadYearValues(year - 1)]);
  return { period, cells: expectedCells([...thisYear, ...lastYear], year, period) };
}

/** The prefilled upload file for a year and period: every expected line, stored values filled in. */
export async function getHealthBoardTemplate(
  year: number,
  period: string,
): Promise<Result<{ fileName: string; csv: string; lines: number }>> {
  try {
    await requireAdmin();
    const { period: p, cells } = await expectedFor(Number(year), String(period));
    return {
      success: true,
      data: {
        fileName: `health-board-${year}-${p.toLowerCase()}.csv`,
        csv: templateCsv(cells, Number(year), p),
        lines: cells.length,
      },
    };
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('template.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not build the template.',
    };
  }
}

/** Per country: how much of a period has arrived. */
export async function getHealthBoardChecklist(
  year: number,
  period: string,
): Promise<Result<ChecklistRow[]>> {
  try {
    await requireAdmin();
    const { cells } = await expectedFor(Number(year), String(period));
    return { success: true, data: checklist(cells) };
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('checklist.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Could not build the checklist.',
    };
  }
}

const UNDO_REFUSED: Record<string, string> = {
  'not-latest': 'Only the most recent upload can be undone.',
  'not-an-upload': 'The initial load cannot be undone.',
  'is-an-undo': 'This is already an undo; upload the file again instead.',
  'already-undone': 'This upload has already been undone.',
  'not-found': 'That upload no longer exists.',
};

/** Reverse the most recent upload. Everything it changed or added is put back, and logged. */
export async function undoHealthBoardUpload(
  loadId: number,
): Promise<Result<{ restored: number; removed: number }>> {
  let actorEmail = '';
  try {
    const actor = await requireAdmin();
    actorEmail = actor.email;
    await requireSchema(allKpisPool, 'all-kpis', '001_baseline');
    const client = await allKpisPool.connect();
    try {
      await client.query('BEGIN');
      const r = await undoUpload(client, Number(loadId), actor.email);
      if (!r.ok) {
        await client.query('ROLLBACK');
        return { success: false, error: UNDO_REFUSED[r.reason] };
      }
      await client.query('COMMIT');
      log.info('upload.undone', { loadId, undoLoadId: r.undoLoadId, by: actor.email });
      revalidatePath('/supply-chain-analytics/health-board', 'layout');
      return { success: true, data: { restored: r.restored, removed: r.removed } };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err instanceof AccessError) return forbidden(err.message);
    log.error('undo.failed', err, { by: actorEmail, loadId });
    return { success: false, error: 'The undo could not be completed. Nothing was changed.' };
  }
}
