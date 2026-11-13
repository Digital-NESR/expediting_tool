'use server';

import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { AccessError, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { createSqlHelpers } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import { exec, icsaPool, sql } from '@/lib/icsa/db';
import {
  canManageCountry,
  icsaAdminEmails,
  requireIcsaActor,
  requireIcsaAdmin,
  type IcsaActor,
} from '@/lib/icsa/access';
import {
  logEvent,
  markOutstandingNotCompleted,
  sweepOverdue,
  TODAY_SQL,
} from '@/lib/icsa/lifecycle';
import {
  assignedMail,
  extensionRequestMail,
  mailConfigured,
  requestMail,
  sendIcsaMail,
  MailNotConfiguredError,
} from '@/lib/icsa/mail';
import {
  AWAITING_RESPONDENT,
  isSectionKey,
  progress,
  sectionsByKeys,
  todayInDubai,
  type AssessmentStatus,
} from '@/lib/icsa/model';
import type { IcsaResult } from './cycles';

const log = logger('icsa-enrollments');

function fail(err: unknown, fallback: string, event: string): IcsaResult<never> {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: fallback };
}

interface EnrollmentRow {
  id: number;
  cycle_id: number;
  cycle_label: string;
  cycle_status: string;
  threshold_pct: number;
  country: string;
  champion_email: string;
  champion_name: string | null;
  deadline: string;
  status: string;
}

/** Load an enrollment the actor manages, or throw. Optionally insist it is still open. */
async function loadEnrollment(
  actor: IcsaActor,
  enrollmentId: number,
  mustBeOpen = true,
): Promise<EnrollmentRow> {
  const [e] = await sql<QueryResultRow[]>(
    `SELECT e.id, e.cycle_id, c.label AS cycle_label, c.status AS cycle_status, c.threshold_pct,
            e.country, e.champion_email, e.champion_name, e.deadline::text AS deadline, e.status
       FROM icsa_enrollments e JOIN icsa_cycles c ON c.id = e.cycle_id WHERE e.id = ?`,
    [enrollmentId],
  );
  if (!e || !canManageCountry(actor, e.country)) {
    throw new AccessError('You do not manage that country in this cycle.', 403);
  }
  if (mustBeOpen && e.status !== 'open') {
    throw new AccessError(`${e.country} is closed for ${e.cycle_label}.`, 409);
  }
  return e as EnrollmentRow;
}

function revalidate() {
  revalidatePath('/icsa', 'layout');
}

/* ─── Assign countries ──────────────────────────────────────────────────────────────────── */

export interface CountryAssignment {
  country: string;
  /** One of the country's champions from the Administration page. */
  championEmail: string;
}

/**
 * The administrator puts countries into an open cycle, each with one of its champions, who is
 * emailed and then nominates the respondents. A country's deadline starts as the cycle's; only
 * an approved extension moves it. Champions cannot add their own country.
 */
export async function assignIcsaCountries(
  cycleId: number,
  assignments: CountryAssignment[],
): Promise<IcsaResult<{ assigned: number; skipped: string[]; emailError: string | null }>> {
  try {
    const actor = await requireIcsaAdmin();
    if (!assignments.length) return { success: false, error: 'Pick at least one country.' };
    await sweepOverdue(true);
    const [c] = await sql<QueryResultRow[]>(
      `SELECT label, status, threshold_pct, deadline::text AS deadline,
              (deadline < ${TODAY_SQL}) AS past
         FROM icsa_cycles WHERE id = ?`,
      [cycleId],
    );
    if (!c) return { success: false, error: 'That cycle no longer exists.' };
    if (c.status !== 'open' || c.past) return { success: false, error: 'That cycle is closed.' };

    let assigned = 0;
    const skipped: string[] = [];
    let emailError: string | null = null;
    for (const a of assignments) {
      const email = normalizeEmail(a.championEmail);
      const [champ] = await sql<QueryResultRow[]>(
        `SELECT email, name FROM icsa_champions WHERE country = ? AND LOWER(email) = ?`,
        [a.country, email],
      );
      if (!champ) {
        skipped.push(`${a.country} (that person is not one of its champions)`);
        continue;
      }
      const rows = await sql<QueryResultRow[]>(
        `INSERT INTO icsa_enrollments (cycle_id, country, champion_email, champion_name, deadline)
         VALUES (?, ?, ?, ?, ?) ON CONFLICT (cycle_id, country) DO NOTHING RETURNING id`,
        [cycleId, a.country, champ.email, champ.name, c.deadline],
      );
      if (!rows[0]) {
        skipped.push(`${a.country} (already in this cycle)`);
        continue;
      }
      const id = Number(rows[0].id);
      assigned += 1;
      await logEvent(sql, {
        actor: actor.email,
        action: 'enrollment.created',
        cycleId,
        enrollmentId: id,
        detail: { country: a.country, champion: champ.email },
      });
      if (!mailConfigured() && !actor.isDemo) {
        emailError = new MailNotConfiguredError().message;
        continue;
      }
      try {
        await sendIcsaMail(
          assignedMail({
            to: champ.email,
            name: champ.name,
            cycleLabel: c.label,
            country: a.country,
            deadline: c.deadline,
            thresholdPct: Number(c.threshold_pct),
            enrollmentId: id,
          }),
        );
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'Some champions could not be emailed.';
      }
    }
    revalidate();
    if (!assigned) return { success: false, error: `Nothing was added: ${skipped.join('; ')}.` };
    return { success: true, data: { assigned, skipped, emailError } };
  } catch (err) {
    return fail(err, 'Could not assign the countries.', 'assignIcsaCountries.failed');
  }
}

