'use server';

import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { AccessError, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { createSqlHelpers } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import { ensureIcsaSchema, exec, icsaPool, sql } from '@/lib/icsa/db';
import { requireIcsaAdmin } from '@/lib/icsa/access';
import { extensionDecisionMail, mailConfigured, sendIcsaMail } from '@/lib/icsa/mail';
import { logEvent, markOutstandingNotCompleted, TODAY_SQL } from '@/lib/icsa/lifecycle';
import { FREQUENCIES, ICSA_COUNTRIES, todayInDubai, type IcsaFrequency } from '@/lib/icsa/model';

const log = logger('icsa-cycles');

export type IcsaResult<T = undefined> = { success: boolean; error?: string; data?: T };

function fail(err: unknown, fallback: string, event: string): IcsaResult<never> {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: fallback };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface CycleInput {
  label: string;
  frequency: IcsaFrequency;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  thresholdPct: number;
}

function validate(i: CycleInput, isNew: boolean): string | null {
  if (!i.label?.trim()) return 'Give the cycle a label, for example "Q1 2027".';
  if (i.label.trim().length > 80) return 'Keep the label under 80 characters.';
  if (!FREQUENCIES.includes(i.frequency)) return 'Choose a frequency.';
  if (![i.periodStart, i.periodEnd, i.deadline].every((d) => ISO_DATE.test(d ?? ''))) {
    return 'Enter the period start, period end and deadline.';
  }
  if (i.periodEnd < i.periodStart) return 'The period cannot end before it starts.';
  if (isNew && i.deadline < todayInDubai()) return 'The deadline cannot be in the past.';
  const t = Number(i.thresholdPct);
  if (!Number.isInteger(t) || t < 1 || t > 100)
    return 'The threshold is a whole percentage from 1 to 100.';
  return null;
}

/** Open a new cycle. One run only: the next period is opened by hand when it comes. */
export async function createIcsaCycle(input: CycleInput): Promise<IcsaResult<{ id: number }>> {
  try {
    const actor = await requireIcsaAdmin();
    await ensureIcsaSchema();
    const problem = validate(input, true);
    if (problem) return { success: false, error: problem };

    const clash = await sql<QueryResultRow[]>(
      `SELECT 1 FROM icsa_cycles WHERE LOWER(label) = LOWER(?)`,
      [input.label.trim()],
    );
    if (clash.length)
      return { success: false, error: `A cycle called "${input.label.trim()}" already exists.` };

    const { insertId } = await exec(
      `INSERT INTO icsa_cycles (label, frequency, period_start, period_end, deadline, threshold_pct, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        input.label.trim(),
        input.frequency,
        input.periodStart,
        input.periodEnd,
        input.deadline,
        Number(input.thresholdPct),
        actor.email,
      ],
    );
    await logEvent(sql, {
      actor: actor.email,
      action: 'cycle.created',
      cycleId: insertId,
      detail: { ...input },
    });
    revalidatePath('/icsa', 'layout');
    return { success: true, data: { id: insertId } };
  } catch (err) {
    return fail(err, 'Could not open the cycle.', 'createIcsaCycle.failed');
  }
}

/**
 * Change an open cycle's deadline or threshold. A new deadline moves every country still on the
 * old one; a country whose deadline was already extended past it keeps its extension.
 */
export async function updateIcsaCycle(
  cycleId: number,
  input: { deadline: string; thresholdPct: number; reason: string },
): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    if (!ISO_DATE.test(input.deadline)) return { success: false, error: 'Enter a deadline.' };
    if (input.deadline < todayInDubai())
      return { success: false, error: 'The deadline cannot be in the past.' };
    const t = Number(input.thresholdPct);
    if (!Number.isInteger(t) || t < 1 || t > 100) {
      return { success: false, error: 'The threshold is a whole percentage from 1 to 100.' };
    }
    if (!input.reason?.trim()) return { success: false, error: 'Say why the cycle is changing.' };

    await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      const [old] = await tx<QueryResultRow[]>(
        `SELECT deadline::text AS deadline, threshold_pct, status FROM icsa_cycles WHERE id = ? FOR UPDATE`,
        [cycleId],
      );
      if (!old) throw new AccessError('That cycle no longer exists.', 404);
      if (old.status !== 'open') throw new AccessError('That cycle is closed.', 409);
      await tx(`UPDATE icsa_cycles SET deadline = ?, threshold_pct = ? WHERE id = ?`, [
        input.deadline,
        t,
        cycleId,
      ]);
      /* Countries on the old cycle deadline follow it; a country with an extension keeps the
         later of its own date and the new one. */
      await tx(
        `UPDATE icsa_enrollments
            SET deadline = CASE WHEN deadline = ?::date THEN ?::date ELSE GREATEST(deadline, ?::date) END
          WHERE cycle_id = ? AND status = 'open'`,
        [old.deadline, input.deadline, input.deadline, cycleId],
      );
      await logEvent(tx, {
        actor: actor.email,
        action: 'cycle.updated',
        cycleId,
        detail: { from: { deadline: old.deadline, thresholdPct: old.threshold_pct }, to: input },
      });
    });
    revalidatePath('/icsa', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not update the cycle.', 'updateIcsaCycle.failed');
  }
}

/** Close a whole cycle now. Every country still open closes with it. */
export async function closeIcsaCycle(cycleId: number, reason: string): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    if (!reason?.trim()) return { success: false, error: 'Say why the cycle is being closed.' };
    await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      const [c] = await tx<QueryResultRow[]>(
        `SELECT status FROM icsa_cycles WHERE id = ? FOR UPDATE`,
        [cycleId],
      );
      if (!c) throw new AccessError('That cycle no longer exists.', 404);
      if (c.status !== 'open') throw new AccessError('That cycle is already closed.', 409);
      const open = await tx<QueryResultRow[]>(
        `UPDATE icsa_enrollments SET status = 'closed', closed_at = NOW(), closed_by = ?, close_note = ?
          WHERE cycle_id = ? AND status = 'open' RETURNING id`,
        [actor.email, `Cycle closed by the administrator: ${reason.trim()}`, cycleId],
      );
      await markOutstandingNotCompleted(
        tx,
        open.map((r) => Number(r.id)),
      );
      await tx(
        `UPDATE icsa_cycles SET status = 'closed', closed_at = NOW(), closed_by = ?, close_reason = ? WHERE id = ?`,
        [actor.email, reason.trim(), cycleId],
      );
      await logEvent(tx, {
        actor: actor.email,
        action: 'cycle.closed',
        cycleId,
        detail: { reason },
      });
    });
    revalidatePath('/icsa', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not close the cycle.', 'closeIcsaCycle.failed');
  }
}

/* ─── Champions ─────────────────────────────────────────────────────────────────────────── */

export async function addIcsaChampion(input: {
  email: string;
  name: string | null;
  country: string;
}): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    const email = normalizeEmail(input.email);
    if (!email || !email.includes('@'))
      return { success: false, error: 'Pick a person from the directory.' };
    if (!(ICSA_COUNTRIES as readonly string[]).includes(input.country)) {
      return { success: false, error: 'Choose a country.' };
    }
    await exec(
      `INSERT INTO icsa_champions (email, name, country, created_by) VALUES (?, ?, ?, ?)
       ON CONFLICT (LOWER(email), country) DO UPDATE SET name = EXCLUDED.name`,
      [email, input.name?.trim() || null, input.country, actor.email],
    );
    await logEvent(sql, {
      actor: actor.email,
      action: 'champion.added',
      detail: { email, country: input.country },
    });
    revalidatePath('/icsa', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not appoint the champion.', 'addIcsaChampion.failed');
  }
}

/**
 * Remove a champion appointment. Countries they already enrolled keep running; the new champion
 * for that country (or an admin) picks them up, because enrollments are scoped by country.
 */
export async function removeIcsaChampion(id: number): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    const rows = await sql<QueryResultRow[]>(
      `DELETE FROM icsa_champions WHERE id = ? RETURNING email, country`,
      [id],
    );
    if (rows[0]) {
      await logEvent(sql, { actor: actor.email, action: 'champion.removed', detail: rows[0] });
    }
    revalidatePath('/icsa', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not remove the champion.', 'removeIcsaChampion.failed');
  }
}

/* ─── Extensions ────────────────────────────────────────────────────────────────────────── */

/**
 * Approve or reject a champion's extension request. Approving moves that country's deadline; if
 * the country had already been force-closed at the old deadline it is reopened, and the people
 * marked not completed by the closure go back to where they were.
 */
export async function decideIcsaExtension(
  requestId: number,
  approve: boolean,
  note: string,
): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaAdmin();
    if (!approve && !note?.trim()) {
      return { success: false, error: 'Add a note so the champion knows why it was refused.' };
    }
    const decided = await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      const [r] = await tx<QueryResultRow[]>(
        `SELECT r.id, r.enrollment_id, r.requested_deadline::text AS requested_deadline, r.status,
                r.requested_by, e.country, e.champion_email, e.champion_name, c.label AS cycle_label,
                e.status AS enrollment_status, e.cycle_id, e.closed_by, c.status AS cycle_status,
                (r.requested_deadline >= ${TODAY_SQL}) AS still_future
           FROM icsa_extension_requests r
           JOIN icsa_enrollments e ON e.id = r.enrollment_id
           JOIN icsa_cycles c ON c.id = e.cycle_id
          WHERE r.id = ? FOR UPDATE OF r, e`,
        [requestId],
      );
      if (!r) throw new AccessError('That request no longer exists.', 404);
      if (r.status !== 'pending')
        throw new AccessError('That request has already been decided.', 409);
      if (approve) {
        if (!r.still_future) throw new AccessError('The requested date has already passed.', 409);
        if (r.enrollment_status === 'closed') {
          throw new AccessError('The champion has already closed that country.', 409);
        }
        await tx(`UPDATE icsa_enrollments SET deadline = ? WHERE id = ?`, [
          r.requested_deadline,
          r.enrollment_id,
        ]);
        if (r.enrollment_status === 'force_closed') {
          await tx(
            `UPDATE icsa_enrollments SET status = 'open', closed_at = NULL, closed_by = NULL, close_note = NULL WHERE id = ?`,
            [r.enrollment_id],
          );
          await tx(
            `UPDATE icsa_assessments
                SET status = CASE WHEN started_at IS NULL THEN 'requested' ELSE 'in_progress' END,
                    updated_at = NOW()
              WHERE enrollment_id = ? AND status = 'not_completed'`,
            [r.enrollment_id],
          );
          if (r.cycle_status === 'closed') {
            await tx(
              `UPDATE icsa_cycles SET status = 'open', closed_at = NULL, closed_by = NULL, close_reason = NULL
                WHERE id = ? AND closed_by = 'system'`,
              [r.cycle_id],
            );
          }
        }
      }
      await tx(
        `UPDATE icsa_extension_requests SET status = ?, decided_by = ?, decided_at = NOW(), decision_note = ? WHERE id = ?`,
        [approve ? 'approved' : 'rejected', actor.email, note?.trim() || null, requestId],
      );
      await logEvent(tx, {
        actor: actor.email,
        action: approve ? 'extension.approved' : 'extension.rejected',
        cycleId: Number(r.cycle_id),
        enrollmentId: Number(r.enrollment_id),
        detail: { requestId, deadline: r.requested_deadline, note },
      });
      return r;
    });

    /* Tell the champion who asked, copying the country's champion if that is someone else.
       The decision stands whether or not the email goes. */
    if (mailConfigured() || actor.isDemo) {
      const to = normalizeEmail(decided.requested_by);
      const champion = normalizeEmail(decided.champion_email);
      try {
        await sendIcsaMail(
          extensionDecisionMail({
            to,
            cc: champion && champion !== to ? [champion] : [],
            name: champion === to ? (decided.champion_name ?? null) : null,
            cycleLabel: decided.cycle_label,
            country: decided.country,
            requestedDeadline: decided.requested_deadline,
            approved: approve,
            note: note?.trim() || null,
            enrollmentId: Number(decided.enrollment_id),
          }),
        );
      } catch (err) {
        log.warn('extensionDecision.mail_failed', { requestId, error: String(err) });
      }
    }
    revalidatePath('/icsa', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not record the decision.', 'decideIcsaExtension.failed');
  }
}
