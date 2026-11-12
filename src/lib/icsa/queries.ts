import type { QueryResultRow } from 'pg';
import { sql } from './db';
import { canManageCountry, managedCountries, type IcsaActor } from './access';
import { sweepOverdue } from './lifecycle';
import type { Answers, AssessmentStatus, EnrollmentStatus, IcsaFrequency } from './model';

/**
 * Reads for the ICSA pages. A plain module (not `'use server'`), called from server components
 * that have already resolved the actor; every function still takes the actor and scopes by it,
 * so a page cannot show more than its viewer may see by forgetting a check.
 *
 * DATE columns are selected `::text`: pg turns a DATE into a local-midnight Date, which
 * serialises as the previous day anywhere east of UTC.
 */

export interface Cycle {
  id: number;
  label: string;
  frequency: IcsaFrequency;
  periodStart: string;
  periodEnd: string;
  deadline: string;
  thresholdPct: number;
  status: 'open' | 'closed';
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Enrollment {
  id: number;
  cycleId: number;
  country: string;
  championEmail: string;
  championName: string | null;
  deadline: string;
  status: EnrollmentStatus;
  closedAt: string | null;
  closedBy: string | null;
  closeNote: string | null;
  enrolledAt: string;
  /** Status of every nominee, for progress against the threshold. */
  statuses: AssessmentStatus[];
  pendingExtension: ExtensionRequest | null;
}

export interface ExtensionRequest {
  id: number;
  enrollmentId: number;
  requestedBy: string;
  requestedDeadline: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  decidedBy: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  requestedAt: string;
}

export interface AssessmentSummary {
  id: number;
  enrollmentId: number;
  respondentEmail: string;
  respondentName: string | null;
  jobTitle: string | null;
  department: string | null;
  sections: string[];
  status: AssessmentStatus;
  designation: string | null;
  requestedAt: string | null;
  lastRemindedAt: string | null;
  reminderCount: number;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewerNote: string | null;
  updatedAt: string;
  answers: Answers;
}

export interface AssessmentContext {
  cycleId: number;
  cycleLabel: string;
  cycleStatus: 'open' | 'closed';
  periodStart: string;
  periodEnd: string;
  country: string;
  championEmail: string;
  championName: string | null;
  deadline: string;
  enrollmentStatus: EnrollmentStatus;
}

export type AssessmentWithContext = AssessmentSummary & AssessmentContext;

export interface EvidenceFile {
  id: number;
  questionRef: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export interface Champion {
  id: number;
  email: string;
  name: string | null;
  country: string;
  createdBy: string;
  createdAt: string;
}

/* ─── Row mappers ───────────────────────────────────────────────────────────────────────── */

const CYCLE_COLS = `c.id, c.label, c.frequency, c.period_start::text AS period_start,
  c.period_end::text AS period_end, c.deadline::text AS deadline, c.threshold_pct, c.status,
  c.closed_at, c.closed_by, c.close_reason, c.created_by, c.created_at`;

function toCycle(r: QueryResultRow): Cycle {
  return {
    id: Number(r.id),
    label: String(r.label),
    frequency: r.frequency,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    deadline: r.deadline,
    thresholdPct: Number(r.threshold_pct),
    status: r.status,
    closedAt: r.closed_at ?? null,
    closedBy: r.closed_by ?? null,
    closeReason: r.close_reason ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

const ENROLLMENT_COLS = `e.id, e.cycle_id, e.country, e.champion_email, e.champion_name,
  e.deadline::text AS deadline, e.status, e.closed_at, e.closed_by, e.close_note, e.enrolled_at,
  COALESCE((SELECT array_agg(a.status) FROM icsa_assessments a WHERE a.enrollment_id = e.id), '{}') AS statuses,
  (SELECT row_to_json(x) FROM (
     SELECT r.id, r.enrollment_id, r.requested_by, r.requested_deadline::text AS requested_deadline,
            r.reason, r.status, r.decided_by, r.decided_at, r.decision_note, r.requested_at
       FROM icsa_extension_requests r WHERE r.enrollment_id = e.id AND r.status = 'pending' LIMIT 1) x
  ) AS pending_extension`;

function toExtension(r: QueryResultRow): ExtensionRequest {
  return {
    id: Number(r.id),
    enrollmentId: Number(r.enrollment_id),
    requestedBy: r.requested_by,
    requestedDeadline: String(r.requested_deadline).slice(0, 10),
    reason: r.reason,
    status: r.status,
    decidedBy: r.decided_by ?? null,
    decidedAt: r.decided_at ?? null,
    decisionNote: r.decision_note ?? null,
    requestedAt: r.requested_at,
  };
}

function toEnrollment(r: QueryResultRow): Enrollment {
  return {
    id: Number(r.id),
    cycleId: Number(r.cycle_id),
    country: r.country,
    championEmail: r.champion_email,
    championName: r.champion_name ?? null,
    deadline: r.deadline,
    status: r.status,
    closedAt: r.closed_at ?? null,
    closedBy: r.closed_by ?? null,
    closeNote: r.close_note ?? null,
    enrolledAt: r.enrolled_at,
    statuses: Array.isArray(r.statuses) ? r.statuses : [],
    pendingExtension: r.pending_extension ? toExtension(r.pending_extension) : null,
  };
}

const ASSESSMENT_COLS = `a.id, a.enrollment_id, a.respondent_email, a.respondent_name, a.job_title,
  a.department, a.sections, a.status, a.designation, a.requested_at, a.last_reminded_at,
  a.reminder_count, a.started_at, a.submitted_at, a.reviewed_by, a.reviewed_at, a.reviewer_note,
  a.updated_at, a.answers`;

const CONTEXT_COLS = `c.id AS cycle_id, c.label AS cycle_label, c.status AS cycle_status,
  c.period_start::text AS period_start, c.period_end::text AS period_end, e.country,
  e.champion_email, e.champion_name, e.deadline::text AS deadline, e.status AS enrollment_status`;

function toAssessment(r: QueryResultRow): AssessmentSummary {
  return {
    id: Number(r.id),
    enrollmentId: Number(r.enrollment_id),
    respondentEmail: r.respondent_email,
    respondentName: r.respondent_name ?? null,
    jobTitle: r.job_title ?? null,
    department: r.department ?? null,
    sections: Array.isArray(r.sections) ? r.sections : [],
    status: r.status,
    designation: r.designation ?? null,
    requestedAt: r.requested_at ?? null,
    lastRemindedAt: r.last_reminded_at ?? null,
    reminderCount: Number(r.reminder_count ?? 0),
    startedAt: r.started_at ?? null,
    submittedAt: r.submitted_at ?? null,
    reviewedBy: r.reviewed_by ?? null,
    reviewedAt: r.reviewed_at ?? null,
    reviewerNote: r.reviewer_note ?? null,
    updatedAt: r.updated_at,
    answers: (r.answers as Answers) ?? {},
  };
}

function toContext(r: QueryResultRow): AssessmentContext {
  return {
    cycleId: Number(r.cycle_id),
    cycleLabel: r.cycle_label,
    cycleStatus: r.cycle_status,
    periodStart: r.period_start,
    periodEnd: r.period_end,
    country: r.country,
    championEmail: r.champion_email,
    championName: r.champion_name ?? null,
    deadline: r.deadline,
    enrollmentStatus: r.enrollment_status,
  };
}

/** `AND e.country = ANY(?)` for a champion, nothing for an admin. */
function countryScope(actor: IcsaActor): { clause: string; params: string[][] } {
  const scope = managedCountries(actor);
  return scope === 'all'
    ? { clause: '', params: [] }
    : { clause: ' AND e.country = ANY(?::text[])', params: [scope] };
}

/* ─── Cycles ────────────────────────────────────────────────────────────────────────────── */

export async function listCycles(): Promise<Cycle[]> {
  await sweepOverdue();
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${CYCLE_COLS} FROM icsa_cycles c
      ORDER BY (c.status = 'open') DESC, c.period_start DESC, c.id DESC`,
  );
  return rows.map(toCycle);
}

export async function getCycle(id: number): Promise<Cycle | null> {
  await sweepOverdue();
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${CYCLE_COLS} FROM icsa_cycles c WHERE c.id = ?`,
    [id],
  );
  return rows[0] ? toCycle(rows[0]) : null;
}

/** Enrollments the actor manages, across all cycles or one. */
export async function listEnrollments(actor: IcsaActor, cycleId?: number): Promise<Enrollment[]> {
  const scope = countryScope(actor);
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${ENROLLMENT_COLS} FROM icsa_enrollments e
      WHERE (?::bigint IS NULL OR e.cycle_id = ?)${scope.clause}
      ORDER BY e.country`,
    [cycleId ?? null, cycleId ?? null, ...scope.params],
  );
  return rows.map(toEnrollment);
}

export async function getEnrollment(actor: IcsaActor, id: number): Promise<Enrollment | null> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${ENROLLMENT_COLS} FROM icsa_enrollments e WHERE e.id = ?`,
    [id],
  );
  const e = rows[0] ? toEnrollment(rows[0]) : null;
  return e && canManageCountry(actor, e.country) ? e : null;
}

/** Everybody nominated in one enrollment, with their answers (for completion). */
export async function listAssessmentsForEnrollment(
  enrollmentId: number,
): Promise<AssessmentSummary[]> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${ASSESSMENT_COLS} FROM icsa_assessments a
      WHERE a.enrollment_id = ?
      ORDER BY a.respondent_name NULLS LAST, a.respondent_email`,
    [enrollmentId],
  );
  return rows.map(toAssessment);
}

/** Every non-nominated assessment the actor manages, optionally narrowed. For the dashboard. */
export async function listManagedAssessments(
  actor: IcsaActor,
  filter: { cycleId?: number | null; country?: string | null; champion?: string | null },
): Promise<AssessmentWithContext[]> {
  await sweepOverdue();
  const scope = countryScope(actor);
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${ASSESSMENT_COLS}, ${CONTEXT_COLS}
       FROM icsa_assessments a
       JOIN icsa_enrollments e ON e.id = a.enrollment_id
       JOIN icsa_cycles c ON c.id = e.cycle_id
      WHERE a.status <> 'nominated'
        AND (?::bigint IS NULL OR c.id = ?)
        AND (?::text IS NULL OR e.country = ?)
        AND (?::text IS NULL OR LOWER(e.champion_email) = LOWER(?))${scope.clause}
      ORDER BY e.country, a.respondent_name NULLS LAST`,
    [
      filter.cycleId ?? null,
      filter.cycleId ?? null,
      filter.country ?? null,
      filter.country ?? null,
      filter.champion ?? null,
      filter.champion ?? null,
      ...scope.params,
    ],
  );
  return rows.map((r) => ({ ...toAssessment(r), ...toContext(r) }));
}