/* ─── Nominate ──────────────────────────────────────────────────────────────────────────── */

export interface Nominee {
  email: string;
  name: string | null;
  jobTitle: string | null;
  department: string | null;
}

function cleanSections(sections: string[]): string[] | null {
  const keys = [...new Set(sections)].filter(isSectionKey);
  return keys.length && keys.length === new Set(sections).size ? keys : null;
}

/**
 * Nominate people and give each the same set of sections. Someone already nominated in this
 * country is skipped rather than given a second form; change their sections instead.
 */
export async function nominateIcsaRespondents(
  enrollmentId: number,
  people: Nominee[],
  sections: string[],
): Promise<IcsaResult<{ added: number; skipped: string[] }>> {
  try {
    const actor = await requireIcsaActor();
    await loadEnrollment(actor, enrollmentId);
    const keys = cleanSections(sections);
    if (!keys) return { success: false, error: 'Choose at least one form section.' };
    const valid = people
      .map((p) => ({ ...p, email: normalizeEmail(p.email) }))
      .filter((p) => p.email.includes('@'));
    if (!valid.length) return { success: false, error: 'Pick at least one person.' };

    let added = 0;
    const skipped: string[] = [];
    for (const p of valid) {
      const rows = await sql<QueryResultRow[]>(
        `INSERT INTO icsa_assessments
           (enrollment_id, respondent_email, respondent_name, job_title, department, sections, nominated_by)
         VALUES (?, ?, ?, ?, ?, ?::text[], ?)
         ON CONFLICT (enrollment_id, LOWER(respondent_email)) DO NOTHING RETURNING id`,
        [enrollmentId, p.email, p.name, p.jobTitle, p.department, keys, actor.email],
      );
      if (rows[0]) added += 1;
      else skipped.push(p.name || p.email);
    }
    await logEvent(sql, {
      actor: actor.email,
      action: 'respondents.nominated',
      enrollmentId,
      detail: { count: added, sections: keys },
    });
    revalidate();
    return { success: true, data: { added, skipped } };
  } catch (err) {
    return fail(err, 'Could not add those people.', 'nominateIcsaRespondents.failed');
  }
}

/**
 * Change which sections one person answers. Allowed until they start; after that their answers
 * would silently stop counting, so the form is locked to what they were sent.
 */
export async function setIcsaRespondentSections(
  assessmentId: number,
  sections: string[],
): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaActor();
    const [a] = await sql<QueryResultRow[]>(
      `SELECT enrollment_id, status FROM icsa_assessments WHERE id = ?`,
      [assessmentId],
    );
    if (!a) return { success: false, error: 'That person is no longer nominated.' };
    await loadEnrollment(actor, Number(a.enrollment_id));
    if (!['nominated', 'requested'].includes(a.status)) {
      return { success: false, error: 'They have started answering, so their sections are fixed.' };
    }
    const keys = cleanSections(sections);
    if (!keys) return { success: false, error: 'Choose at least one form section.' };
    await exec(
      `UPDATE icsa_assessments SET sections = ?::text[], updated_at = NOW() WHERE id = ?`,
      [keys, assessmentId],
    );
    revalidate();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not change their sections.', 'setIcsaRespondentSections.failed');
  }
}

