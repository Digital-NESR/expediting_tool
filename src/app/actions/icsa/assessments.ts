'use server';

import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { exec, sql } from '@/lib/icsa/db';
import { canManageCountry, requireIcsaActor, type IcsaActor } from '@/lib/icsa/access';
import { logEvent } from '@/lib/icsa/lifecycle';
import { mailConfigured, returnedMail, sendIcsaMail } from '@/lib/icsa/mail';
import {
  ANSWER_FIELD_MAX,
  ANSWER_FIELDS,
  EDITABLE_STATUSES,
  MAX_EVIDENCE_BYTES,
  MAX_FILES_PER_QUESTION,
  RESPONSES,
  sectionsByKeys,
  submissionIssues,
  type Answer,
  type Answers,
  type AssessmentStatus,
} from '@/lib/icsa/model';
import type { IcsaResult } from './cycles';

const log = logger('icsa-assessments');

function fail(err: unknown, fallback: string, event: string): IcsaResult<never> {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: fallback };
}

interface Row {
  id: number;
  enrollment_id: number;
  respondent_email: string;
  respondent_name: string | null;
  sections: string[];
  status: AssessmentStatus;
  designation: string | null;
  answers: Answers;
  country: string;
  cycle_id: number;
  cycle_label: string;
  enrollment_status: string;
}

async function load(id: number): Promise<Row | null> {
  const [r] = await sql<QueryResultRow[]>(
    `SELECT a.id, a.enrollment_id, a.respondent_email, a.respondent_name, a.sections, a.status,
            a.designation, a.answers, e.country, e.cycle_id, c.label AS cycle_label,
            e.status AS enrollment_status
       FROM icsa_assessments a
       JOIN icsa_enrollments e ON e.id = a.enrollment_id
       JOIN icsa_cycles c ON c.id = e.cycle_id
      WHERE a.id = ?`,
    [id],
  );
  return (r as Row) ?? null;
}

function isRespondent(actor: IcsaActor, a: Row): boolean {
  return a.respondent_email.toLowerCase() === actor.email.toLowerCase() && a.status !== 'nominated';
}

/** The respondent's own form, open for editing, or throw. */
async function loadEditable(actor: IcsaActor, id: number): Promise<Row> {
  const a = await load(id);
  if (!a || !isRespondent(actor, a)) throw new AccessError('That assessment is not yours.', 403);
  if (a.enrollment_status !== 'open') {
    throw new AccessError(
      `${a.country} has been closed for ${a.cycle_label}, so answers can no longer change.`,
      409,
    );
  }
  if (!EDITABLE_STATUSES.includes(a.status)) {
    throw new AccessError('This assessment has been submitted and is locked.', 409);
  }
  return a;
}

/** Validate a patch of answers against the respondent's own questions. */
function cleanPatch(patch: Record<string, Answer>, a: Row): Answers | string {
  const allowed = new Set(
    sectionsByKeys(a.sections).flatMap((s) =>
      s.questions.map((q) => q.ref.toLowerCase().replace('.', '_')),
    ),
  );
  const out: Answers = {};
  for (const [key, ans] of Object.entries(patch ?? {})) {
    if (!allowed.has(key)) return 'One of those questions is not on your form.';
    const clean: Answer = {};
    for (const f of ANSWER_FIELDS) {
      const v = ans?.[f];
      if (v === undefined || v === null) continue;
      const s = String(v);
      if (s.length > ANSWER_FIELD_MAX) return 'One of your remarks is too long.';
      if (f === 'r' && s && !(RESPONSES as readonly string[]).includes(s))
        return 'Unknown response.';
      if (f === 'du' && s && !/^\d{4}-\d{2}-\d{2}$/.test(s))
        return 'A due date is not a valid date.';
      (clean as Record<string, string>)[f] = s;
    }
    out[key] = clean;
  }
  return out;
}

/**
 * Autosave. Merges the changed answers (each answer replaced whole) and the designation; the
 * first save moves the form from "not started" to "in progress".
 */
export async function saveIcsaAssessment(
  id: number,
  input: { designation?: string; answers?: Record<string, Answer> },
): Promise<IcsaResult<{ savedAt: string }>> {
  try {
    const actor = await requireIcsaActor();
    const a = await loadEditable(actor, id);
    const patch = cleanPatch(input.answers ?? {}, a);
    if (typeof patch === 'string') return { success: false, error: patch };
    const designation =
      input.designation === undefined ? null : String(input.designation).slice(0, 200);
    const [row] = await sql<QueryResultRow[]>(
      `UPDATE icsa_assessments
          SET answers = answers || ?::jsonb,
              designation = COALESCE(?, designation),
              status = CASE WHEN status = 'requested' THEN 'in_progress' ELSE status END,
              started_at = COALESCE(started_at, NOW()),
              updated_at = NOW()
        WHERE id = ? RETURNING updated_at`,
      [JSON.stringify(patch), designation, id],
    );
    return { success: true, data: { savedAt: row.updated_at } };
  } catch (err) {
    return fail(err, 'Could not save. Your changes will retry.', 'saveIcsaAssessment.failed');
  }
}

export async function submitIcsaAssessment(id: number): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaActor();
    const a = await loadEditable(actor, id);
    const issues = submissionIssues(a, sectionsByKeys(a.sections));
    if (issues.length) {
      return { success: false, error: `Fix these first: ${issues.map((i) => i.text).join(' ')}` };
    }
    await exec(
      `UPDATE icsa_assessments
          SET status = 'submitted', submitted_at = NOW(), reviewer_note = NULL, updated_at = NOW()
        WHERE id = ?`,
      [id],
    );
    await logEvent(sql, {
      actor: actor.email,
      action: 'assessment.submitted',
      cycleId: a.cycle_id,
      enrollmentId: a.enrollment_id,
      assessmentId: id,
    });
    revalidatePath('/icsa', 'layout');
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not submit the assessment.', 'submitIcsaAssessment.failed');
  }
}

