'use server';

import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { createSqlHelpers } from '@/lib/db/sql';
import { lockForTransaction, withTransaction } from '@/lib/db/tx';
import { icsaPool, sql } from '@/lib/icsa/db';
import { requireIcsaAdmin } from '@/lib/icsa/access';
import { logEvent } from '@/lib/icsa/lifecycle';
import type { IcsaResult } from './cycles';

/**
 * The question-bank editor (admin panel → Supply Chain Self-Assessment → Questions).
 *
 * Refs and section keys are permanent: answers are stored under a question's ref, and forms list
 * their section keys. So editing changes wording only, adding takes the next free number, and
 * removing archives (the question leaves every form, score and export from then on, but answers
 * already given stay in the data and come back if it is restored).
 */

const log = logger('icsa-questions');

function fail(err: unknown, fallback: string, event: string): IcsaResult<never> {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: fallback };
}

function changed() {
  revalidatePath('/icsa', 'layout');
  revalidatePath('/admin', 'layout');
}

function cleanText(text: string, what: string, min: number, max: number): string {
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (t.length < min) throw new AccessError(`The ${what} is too short.`, 400);
  if (t.length > max) throw new AccessError(`Keep the ${what} under ${max} characters.`, 400);
  return t;
}

/* ─── Questions ─────────────────────────────────────────────────────────────────────────── */

export async function addIcsaQuestion(
  sectionKey: string,
  text: string,
): Promise<IcsaResult<{ ref: string }>> {
  try {
    const actor = await requireIcsaAdmin();
    const body = cleanText(text, 'question', 10, 1000);
    const ref = await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      await lockForTransaction(client, 'icsa:question-bank');
      const [s] = await tx<QueryResultRow[]>(`SELECT num FROM icsa_sections WHERE key = ?`, [
        sectionKey,
      ]);
      if (!s) throw new AccessError('That section no longer exists.', 404);
      /* Next free number in the section, counting archived questions so a ref is never reused. */
      const rows = await tx<QueryResultRow[]>(
        `SELECT ref, sort FROM icsa_questions WHERE section_key = ?`,
        [sectionKey],
      );
      const prefix = `Q${s.num}.`;
      const next =
        rows.reduce((m, r) => {
          const n = String(r.ref).startsWith(prefix)
            ? Number(String(r.ref).slice(prefix.length))
            : 0;
          return Number.isFinite(n) ? Math.max(m, n) : m;
        }, 0) + 1;
      const sort = rows.reduce((m, r) => Math.max(m, Number(r.sort)), 0) + 10;
      const newRef = `${prefix}${next}`;
      await tx(
        `INSERT INTO icsa_questions (section_key, ref, text, sort, updated_by) VALUES (?, ?, ?, ?, ?)`,
        [sectionKey, newRef, body, sort, actor.email],
      );
      await logEvent(tx, {
        actor: actor.email,
        action: 'question.added',
        detail: { ref: newRef, section: sectionKey, text: body },
      });
      return newRef;
    });
    changed();
    return { success: true, data: { ref } };
  } catch (err) {
    return fail(err, 'Could not add the question.', 'addIcsaQuestion.failed');
  }
}

export async function updateIcsaQuestion(id: number, text: string): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    const body = cleanText(text, 'question', 10, 1000);
    const [old] = await sql<QueryResultRow[]>(`SELECT ref, text FROM icsa_questions WHERE id = ?`, [
      id,
    ]);
    if (!old) return { success: false, error: 'That question no longer exists.' };
    if (old.text === body) return { success: true };
    await sql(
      `UPDATE icsa_questions SET text = ?, updated_by = ?, updated_at = NOW() WHERE id = ?`,
      [body, actor.email, id],
    );
    await logEvent(sql, {
      actor: actor.email,
      action: 'question.edited',
      detail: { ref: old.ref, from: old.text, to: body },
    });
    changed();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not save the question.', 'updateIcsaQuestion.failed');
  }
}

/** Remove (archive) or restore a question. */
export async function setIcsaQuestionActive(id: number, active: boolean): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    const [q] = await sql<QueryResultRow[]>(
      `UPDATE icsa_questions SET active = ?, updated_by = ?, updated_at = NOW()
        WHERE id = ? RETURNING ref`,
      [active, actor.email, id],
    );
    if (!q) return { success: false, error: 'That question no longer exists.' };
    await logEvent(sql, {
      actor: actor.email,
      action: active ? 'question.restored' : 'question.removed',
      detail: { ref: q.ref },
    });
    changed();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not change the question.', 'setIcsaQuestionActive.failed');
  }
}

