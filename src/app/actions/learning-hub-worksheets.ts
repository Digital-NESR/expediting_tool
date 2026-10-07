'use server';

/**
 * Worksheet responses: read your own, save it as you type, submit it when you are done.
 *
 * Every export in a `'use server'` file is a public POST endpoint, so the actor comes from the
 * session on every one of them and is never accepted as an argument. A learner can only ever read
 * or write their own row; `getWorksheetReport` is the one admin-only export and says so first.
 *
 * Nothing here grades anything. The worksheets are optional, a submission is the only thing that
 * counts toward full completion, and the worked answers are released once the learner has committed
 * to their own.
 */
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, normalizeEmail } from '@/lib/require-access';
import learningHubPool from '@/lib/db-learning-hub';
import { logger } from '@/lib/logger';
import { requireSchema } from '@/lib/db/schema-version';
import { sql, exec, ensureLearningHubReady } from '@/lib/learning-hub-queries';
import {
  WORKSHEETS,
  worksheetByKey,
  worksheetFields,
  worksheetForModule,
  worksheetProgress,
  type Worksheet,
} from '@/lib/learning-hub/worksheet-content';

const log = logger('learning-hub-worksheets');

const WORKSHEETS_MIGRATION = '004_worksheets';

/**
 * A ceiling on one response.
 *
 * 144 fields of considered prose is perhaps 60 KB. A quarter of a megabyte leaves room for somebody
 * pasting a spreadsheet into an answer box and still refuses a client that has decided to post a
 * file. The limit is enforced here rather than in the browser, because the browser is not where an
 * abusive request comes from.
 */
const MAX_ANSWERS_BYTES = 262_144;

export interface WorksheetResponseState {
  status: 'draft' | 'submitted';
  answers: Record<string, unknown>;
  submittedAt: string | null;
  updatedAt: string | null;
}

export interface WorksheetView {
  worksheet: Worksheet;
  response: WorksheetResponseState;
  progress: { answered: number; total: number };
}

async function actor(): Promise<{ email: string; name: string; isAdmin: boolean } | null> {
  const a = await currentActor();
  if (!a) return null;
  return {
    email: normalizeEmail(a.email),
    name: a.name.trim() || a.email.split('@')[0],
    isAdmin: a.isPlatformAdmin,
  };
}

async function ready(): Promise<void> {
  await ensureLearningHubReady();
  await requireSchema(learningHubPool, 'learning-hub', WORKSHEETS_MIGRATION);
}

const EMPTY: WorksheetResponseState = {
  status: 'draft',
  answers: {},
  submittedAt: null,
  updatedAt: null,
};

function readResponse(row: QueryResultRow | undefined): WorksheetResponseState {
  if (!row) return EMPTY;
  return {
    status: row.status === 'submitted' ? 'submitted' : 'draft',
    answers: (row.answers as Record<string, unknown>) ?? {},
    submittedAt: row.submitted_at ? new Date(row.submitted_at as string).toISOString() : null,
    updatedAt: row.updated_at ? new Date(row.updated_at as string).toISOString() : null,
  };
}

/**
 * Validate and normalise what the client sent.
 *
 * Answers arrive as a flat map of field id to value, where a grid's value is itself a map of cell
 * reference to string. Everything is coerced to a string, keys the definition does not know are
 * dropped, and the whole thing is size-checked. Dropping unknown keys is what stops this table
 * becoming free storage for whatever a caller feels like posting.
 */
function cleanAnswers(sheet: Worksheet, raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const known = new Map(worksheetFields(sheet).map((f) => [f.id, f.kind]));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const kind = known.get(key);
    if (!kind) continue;
    if (kind === 'grid') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const cells: Record<string, string> = {};
      for (const [cell, cv] of Object.entries(value as Record<string, unknown>)) {
        // "3:4" — row index and column index. Anything else is not a cell reference.
        if (!/^\d{1,3}:\d{1,2}$/.test(cell)) continue;
        const text = String(cv ?? '').slice(0, 400);
        if (text.trim()) cells[cell] = text;
      }
      if (Object.keys(cells).length) out[key] = cells;
    } else {
      const text = String(value ?? '').slice(0, 20_000);
      if (text.trim()) out[key] = text;
    }
  }
  if (JSON.stringify(out).length > MAX_ANSWERS_BYTES) {
    throw new AccessError('That response is too large to save. Shorten the longest answers.', 413);
  }
  return out;
}

/** The sheet for a release plus this learner's own response, or null if the release has none. */
export async function getWorksheetForModule(moduleId: number): Promise<WorksheetView | null> {
  try {
    const me = await actor();
    if (!me) return null;
    await ready();

    const rows = await sql<QueryResultRow[]>(`SELECT title FROM learning_modules WHERE id = ?`, [
      moduleId,
    ]);
    const title = rows[0]?.title;
    if (!title) return null;
    const worksheet = worksheetForModule(String(title));
    if (!worksheet) return null;

    const responseRows = await sql<QueryResultRow[]>(
      `SELECT answers, status, submitted_at, updated_at
         FROM learning_worksheet_responses
        WHERE user_email = ? AND worksheet_key = ?`,
      [me.email, worksheet.key],
    );
    const response = readResponse(responseRows[0]);
    return { worksheet, response, progress: worksheetProgress(worksheet, response.answers) };
  } catch (err) {
    log.error('worksheet.load.failed', err);
    return null;
  }
}

/**
 * Save what has been typed so far.
 *
 * Called on a timer while the learner writes, so it must be cheap and must never move a submitted
 * sheet back to draft — somebody reopening a finished worksheet to re-read it would otherwise undo
 * their own submission by scrolling past a textarea.
 */