/** Take someone off the list. Only before their request has gone out. */
export async function removeIcsaNominee(assessmentId: number): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaActor();
    const [a] = await sql<QueryResultRow[]>(
      `SELECT enrollment_id, status FROM icsa_assessments WHERE id = ?`,
      [assessmentId],
    );
    if (!a) return { success: true };
    await loadEnrollment(actor, Number(a.enrollment_id));
    if (a.status !== 'nominated') {
      return {
        success: false,
        error: 'Their request has already been sent, so they stay on the list.',
      };
    }
    await exec(`DELETE FROM icsa_assessments WHERE id = ?`, [assessmentId]);
    revalidate();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not remove them.', 'removeIcsaNominee.failed');
  }
}

/* ─── Requests and reminders ────────────────────────────────────────────────────────────── */

async function mailOne(
  kind: 'request' | 'reminder',
  e: EnrollmentRow,
  a: QueryResultRow,
): Promise<void> {
  await sendIcsaMail(
    requestMail({
      kind,
      to: a.respondent_email,
      name: a.respondent_name,
      cycleLabel: e.cycle_label,
      country: e.country,
      sections: sectionsByKeys(a.sections).map((s) => s.title),
      deadline: e.deadline,
      championName: e.champion_name,
      championEmail: e.champion_email,
      assessmentId: Number(a.id),
    }),
  );
}

/**
 * Send the form to everybody nominated and not yet asked. Requests are recorded whether or not
 * the email goes out: the form is in the respondent's ICSA page either way, and an email outage
 * should not stop the cycle. The result says how many emails actually left.
 */
export async function sendIcsaRequests(
  enrollmentId: number,
): Promise<IcsaResult<{ sent: number; emailed: number; emailError: string | null }>> {
  try {
    const actor = await requireIcsaActor();
    const e = await loadEnrollment(actor, enrollmentId);
    const rows = await sql<QueryResultRow[]>(
      `UPDATE icsa_assessments SET status = 'requested', requested_at = NOW(), updated_at = NOW()
        WHERE enrollment_id = ? AND status = 'nominated'
        RETURNING id, respondent_email, respondent_name, sections`,
      [enrollmentId],
    );
    if (!rows.length)
      return { success: false, error: 'Everybody on the list has already been sent the form.' };

    let emailed = 0;
    let emailError: string | null = null;
    if (!mailConfigured() && !actor.isDemo) {
      emailError = new MailNotConfiguredError().message;
    } else {
      for (const a of rows) {
        try {
          await mailOne('request', e, a);
          emailed += 1;
        } catch (err) {
          emailError = err instanceof Error ? err.message : 'Some emails could not be sent.';
        }
      }
    }
    await logEvent(sql, {
      actor: actor.email,
      action: 'requests.sent',
      cycleId: e.cycle_id,
      enrollmentId,
      detail: { count: rows.length, emailed },
    });
    revalidate();
    return { success: true, data: { sent: rows.length, emailed, emailError } };
  } catch (err) {
    return fail(err, 'Could not send the requests.', 'sendIcsaRequests.failed');
  }
}

/**
 * Remind people who have not submitted. `assessmentIds` empty means everybody outstanding. A
 * reminder is only counted once its email has gone, because "reminded" is a claim about an
 * email.
 */
export async function sendIcsaReminders(
  enrollmentId: number,
  assessmentIds: number[] = [],
): Promise<IcsaResult<{ reminded: number; failed: number }>> {
  try {
    const actor = await requireIcsaActor();
    const e = await loadEnrollment(actor, enrollmentId);
    if (!mailConfigured() && !actor.isDemo)
      return { success: false, error: new MailNotConfiguredError().message };
    const rows = await sql<QueryResultRow[]>(
      `SELECT id, respondent_email, respondent_name, sections FROM icsa_assessments
        WHERE enrollment_id = ? AND status = ANY(?::text[])
          AND (cardinality(?::bigint[]) = 0 OR id = ANY(?::bigint[]))`,
      [enrollmentId, AWAITING_RESPONDENT, assessmentIds, assessmentIds],
    );
    if (!rows.length) return { success: false, error: 'Nobody selected is waiting to respond.' };
    let reminded = 0;
    let failed = 0;
    for (const a of rows) {
      try {
        await mailOne('reminder', e, a);
        await exec(
          `UPDATE icsa_assessments SET last_reminded_at = NOW(), reminder_count = reminder_count + 1 WHERE id = ?`,
          [a.id],
        );
        reminded += 1;
      } catch (err) {
        failed += 1;
        log.warn('reminder.failed', { assessmentId: a.id, error: String(err) });
      }
    }
    await logEvent(sql, {
      actor: actor.email,
      action: 'reminders.sent',
      cycleId: e.cycle_id,
      enrollmentId,
      detail: { reminded, failed },
    });
    revalidate();
    if (!reminded)
      return { success: false, error: 'The reminders could not be sent. Try again shortly.' };
    return { success: true, data: { reminded, failed } };
  } catch (err) {
    return fail(err, 'Could not send the reminders.', 'sendIcsaReminders.failed');
  }
}

