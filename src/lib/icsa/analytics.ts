import type { QueryResultRow } from 'pg';
import { sql } from './db';
import type { IcsaActor } from './access';
import { countryGaps, type CountryGap, type GapReview } from './ai';
import { RESPONDED_STATUSES, progress, scoreAnswers, sectionsByKeys, type Progress } from './model';
import { ICSA_SECTIONS } from './questions';
import {
  getCycle,
  getEnrollment,
  listAssessmentsForEnrollment,
  listEnrollments,
  type AssessmentSummary,
  type Cycle,
  type Enrollment,
} from './queries';

/**
 * Figures for the Analytics tab. A plain module like ./queries: callers resolve the actor, and
 * every read here is scoped by it (a champion sees their countries, an admin all of them).
 */

export interface SavedReview {
  id: number;
  review: GapReview;
  responsesCount: number;
  model: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ActionPlan {
  id: number;
  enrollmentId: number;
  questionRef: string;
  action: string;
  owner: string | null;
  dueDate: string | null;
  status: 'open' | 'in_progress' | 'done';
  fromAi: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CountrySnapshot {
  enrollment: Enrollment;
  progress: Progress;
  /** Submitted or reviewed forms: the only ones the figures count. */
  forms: number;
  /** Yes ÷ (Yes + No + Partial), pooled over every submitted form. */
  compliance: number | null;
  /** The same, per section; null where nobody answered that section. */
  perSection: { key: string; id: number; short: string; rate: number | null }[];
  gaps: CountryGap[];
  plans: ActionPlan[];
  review: SavedReview | null;
}

function toPlan(r: QueryResultRow): ActionPlan {
  return {
    id: Number(r.id),
    enrollmentId: Number(r.enrollment_id),
    questionRef: r.question_ref,
    action: r.action,
    owner: r.owner ?? null,
    dueDate: r.due_date ?? null,
    status: r.status,
    fromAi: !!r.from_ai,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

async function plansFor(enrollmentIds: number[]): Promise<ActionPlan[]> {
  if (!enrollmentIds.length) return [];
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, enrollment_id, question_ref, action, owner, due_date::text AS due_date, status,
            from_ai, created_by, created_at, updated_at
       FROM icsa_action_plans WHERE enrollment_id = ANY(?::bigint[])
      ORDER BY created_at`,
    [enrollmentIds],
  );
  return rows.map(toPlan);
}

async function latestReviews(enrollmentIds: number[]): Promise<Map<number, SavedReview>> {
  const out = new Map<number, SavedReview>();
  if (!enrollmentIds.length) return out;
  const rows = await sql<QueryResultRow[]>(
    `SELECT DISTINCT ON (enrollment_id) id, enrollment_id, review, responses_count, model,
            created_by, created_at
       FROM icsa_ai_reviews WHERE enrollment_id = ANY(?::bigint[])
      ORDER BY enrollment_id, created_at DESC`,
    [enrollmentIds],
  );
  for (const r of rows) {
    out.set(Number(r.enrollment_id), {
      id: Number(r.id),
      review: r.review as GapReview,
      responsesCount: Number(r.responses_count),
      model: r.model ?? null,
      createdBy: r.created_by,
      createdAt: r.created_at,
    });
  }
  return out;
}

function snapshot(
  enrollment: Enrollment,
  assessments: AssessmentSummary[],
  plans: ActionPlan[],
  review: SavedReview | null,
): CountrySnapshot {
  const responded = assessments.filter((a) => RESPONDED_STATUSES.includes(a.status));
  const scores = responded.map((a) => scoreAnswers(a.answers, sectionsByKeys(a.sections)));
  const pool = (key?: string) => {
    let yes = 0;
    let n = 0;
    for (const s of scores)
      for (const p of s.per) {
        if (key && p.section.key !== key) continue;
        yes += p.tally.Yes;
        n += p.tally.Yes + p.tally.No + p.tally.Partial;
      }
    return n ? yes / n : null;
  };
  return {
    enrollment,
    progress: progress(assessments.map((a) => a.status)),
    forms: responded.length,
    compliance: pool(),
    perSection: ICSA_SECTIONS.map((s) => ({
      key: s.key,
      id: s.id,
      short: s.short,
      rate: pool(s.key),
    })),
    gaps: countryGaps(enrollment.country, responded),
    plans,
    review,
  };
}

/** One card per country the actor manages in this cycle. */
export async function countrySnapshots(
  actor: IcsaActor,
  cycleId: number,
): Promise<CountrySnapshot[]> {
  const enrollments = await listEnrollments(actor, cycleId);
  const ids = enrollments.map((e) => e.id);
  const [assessments, plans, reviews] = await Promise.all([
    Promise.all(ids.map((id) => listAssessmentsForEnrollment(id))),
    plansFor(ids),
    latestReviews(ids),
  ]);
  return enrollments.map((e, i) =>
    snapshot(
      e,
      assessments[i],
      plans.filter((p) => p.enrollmentId === e.id),
      reviews.get(e.id) ?? null,
    ),
  );
}

/** One country in full, or null if the actor may not see it. */
export async function countrySnapshot(
  actor: IcsaActor,
  enrollmentId: number,
): Promise<{ cycle: Cycle; snap: CountrySnapshot } | null> {
  const enrollment = await getEnrollment(actor, enrollmentId);
  if (!enrollment) return null;
  const [cycle, assessments, plans, reviews] = await Promise.all([
    getCycle(enrollment.cycleId),
    listAssessmentsForEnrollment(enrollmentId),
    plansFor([enrollmentId]),
    latestReviews([enrollmentId]),
  ]);
  if (!cycle) return null;
  return {
    cycle,
    snap: snapshot(enrollment, assessments, plans, reviews.get(enrollmentId) ?? null),
  };
}