/* ─── Respondent ────────────────────────────────────────────────────────────────────────── */

export async function listMyAssessments(email: string): Promise<AssessmentWithContext[]> {
  await sweepOverdue();
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${ASSESSMENT_COLS}, ${CONTEXT_COLS}
       FROM icsa_assessments a
       JOIN icsa_enrollments e ON e.id = a.enrollment_id
       JOIN icsa_cycles c ON c.id = e.cycle_id
      WHERE LOWER(a.respondent_email) = LOWER(?) AND a.status <> 'nominated'
      ORDER BY (a.status IN ('requested','in_progress','returned')) DESC, c.period_start DESC`,
    [email],
  );
  return rows.map((r) => ({ ...toAssessment(r), ...toContext(r) }));
}

export type AssessmentAccess = 'respondent' | 'manager';

/**
 * One assessment, if the actor may see it: its respondent (once it has been sent), or an admin
 * or the country's champion.
 */
export async function getAssessment(
  actor: IcsaActor,
  id: number,
): Promise<{ assessment: AssessmentWithContext; access: AssessmentAccess[] } | null> {
  await sweepOverdue();
  const rows = await sql<QueryResultRow[]>(
    `SELECT ${ASSESSMENT_COLS}, ${CONTEXT_COLS}
       FROM icsa_assessments a
       JOIN icsa_enrollments e ON e.id = a.enrollment_id
       JOIN icsa_cycles c ON c.id = e.cycle_id
      WHERE a.id = ?`,
    [id],
  );
  if (!rows[0]) return null;
  const assessment = { ...toAssessment(rows[0]), ...toContext(rows[0]) };
  const access: AssessmentAccess[] = [];
  if (
    assessment.respondentEmail.toLowerCase() === actor.email.toLowerCase() &&
    assessment.status !== 'nominated'
  ) {
    access.push('respondent');
  }
  if (canManageCountry(actor, assessment.country)) access.push('manager');
  return access.length ? { assessment, access } : null;
}

export async function listEvidence(assessmentId: number): Promise<EvidenceFile[]> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, question_ref, file_name, content_type, size_bytes, uploaded_at
       FROM icsa_evidence WHERE assessment_id = ? ORDER BY uploaded_at`,
    [assessmentId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    questionRef: r.question_ref,
    fileName: r.file_name,
    contentType: r.content_type,
    sizeBytes: Number(r.size_bytes),
    uploadedAt: r.uploaded_at,
  }));
}

