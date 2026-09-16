/**
 * Learning Hub decision logic — the half of the tool that has no database.
 *
 * Everything the Learning Hub actually *decides* used to be interleaved with the SQL that fed it:
 * whether a lesson is locked, whether an attempt passed, whether the answer key may ship, whether a
 * deploy is allowed to rebuild a track (and cascade-delete every learner's progress with it). None
 * of that could be tested without a Postgres, so none of it was.
 *
 * This module is the fold, not the fetch. A function belongs here when it takes rows or values in
 * and returns a verdict out:
 *
 *   - it opens no pool and imports nothing from `pg` (type-only imports of the view shapes are
 *     fine — they are erased);
 *   - it reads no session, no environment and no clock;
 *   - it is deterministic, so a unit test can pin the rule rather than the plumbing.
 *
 * Anything that needs a connection, an actor, or an ordering guarantee from the database stays in
 * `src/lib/learning-hub-queries.ts` / `src/app/actions/learning-hub.ts` and calls in here. Those two
 * modules are the only callers; keep it that way, because the moment this file needs a pool the
 * tests in `__tests__/learning-hub-logic.test.ts` stop being runnable.
 */

import { createHash } from 'crypto';
import type { SeedTrack } from '@/lib/learning-hub-seed-content';
import type {
  LessonQuizAttemptResult,
  MyWorkCourse,
  MyWorkData,
  QuizAnswerInput,
  QuizAttemptResult,
} from '@/types/learning-hub';

/** Pass mark applied when a quiz row carries no `pass_pct` of its own. */
export const DEFAULT_QUIZ_PASS_PCT = 70;

/* ── Progress arithmetic ─────────────────────────────────────────────────── */

/**
 * Completion as a whole percentage, with the empty course pinned to 0 rather than NaN.
 * Every progress bar in the hub (dashboard, track, course, My Work) is this one expression.
 */