/** Swap a question with its neighbour in the section. */
export async function moveIcsaQuestion(id: number, direction: 'up' | 'down'): Promise<IcsaResult> {
  try {
    await requireIcsaAdmin();
    await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      await lockForTransaction(client, 'icsa:question-bank');
      const [q] = await tx<QueryResultRow[]>(
        `SELECT section_key FROM icsa_questions WHERE id = ?`,
        [id],
      );
      if (!q) throw new AccessError('That question no longer exists.', 404);
      const list = await tx<QueryResultRow[]>(
        `SELECT id FROM icsa_questions WHERE section_key = ? ORDER BY sort, id`,
        [q.section_key],
      );
      const ids = list.map((r) => Number(r.id));
      const i = ids.indexOf(id);
      const j = direction === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= ids.length) return;
      [ids[i], ids[j]] = [ids[j], ids[i]];
      /* Rewrite the whole section's order in steps of 10, which also heals duplicate sorts. */
      for (let k = 0; k < ids.length; k++) {
        await tx(`UPDATE icsa_questions SET sort = ? WHERE id = ?`, [(k + 1) * 10, ids[k]]);
      }
    });
    changed();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not move the question.', 'moveIcsaQuestion.failed');
  }
}

/* ─── Sections ──────────────────────────────────────────────────────────────────────────── */

export async function addIcsaSection(
  short: string,
  title: string,
): Promise<IcsaResult<{ key: string }>> {
  try {
    const actor = await requireIcsaAdmin();
    const s = cleanText(short, 'short name', 2, 60);
    const t = cleanText(title, 'title', 3, 160);
    const key = await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      await lockForTransaction(client, 'icsa:question-bank');
      const [m] = await tx<QueryResultRow[]>(
        `SELECT COALESCE(MAX(num), 0) AS num, COALESCE(MAX(sort), 0) AS sort FROM icsa_sections`,
      );
      const num = Number(m.num) + 1;
      const newKey = `s${num}`;
      await tx(
        `INSERT INTO icsa_sections (key, num, short, title, sort, updated_by) VALUES (?, ?, ?, ?, ?, ?)`,
        [newKey, num, s, t, Number(m.sort) + 10, actor.email],
      );
      await logEvent(tx, {
        actor: actor.email,
        action: 'section.added',
        detail: { key: newKey, num, short: s, title: t },
      });
      return newKey;
    });
    changed();
    return { success: true, data: { key } };
  } catch (err) {
    return fail(err, 'Could not add the section.', 'addIcsaSection.failed');
  }
}

export async function updateIcsaSection(
  key: string,
  short: string,
  title: string,
): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    const s = cleanText(short, 'short name', 2, 60);
    const t = cleanText(title, 'title', 3, 160);
    const [row] = await sql<QueryResultRow[]>(
      `UPDATE icsa_sections SET short = ?, title = ?, updated_by = ?, updated_at = NOW()
        WHERE key = ? RETURNING key`,
      [s, t, actor.email, key],
    );
    if (!row) return { success: false, error: 'That section no longer exists.' };
    await logEvent(sql, { actor: actor.email, action: 'section.edited', detail: { key, s, t } });
    changed();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not save the section.', 'updateIcsaSection.failed');
  }
}

/** Remove (archive) or restore a whole section. At least one section must stay. */
export async function setIcsaSectionActive(key: string, active: boolean): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    if (!active) {
      const [c] = await sql<QueryResultRow[]>(
        `SELECT COUNT(*)::int AS n FROM icsa_sections WHERE active AND key <> ?`,
        [key],
      );
      if (!c.n) return { success: false, error: 'At least one section has to stay.' };
    }
    const [row] = await sql<QueryResultRow[]>(
      `UPDATE icsa_sections SET active = ?, updated_by = ?, updated_at = NOW()
        WHERE key = ? RETURNING key`,
      [active, actor.email, key],
    );
    if (!row) return { success: false, error: 'That section no longer exists.' };
    await logEvent(sql, {
      actor: actor.email,
      action: active ? 'section.restored' : 'section.removed',
      detail: { key },
    });
    changed();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not change the section.', 'setIcsaSectionActive.failed');
  }
}