/* ─── Admin ─────────────────────────────────────────────────────────────────────────────── */

export async function listChampions(): Promise<Champion[]> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, email, name, country, created_by, created_at FROM icsa_champions
      ORDER BY country, name NULLS LAST, email`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    email: r.email,
    name: r.name ?? null,
    country: r.country,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function listPendingExtensions(): Promise<
  (ExtensionRequest & {
    country: string;
    cycleLabel: string;
    cycleId: number;
    currentDeadline: string;
  })[]
> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT r.id, r.enrollment_id, r.requested_by, r.requested_deadline::text AS requested_deadline,
            r.reason, r.status, r.decided_by, r.decided_at, r.decision_note, r.requested_at,
            e.country, e.deadline::text AS current_deadline, c.label AS cycle_label, c.id AS cycle_id
       FROM icsa_extension_requests r
       JOIN icsa_enrollments e ON e.id = r.enrollment_id
       JOIN icsa_cycles c ON c.id = e.cycle_id
      WHERE r.status = 'pending'
      ORDER BY r.requested_at`,
  );
  return rows.map((r) => ({
    ...toExtension(r),
    country: r.country,
    cycleLabel: r.cycle_label,
    cycleId: Number(r.cycle_id),
    currentDeadline: r.current_deadline,
  }));
}

/** Champions per country, so the admin's scope switcher can offer them. */
export async function championOptions(): Promise<{ email: string; name: string | null }[]> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT DISTINCT ON (LOWER(champion_email)) champion_email AS email, champion_name AS name
       FROM icsa_enrollments ORDER BY LOWER(champion_email)`,
  );
  return rows.map((r) => ({ email: r.email, name: r.name ?? null }));
}