export function progressPct(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

/* ── Lesson gating ───────────────────────────────────────────────────────── */

/** What the gating fold decides about one lesson. */
export interface LessonGate {
  hasQuiz: boolean;
  quizId: number | null;
  passPct: number;
  quizPassed: boolean;
  locked: boolean;
}

/**
 * One row of the gating query: a lesson, its quiz (if any), and whether *this* learner has passed
 * it. Every field is `unknown` and optional because the row arrives straight off `pg` — numeric
 * columns can come back as strings, `passed` is null when there is no result row, and the type has
 * to accept a bare `QueryResultRow` without the caller casting.
 */
export type CourseGatingRow = Record<string, unknown> & {
  lesson_id?: unknown;
  quiz_id?: unknown;
  pass_pct?: unknown;
  passed?: unknown;
};

/**
 * Walk a course's lessons in order and decide what is locked.
 *
 * The rule: a lesson is locked when any EARLIER lesson carrying a quiz has not been passed. The
 * lesson holding the first unpassed quiz is itself unlocked — that is the one you are meant to be
 * sitting on — and everything after it stays locked until that quiz passes. A lesson with no quiz
 * never blocks anything.
 *
 * `rows` MUST already be in course order (module order_index, then lesson order_index); the caller's
 * ORDER BY is what makes "earlier" mean anything here.
 */
export function foldCourseGating(rows: readonly CourseGatingRow[]): Map<number, LessonGate> {
  const map = new Map<number, LessonGate>();
  let blocked = false;
  for (const r of rows) {
    const quizId = r.quiz_id != null ? Number(r.quiz_id) : null;
    const hasQuiz = quizId != null;
    const quizPassed = r.passed === true;
    map.set(Number(r.lesson_id), {
      hasQuiz,
      quizId,
      passPct: Number(r.pass_pct ?? DEFAULT_QUIZ_PASS_PCT),
      quizPassed,
      locked: blocked,
    });
    if (hasQuiz && !quizPassed) blocked = true;
  }
  return map;
}

/** The completion/lock flags the course outline and the lesson viewer both render. */
export interface LessonProgressFlags {
  completed: boolean;
  has_quiz: boolean;
  quiz_passed: boolean;
  locked: boolean;
}

/**
 * Completion for one lesson.
 *
 * A lesson WITH a quiz counts as complete only when the quiz is passed — a progress row on its own
 * does not count, otherwise "mark complete" would let a learner walk past the gate. A lesson with no
 * quiz is complete exactly when it has a progress row.
 */
export function lessonProgressFlags(
  gate: LessonGate | undefined,
  hasProgressRow: boolean,
): LessonProgressFlags {
  return {
    completed: gate?.hasQuiz ? !!gate.quizPassed : hasProgressRow,
    has_quiz: !!gate?.hasQuiz,
    quiz_passed: !!gate?.quizPassed,
    locked: !!gate?.locked,
  };
}

/* ── Quiz grading ────────────────────────────────────────────────────────── */

/**
 * Score an attempt against the answer key.
 *
 * The key is the question set: a question the learner never answered still counts against them, and
 * an answer for a question that is not on the quiz is ignored. Where the payload repeats a question,
 * the last entry for it wins.
 */
export function gradeQuizAttempt(
  correctByQuestion: ReadonlyMap<number, number>,
  answers: readonly QuizAnswerInput[],
): QuizAttemptResult {
  const selectedByQuestion = new Map<number, number | null>();
  for (const a of answers) {
    selectedByQuestion.set(Number(a.questionId), a.optionId != null ? Number(a.optionId) : null);
  }

  let correctCount = 0;
  const results = [...correctByQuestion.entries()].map(([questionId, correctOptionId]) => {
    const selectedOptionId = selectedByQuestion.get(questionId) ?? null;
    const correct = selectedOptionId === correctOptionId;
    if (correct) correctCount++;
    return { questionId, selectedOptionId, correctOptionId, correct };
  });

  const total = results.length;
  return { total, correctCount, scorePct: progressPct(correctCount, total), results };
}

/**
 * Grade a *gating* lesson quiz: the same score, plus the pass verdict and the redaction that makes
 * the gate real.
 *
 * `pass_pct` is a floor, not a bar to clear — scoring exactly the pass mark passes.
 *
 * The answer key is returned ONLY on a passing attempt. Handing `correctOptionId` back on a failure
 * made the gate decorative: submit blank, read the answers out of the response, resubmit, pass.
 * Per-question `correct` is returned either way, so a learner still sees which questions they missed
 * — just not what the right answer was until they have earned it.
 */
export function gradeLessonQuizAttempt(
  correctByQuestion: ReadonlyMap<number, number>,
  answers: readonly QuizAnswerInput[],
  passPct: number,
): LessonQuizAttemptResult {
  const attempt = gradeQuizAttempt(correctByQuestion, answers);
  const passed = attempt.scorePct >= passPct;
  return {
    total: attempt.total,
    correctCount: attempt.correctCount,
    scorePct: attempt.scorePct,
    passed,
    pass_pct: passPct,
    results: attempt.results.map((r) => ({
      ...r,
      correctOptionId: passed ? r.correctOptionId : null,
    })),
  };
}

/* ── My Work bucketing ───────────────────────────────────────────────────── */

/**
 * Split the learner's courses into the three columns My Work renders.
 *
 * A course with no lessons at all can never be "completed" — it has nothing to complete — so it
 * lands in notStarted rather than reporting a hollow 100%.
 */
export function bucketMyWorkCourses(courses: readonly MyWorkCourse[]): MyWorkData {
  return {
    inProgress: courses.filter((c) => c.completed_count > 0 && c.completed_count < c.lesson_count),
    completed: courses.filter((c) => c.lesson_count > 0 && c.completed_count === c.lesson_count),
    notStarted: courses.filter((c) => c.completed_count === 0),
  };
}

/* ── Seed content fingerprint ────────────────────────────────────────────── */

/**
 * A stable fingerprint of a track's code-defined content, stored per track as `seed_version`.
 *
 * This is the switch that decides whether a deploy rebuilds a track. A track whose hash still
 * matches is left completely alone, so admin CMS edits survive unrelated deploys; a track whose hash
 * moved has its courses replaced, which cascades to every learner's progress in it. So "hashes the
 * same" is not a cosmetic property — it is what stops an unrelated deploy from wiping progress.
 */
export function hashSeedTrack(track: SeedTrack): string {
  return createHash('sha256').update(JSON.stringify(track)).digest('hex');
}

/* ── Admin reorder ───────────────────────────────────────────────────────── */

/** One `{id, order_index}` row of the sibling list being reordered, straight off `pg`. */
export type OrderableRow = Record<string, unknown> & {
  id?: unknown;
  order_index?: unknown;
};

/** The two writes a reorder performs: each row takes the other's `order_index`. */
export interface OrderSwap {
  moved: { id: number; order_index: number };
  displaced: { id: number; order_index: number };
}

/**
 * Decide which pair of siblings a move swaps.
 *
 * Returns null when there is nothing to do — the id is not among the siblings, or it is already at
 * the end it is being moved towards. The two rows exchange `order_index` values rather than being
 * renumbered, so the list keeps whatever gaps it already had.
 *
 * `rows` MUST be in display order (order_index ASC, id ASC); "the one above" is a position in that
 * list, not `order_index - 1`, which need not exist.
 */
export function planOrderSwap(
  rows: readonly OrderableRow[],
  id: number,
  direction: 'up' | 'down',
): OrderSwap | null {
  const idx = rows.findIndex((r) => Number(r.id) === id);
  if (idx < 0) return null;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return null;
  const a = rows[idx];
  const b = rows[swapIdx];
  return {
    moved: { id: Number(a.id), order_index: Number(b.order_index) },
    displaced: { id: Number(b.id), order_index: Number(a.order_index) },
  };
}

/* ── Lesson video embeds ─────────────────────────────────────────────────── */

/**
 * Exact hosts. `url.us.m.mimecastprotect.com` is Mimecast's corporate link rewrite and already
 * appears in the seeded SAP content, so rejecting it would break existing lessons the moment an
 * admin re-saves them.
 */
const VIDEO_EMBED_HOSTS = new Set(['nesrcorp.sharepoint.com', 'url.us.m.mimecastprotect.com']);
/** Suffix matches: any *.sharepoint.com / *.microsoftstream.com tenant. */
const VIDEO_EMBED_HOST_SUFFIXES = ['.sharepoint.com', '.microsoftstream.com'];

/** Accepted (`value` is what to store, null for "no video") or rejected with a reason to show. */
export type VideoUrlCheck = { ok: true; value: string | null } | { ok: false; message: string };

/**
 * Decide whether a lesson's video URL may be stored.
 *
 * A lesson's `video_url` is rendered as `<iframe src={videoUrl}>` in the lesson viewer, so an
 * arbitrary URL is an injected frame and this is a security boundary, not validation. Only the
 * corporate embed hosts that actually host the training videos are accepted, plus same-origin
 * relative paths for anything served from `/public`.
 *
 * Returns a verdict rather than throwing so the rule stays free of the auth module; the caller turns
 * a rejection into the `AccessError` the CMS expects.
 */
export function checkVideoUrl(raw: string | null | undefined): VideoUrlCheck {
  const value = (raw ?? '').trim();
  if (!value) return { ok: true, value: null };
  // Same-origin relative path (e.g. /videos/intro.mp4). `//host/...` is protocol-relative, i.e.
  // off-origin, so it is not a relative path.
  if (value.startsWith('/') && !value.startsWith('//')) return { ok: true, value };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: 'Video URL must be an https embed link or a relative path.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, message: 'Video URL must use https.' };
  }
  const host = parsed.hostname.toLowerCase();
  const allowed =
    VIDEO_EMBED_HOSTS.has(host) ||
    VIDEO_EMBED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix));
  if (!allowed) {
    return { ok: false, message: `"${host}" is not an approved video embed host.` };
  }
  return { ok: true, value };
}