/**
 * A reviewer (the country's champion or an administrator) accepts a submitted assessment or
 * returns it with a note. The fuller review and approval chain comes in a later phase.
 */
export async function reviewIcsaAssessment(
  id: number,
  decision: 'reviewed' | 'returned',
  note: string,
): Promise<IcsaResult<{ emailError: string | null }>> {
  try {
    const actor = await requireIcsaActor();
    const a = await load(id);
    if (!a || !canManageCountry(actor, a.country)) {
      throw new AccessError('You do not review that country.', 403);
    }
    if (a.status !== 'submitted' && a.status !== 'reviewed') {
      return { success: false, error: 'Only a submitted assessment can be reviewed.' };
    }
    if (decision === 'returned') {
      if (!note?.trim())
        return { success: false, error: 'Add a note so the respondent knows what to change.' };
      if (a.enrollment_status !== 'open') {
        return {
          success: false,
          error: `${a.country} is closed, so the assessment cannot be returned for changes.`,
        };
      }
    }
    await exec(
      `UPDATE icsa_assessments
          SET status = ?, reviewer_note = ?,
              reviewed_by = CASE WHEN ? = 'reviewed' THEN ? ELSE NULL END,
              reviewed_at = CASE WHEN ? = 'reviewed' THEN NOW() ELSE NULL END,
              updated_at = NOW()
        WHERE id = ?`,
      [decision, note?.trim() || null, decision, actor.name || actor.email, decision, id],
    );
    await logEvent(sql, {
      actor: actor.email,
      action: `assessment.${decision}`,
      cycleId: a.cycle_id,
      enrollmentId: a.enrollment_id,
      assessmentId: id,
      detail: { note },
    });
    let emailError: string | null = null;
    if (decision === 'returned' && (mailConfigured() || actor.isDemo)) {
      try {
        await sendIcsaMail(
          returnedMail({
            to: a.respondent_email,
            name: a.respondent_name,
            cycleLabel: a.cycle_label,
            country: a.country,
            note: note.trim(),
            assessmentId: id,
          }),
        );
      } catch (err) {
        emailError = err instanceof Error ? err.message : 'The email could not be sent.';
      }
    }
    revalidatePath('/icsa', 'layout');
    return { success: true, data: { emailError } };
  } catch (err) {
    return fail(err, 'Could not record the review.', 'reviewIcsaAssessment.failed');
  }
}

/* ─── Evidence ──────────────────────────────────────────────────────────────────────────── */

const ALLOWED_EXT = /\.(pdf|png|jpe?g|docx?|xlsx?|csv|txt|msg|eml|pptx?)$/i;

export async function uploadIcsaEvidence(
  form: FormData,
): Promise<IcsaResult<{ id: number; fileName: string; sizeBytes: number; contentType: string }>> {
  try {
    const actor = await requireIcsaActor();
    const id = Number(form.get('assessmentId'));
    const ref = String(form.get('questionRef') ?? '');
    const file = form.get('file');
    const a = await loadEditable(actor, id);
    const refs = sectionsByKeys(a.sections).flatMap((s) => s.questions.map((q) => q.ref));
    if (!refs.includes(ref)) return { success: false, error: 'That question is not on your form.' };
    if (!(file instanceof File) || !file.size) return { success: false, error: 'Choose a file.' };
    if (file.size > MAX_EVIDENCE_BYTES) {
      return {
        success: false,
        error: `${file.name} is over 5 MB. Put it on SharePoint and paste the link as the evidence reference.`,
      };
    }
    if (!ALLOWED_EXT.test(file.name)) {
      return {
        success: false,
        error: 'Attach a PDF, image, Office document, CSV, text or email file.',
      };
    }
    const [{ n }] = await sql<QueryResultRow[]>(
      `SELECT COUNT(*)::int AS n FROM icsa_evidence WHERE assessment_id = ? AND question_ref = ?`,
      [id, ref],
    );
    if (n >= MAX_FILES_PER_QUESTION) {
      return { success: false, error: `Up to ${MAX_FILES_PER_QUESTION} files per question.` };
    }
    const data = Buffer.from(await file.arrayBuffer());
    const contentType = file.type || 'application/octet-stream';
    const [row] = await sql<QueryResultRow[]>(
      `INSERT INTO icsa_evidence (assessment_id, question_ref, file_name, content_type, size_bytes, data, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [id, ref, file.name.slice(0, 200), contentType, file.size, data, actor.email],
    );
    await exec(
      `UPDATE icsa_assessments SET updated_at = NOW(), started_at = COALESCE(started_at, NOW()) WHERE id = ?`,
      [id],
    );
    return {
      success: true,
      data: { id: Number(row.id), fileName: file.name, sizeBytes: file.size, contentType },
    };
  } catch (err) {
    return fail(err, 'Could not upload the file.', 'uploadIcsaEvidence.failed');
  }
}

export async function deleteIcsaEvidence(evidenceId: number): Promise<IcsaResult> {
  try {
    const actor = await requireIcsaActor();
    const [ev] = await sql<QueryResultRow[]>(
      `SELECT assessment_id FROM icsa_evidence WHERE id = ?`,
      [evidenceId],
    );
    if (!ev) return { success: true };
    await loadEditable(actor, Number(ev.assessment_id));
    await exec(`DELETE FROM icsa_evidence WHERE id = ?`, [evidenceId]);
    return { success: true };
  } catch (err) {
    return fail(err, 'Could not remove the file.', 'deleteIcsaEvidence.failed');
  }
}