export async function saveWorksheetDraft(
  worksheetKey: string,
  answers: unknown,
): Promise<{ saved: boolean; at: string | null }> {
  try {
    const me = await actor();
    if (!me) throw new AccessError('Sign in required.', 401);
    await ready();
    const sheet = worksheetByKey(worksheetKey);
    if (!sheet) throw new AccessError('No such worksheet.', 404);

    const clean = cleanAnswers(sheet, answers);
    const rows = await sql<QueryResultRow[]>(
      `INSERT INTO learning_worksheet_responses (user_email, worksheet_key, answers)
       VALUES (?, ?, ?::jsonb)
       ON CONFLICT (user_email, worksheet_key) DO UPDATE SET
         answers = EXCLUDED.answers,
         updated_at = NOW()
       RETURNING updated_at`,
      [me.email, sheet.key, JSON.stringify(clean)],
    );
    return { saved: true, at: rows[0]?.updated_at ? new Date(rows[0].updated_at as string).toISOString() : null };
  } catch (err) {
    if (err instanceof AccessError) throw err;
    log.error('worksheet.save.failed', err);
    return { saved: false, at: null };
  }
}

/** Mark it done. This is the only thing that counts toward full completion. */
export async function submitWorksheet(
  worksheetKey: string,
  answers: unknown,
): Promise<{ submitted: boolean; at: string | null }> {
  const me = await actor();
  if (!me) throw new AccessError('Sign in required.', 401);
  await ready();
  const sheet = worksheetByKey(worksheetKey);
  if (!sheet) throw new AccessError('No such worksheet.', 404);

  const clean = cleanAnswers(sheet, answers);
  const rows = await sql<QueryResultRow[]>(
    `INSERT INTO learning_worksheet_responses (user_email, worksheet_key, answers, status, submitted_at)
     VALUES (?, ?, ?::jsonb, 'submitted', NOW())
     ON CONFLICT (user_email, worksheet_key) DO UPDATE SET
       answers = EXCLUDED.answers,
       status = 'submitted',
       /* COALESCE, so re-submitting an edited sheet keeps the date they first finished it. */
       submitted_at = COALESCE(learning_worksheet_responses.submitted_at, NOW()),
       updated_at = NOW()
     RETURNING submitted_at`,
    [me.email, sheet.key, JSON.stringify(clean)],
  );
  return {
    submitted: true,
    at: rows[0]?.submitted_at ? new Date(rows[0].submitted_at as string).toISOString() : null,
  };
}

/** Reopen a submitted sheet for editing. The submission date is kept; only the status moves. */
export async function reopenWorksheet(worksheetKey: string): Promise<{ reopened: boolean }> {
  const me = await actor();
  if (!me) throw new AccessError('Sign in required.', 401);
  await ready();
  if (!worksheetByKey(worksheetKey)) throw new AccessError('No such worksheet.', 404);
  /* submitted_at has to go with the status: the table's own CHECK keeps the two in step, and a
     reopened sheet has genuinely not been submitted until it is submitted again. */
  await exec(
    `UPDATE learning_worksheet_responses
        SET status = 'draft', submitted_at = NULL, updated_at = NOW()
      WHERE user_email = ? AND worksheet_key = ?`,
    [me.email, worksheetKey],
  );
  return { reopened: true };
}

/* ── Admin reporting ─────────────────────────────────────────────────── */

export interface WorksheetAnswerRow {
  email: string;
  status: 'draft' | 'submitted';
  submittedAt: string | null;
  updatedAt: string | null;
  answers: Record<string, unknown>;
  answered: number;
}

export interface WorksheetReport {
  key: string;
  title: string;
  level: string;
  courseTitle: string;
  moduleTitle: string;
  fieldCount: number;
  started: number;
  submitted: number;
  /** Mean answered-field count across everybody who has opened it, for "how far do people get". */
  avgAnswered: number | null;
  rows: WorksheetAnswerRow[];
}

/** Every worksheet with its responses. Admin only; an ordinary learner gets an empty list. */
export async function getWorksheetReport(): Promise<WorksheetReport[]> {
  try {
    const me = await actor();
    if (!me?.isAdmin) return [];
    await ready();

    const rows = await sql<QueryResultRow[]>(
      `SELECT user_email, worksheet_key, answers, status, submitted_at, updated_at
         FROM learning_worksheet_responses
        ORDER BY worksheet_key, submitted_at DESC NULLS LAST, updated_at DESC`,
    );

    const byKey = new Map<string, QueryResultRow[]>();
    for (const r of rows) {
      const k = String(r.worksheet_key);
      const list = byKey.get(k);
      if (list) list.push(r);
      else byKey.set(k, [r]);
    }

    return WORKSHEETS.map((sheet) => {
      const mine = byKey.get(sheet.key) ?? [];
      const reports: WorksheetAnswerRow[] = mine.map((r) => {
        const answers = (r.answers as Record<string, unknown>) ?? {};
        return {
          email: String(r.user_email),
          status: r.status === 'submitted' ? 'submitted' : 'draft',
          submittedAt: r.submitted_at ? new Date(r.submitted_at as string).toISOString() : null,
          updatedAt: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
          answers,
          answered: worksheetProgress(sheet, answers).answered,
        };
      });
      const total = reports.reduce((n, r) => n + r.answered, 0);
      return {
        key: sheet.key,
        title: sheet.title,
        level: sheet.level,
        courseTitle: sheet.courseTitle,
        moduleTitle: sheet.moduleTitle,
        fieldCount: worksheetFields(sheet).length,
        started: reports.length,
        submitted: reports.filter((r) => r.status === 'submitted').length,
        avgAnswered: reports.length ? Math.round(total / reports.length) : null,
        rows: reports,
      };
    });
  } catch (err) {
    log.error('worksheet.report.failed', err);
    return [];
  }
}