/* ─── Close and extend ──────────────────────────────────────────────────────────────────── */

/**
 * Close a country for this cycle. A champion may close once the response rate reaches the
 * administrator's threshold; an administrator may close at any time. Whoever has not submitted is
 * marked not completed.
 */
export async function closeIcsaEnrollment(enrollmentId: number, note: string): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaActor();
    await withTransaction(icsaPool, async (client) => {
      const { sql: tx } = createSqlHelpers(client);
      const e = await loadEnrollment(actor, enrollmentId);
      await tx(`SELECT 1 FROM icsa_enrollments WHERE id = ? FOR UPDATE`, [enrollmentId]);
      const st = await tx<QueryResultRow[]>(
        `SELECT status FROM icsa_assessments WHERE enrollment_id = ?`,
        [enrollmentId],
      );
      const p = progress(
        st.map((r) => r.status as AssessmentStatus),
        Number(e.threshold_pct),
      );
      if (!actor.isAdmin && !p.met) {
        throw new AccessError(
          `The ${p.thresholdPct}% threshold has not been reached yet: ${p.responded} of ${p.requested} have responded. Wait, or ask the administrator for an extension.`,
          409,
        );
      }
      await tx(
        `UPDATE icsa_enrollments SET status = 'closed', closed_at = NOW(), closed_by = ?, close_note = ? WHERE id = ?`,
        [actor.email, note?.trim() || null, enrollmentId],
      );
      await markOutstandingNotCompleted(tx, [enrollmentId]);
      await logEvent(tx, {
        actor: actor.email,
        action: 'enrollment.closed',
        cycleId: e.cycle_id,
        enrollmentId,
        detail: { responded: p.responded, requested: p.requested, threshold: p.thresholdPct, note },
      });
    });
    revalidate();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not close the country.', 'closeIcsaEnrollment.failed');
  }
}

/** Ask the administrator for more time for this country. One open request at a time. */
export async function requestIcsaExtension(
  enrollmentId: number,
  requestedDeadline: string,
  reason: string,
): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaActor();
    const e = await loadEnrollment(actor, enrollmentId);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDeadline))
      return { success: false, error: 'Pick the new date.' };
    if (requestedDeadline <= e.deadline || requestedDeadline < todayInDubai()) {
      return {
        success: false,
        error: `The new date has to be after the current deadline (${e.deadline}).`,
      };
    }
    if (!reason?.trim()) return { success: false, error: 'Say why more time is needed.' };
    const rows = await sql<QueryResultRow[]>(
      `INSERT INTO icsa_extension_requests (enrollment_id, requested_by, requested_deadline, reason)
       VALUES (?, ?, ?, ?) ON CONFLICT (enrollment_id) WHERE status = 'pending' DO NOTHING RETURNING id`,
      [enrollmentId, actor.email, requestedDeadline, reason.trim()],
    );
    if (!rows[0])
      return { success: false, error: 'There is already a request waiting for the administrator.' };
    await logEvent(sql, {
      actor: actor.email,
      action: 'extension.requested',
      cycleId: e.cycle_id,
      enrollmentId,
      detail: { requestedDeadline, reason },
    });
    /* The request is on the Administration page either way; the email only tells the admins
       to look, so a mail problem does not undo it. */
    const admins = icsaAdminEmails(actor);
    if (admins.length && (mailConfigured() || actor.isDemo)) {
      try {
        await sendIcsaMail(
          extensionRequestMail({
            to: admins,
            championName: actor.name,
            championEmail: actor.email,
            cycleLabel: e.cycle_label,
            country: e.country,
            currentDeadline: e.deadline,
            requestedDeadline,
            reason: reason.trim(),
          }),
        );
      } catch (err) {
        log.warn('extensionRequest.mail_failed', { enrollmentId, error: String(err) });
      }
    }
    revalidate();
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not send the request.', 'requestIcsaExtension.failed');
  }
}
