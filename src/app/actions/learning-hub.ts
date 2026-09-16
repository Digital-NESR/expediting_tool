'use server';

import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, normalizeEmail } from '@/lib/require-access';
import { getRedBullGameStats } from './learning-game';
import { SEED_TRACKS } from '@/lib/learning-hub-seed-content';
import learningHubPool from '@/lib/db-learning-hub';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/lib/db/tx';
import {
  sql,
  exec,
  sqlOn,
  execOn,
  ensureLearningHubReady,
  applySeedTrack,
  loadModuleQuizRaw,
} from '@/lib/learning-hub-queries';
/* The rules — grading, the pass boundary, the answer-key redaction, the embed-host allowlist and
   the reorder swap — live in one pg-free module so they can be unit tested without a database. */
import {
  DEFAULT_QUIZ_PASS_PCT,
  checkVideoUrl,
  gradeLessonQuizAttempt,
  gradeQuizAttempt,
  planOrderSwap,
  progressPct,
} from '@/lib/learning-hub-logic';
import type {
  LearningTrack,
  LearningCourse,
  LearningModule,
  LearningLesson,
  AdminModuleWithLessons,
  AdminCourseWithModules,
  AdminTrackWithCourses,
  LearningHubAdminData,
  CourseStatus,
  ModuleQuizWithAnswers,
  QuizAnswerInput,
  QuizAttemptResult,
  LessonQuizAttemptResult,
  LhCourseAnalytics,
  LhTrackAnalytics,
  LearningHubAnalytics,
} from '@/types/learning-hub';

const log = logger('learning-hub');

/* ── Actor + guards ──────────────────────────────────────────────────────
   Every export below is a public POST endpoint reachable by any signed-in
   employee, so the admin gate lives HERE, not in the /learning-hub/admin
   layout. The Learning Hub itself is deliberately open to all employees:
   learner actions need an actor, only the CMS needs an admin. ── */

async function getLearningHubActor(): Promise<{
  email: string;
  name: string;
  isAdmin: boolean;
} | null> {
  const actor = await currentActor();
  if (!actor) return null;
  return {
    email: normalizeEmail(actor.email),
    name: actor.name.trim() || actor.email.split('@')[0],
    isAdmin: actor.isPlatformAdmin,
  };
}

/** CMS gate. Throws {@link AccessError}, so a denied call can never reach a write. */
async function requireLearningHubAdmin(): Promise<{
  email: string;
  name: string;
  isAdmin: boolean;
}> {
  const actor = await getLearningHubActor();
  if (!actor?.isAdmin) throw new AccessError('Admins only.');
  return actor;
}

/* ── Lesson video embeds ─────────────────────────────────────────────────
   A lesson's video_url is rendered as <iframe src={videoUrl}> in the lesson
   viewer, so an arbitrary URL is an injected frame. The allowlist itself is
   `checkVideoUrl()` in learning-hub-logic; this is only the throw, which is
   what keeps the rule testable without dragging the auth module in. ── */

function sanitiseVideoUrl(raw: string | null | undefined): string | null {
  const verdict = checkVideoUrl(raw);
  if (!verdict.ok) throw new AccessError(verdict.message, 400);
  return verdict.value;
}

/* ── Admin analytics ──────────────────────────────────────────────────── */

const EMPTY_ANALYTICS: LearningHubAnalytics = {
  overview: {
    learners: 0,
    lessonCompletions: 0,
    courseCompletions: 0,
    trackCount: 0,
    courseCount: 0,
    lessonCount: 0,
  },
  tracks: [],
  redBull: {
    totalPlays: 0,
    uniquePlayers: 0,
    avgScore: null,
    bestScore: null,
    soloPlays: 0,
    teamPlays: 0,
    top: [],
  },
};

export async function getLearningHubAnalytics(): Promise<LearningHubAnalytics> {
  try {
    const actor = await getLearningHubActor();
    if (!actor?.isAdmin) return EMPTY_ANALYTICS;
    await ensureLearningHubReady();

    // All five reads are independent; they used to be awaited one after the other, so the admin
    // analytics page paid five serial round trips (plus whatever getRedBullGameStats did) before
    // rendering anything.
    const [trackRows, courseRows, overallRows, trackLearnerRows, redBull] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT id, key, name, color, order_index FROM learning_tracks ORDER BY order_index, id`,
      ),
      // Per-course: lesson count, distinct learners, learners who finished all lessons, total completions.
      sql<QueryResultRow[]>(
        `WITH course_lessons AS (
         SELECT c.id AS course_id, c.track_id, c.title, c.status, c.order_index,
                COUNT(l.id) AS lesson_count
         FROM learning_courses c
         LEFT JOIN learning_modules m ON m.course_id = c.id
         LEFT JOIN learning_lessons l ON l.module_id = m.id
         GROUP BY c.id, c.track_id, c.title, c.status, c.order_index
       ),
       user_course AS (
         SELECT c.id AS course_id, p.user_email, COUNT(DISTINCT p.lesson_id) AS done
         FROM learning_courses c
         JOIN learning_modules m ON m.course_id = c.id
         JOIN learning_lessons l ON l.module_id = m.id
         JOIN learning_lesson_progress p ON p.lesson_id = l.id
         GROUP BY c.id, p.user_email
       )
       SELECT cl.course_id, cl.track_id, cl.title, cl.status, cl.order_index,
              cl.lesson_count::int AS lesson_count,
              COUNT(DISTINCT uc.user_email)::int AS learners,
              COUNT(DISTINCT uc.user_email) FILTER (WHERE cl.lesson_count > 0 AND uc.done >= cl.lesson_count)::int AS completed_learners,
              COALESCE(SUM(uc.done), 0)::int AS lesson_completions
       FROM course_lessons cl
       LEFT JOIN user_course uc ON uc.course_id = cl.course_id
       GROUP BY cl.course_id, cl.track_id, cl.title, cl.status, cl.order_index, cl.lesson_count
       ORDER BY cl.track_id, cl.order_index, cl.course_id`,
      ),
      sql<QueryResultRow[]>(
        `SELECT COUNT(DISTINCT user_email)::int AS learners, COUNT(*)::int AS completions FROM learning_lesson_progress`,
      ),
      sql<QueryResultRow[]>(
        `SELECT c.track_id, COUNT(DISTINCT p.user_email)::int AS learners
         FROM learning_courses c
         JOIN learning_modules m ON m.course_id = c.id
         JOIN learning_lessons l ON l.module_id = m.id
         JOIN learning_lesson_progress p ON p.lesson_id = l.id
         GROUP BY c.track_id`,
      ),
      getRedBullGameStats(),
    ]);

    const tracks: LhTrackAnalytics[] = trackRows.map((t) => {
      const courses: LhCourseAnalytics[] = courseRows
        .filter((c) => Number(c.track_id) === Number(t.id))
        .map((c) => {
          const learners = Number(c.learners ?? 0);
          const completedLearners = Number(c.completed_learners ?? 0);
          return {
            id: Number(c.course_id),
            title: String(c.title),
            status: String(c.status),
            lessonCount: Number(c.lesson_count ?? 0),
            learners,
            completedLearners,
            lessonCompletions: Number(c.lesson_completions ?? 0),
            completionPct: progressPct(completedLearners, learners),
          };
        });
      return {
        key: String(t.key),
        name: String(t.name),
        color: (t.color as string) ?? null,
        learners: Number(
          trackLearnerRows.find((r) => Number(r.track_id) === Number(t.id))?.learners ?? 0,
        ),
        lessonCount: courses.reduce((s, c) => s + c.lessonCount, 0),
        lessonCompletions: courses.reduce((s, c) => s + c.lessonCompletions, 0),
        completedLearners: courses.reduce((s, c) => s + c.completedLearners, 0),
        courses,
      };
    });

    return {
      overview: {
        learners: Number(overallRows[0]?.learners ?? 0),
        lessonCompletions: Number(overallRows[0]?.completions ?? 0),
        courseCompletions: tracks.reduce((s, t) => s + t.completedLearners, 0),
        trackCount: tracks.length,
        courseCount: courseRows.length,
        lessonCount: courseRows.reduce((s, c) => s + Number(c.lesson_count ?? 0), 0),
      },
      tracks,
      redBull,
    };
  } catch (err) {
    log.error('analytics.load.failed', err);
    return EMPTY_ANALYTICS;
  }
}

/* ── Progress mutations ──────────────────────────────────────────────────
   The learner is taken from the session, never from an argument: a caller-
   supplied email let anyone mark lessons complete for a colleague. ── */

export async function markLessonComplete(lessonId: number): Promise<{ success: boolean }> {
  const actor = await getLearningHubActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  await ensureLearningHubReady();
  await exec(
    `INSERT INTO learning_lesson_progress (user_email, lesson_id) VALUES (?, ?)
     ON CONFLICT (user_email, lesson_id) DO NOTHING`,
    [actor.email, lessonId],
  );
  return { success: true };
}

export async function markLessonIncomplete(lessonId: number): Promise<{ success: boolean }> {
  const actor = await getLearningHubActor();
  if (!actor) throw new AccessError('Sign in required.', 401);
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_lesson_progress WHERE user_email = ? AND lesson_id = ?`, [
    actor.email,
    lessonId,
  ]);
  return { success: true };
}

/* Grade a lesson quiz server-side, persist the best result, and on a pass (>= pass_pct) mark the
   lesson complete so the next one unlocks.

   The answer key ships to the client ONLY once the attempt has passed. It used to ship on every
   attempt, under a comment claiming it never did, which made the gate decorative: submit blank,
   read correctOptionId out of the response, resubmit, pass. Per-question `correct` is always
   returned, so failing still tells a learner which questions they missed. */
export async function submitLessonQuiz(
  quizId: number,
  answers: QuizAnswerInput[],
): Promise<LessonQuizAttemptResult | null> {
  try {
    const actor = await getLearningHubActor();
    if (!actor) return null;
    await ensureLearningHubReady();

    const rows = await sql<QueryResultRow[]>(
      `SELECT q.id AS question_id, o.id AS option_id, o.is_correct
       FROM learning_quiz_questions q JOIN learning_quiz_options o ON o.question_id = q.id
       WHERE q.quiz_id = ?`,
      [quizId],
    );
    const correctByQ = new Map<number, number>();
    for (const r of rows)
      if (r.is_correct) correctByQ.set(Number(r.question_id), Number(r.option_id));
    if (correctByQ.size === 0) return null;

    const meta = await sql<QueryResultRow[]>(
      `SELECT pass_pct, lesson_id FROM learning_quizzes WHERE id = ?`,
      [quizId],
    );
    const passPct = Number(meta[0]?.pass_pct ?? DEFAULT_QUIZ_PASS_PCT);
    const lessonId = meta[0]?.lesson_id != null ? Number(meta[0].lesson_id) : null;

    /* Scoring, the pass boundary and the answer-key redaction are all decided here, with no
       database in the way — see gradeLessonQuizAttempt() and its tests. */
    const attempt = gradeLessonQuizAttempt(correctByQ, answers, passPct);

    await exec(
      `INSERT INTO learning_quiz_results (user_email, quiz_id, best_pct, passed, attempts)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT (user_email, quiz_id) DO UPDATE SET
         best_pct = GREATEST(learning_quiz_results.best_pct, EXCLUDED.best_pct),
         passed = learning_quiz_results.passed OR EXCLUDED.passed,
         attempts = learning_quiz_results.attempts + 1,
         updated_at = NOW()`,
      [actor.email, quizId, attempt.scorePct, attempt.passed],
    );
    if (attempt.passed && lessonId != null) {
      await exec(
        `INSERT INTO learning_lesson_progress (user_email, lesson_id) VALUES (?, ?) ON CONFLICT (user_email, lesson_id) DO NOTHING`,
        [actor.email, lessonId],
      );
    }
    return attempt;
  } catch (err) {
    log.error('lessonQuiz.submit.failed', err, { quizId });
    return null;
  }
}

/* ── Admin CMS ────────────────────────────────────────────────────────── */

const EMPTY_ADMIN_DATA: LearningHubAdminData = { tracks: [] };

export async function getLearningHubAdminData(): Promise<LearningHubAdminData> {
  // Read: degrade to an empty shape so the admin page renders instead of crashing.
  const actor = await getLearningHubActor();
  if (!actor?.isAdmin) return EMPTY_ADMIN_DATA;
  await ensureLearningHubReady();

  // Five independent selects: one round trip instead of five serial ones.
  const [tracks, courses, modules, lessons, quizRows] = await Promise.all([
    sql<LearningTrack[]>(`SELECT * FROM learning_tracks ORDER BY order_index ASC, id ASC`),
    sql<LearningCourse[]>(
      `SELECT * FROM learning_courses ORDER BY track_id ASC, order_index ASC, id ASC`,
    ),
    sql<LearningModule[]>(
      `SELECT * FROM learning_modules ORDER BY course_id ASC, order_index ASC, id ASC`,
    ),
    sql<LearningLesson[]>(
      `SELECT * FROM learning_lessons ORDER BY module_id ASC, order_index ASC, id ASC`,
    ),
    sql<QueryResultRow[]>(`SELECT module_id FROM learning_quizzes`),
  ]);
  const quizModuleIds = new Set(quizRows.map((r) => Number(r.module_id)));

  const modulesWithLessons: AdminModuleWithLessons[] = modules.map((m) => ({
    ...m,
    lessons: lessons.filter((l) => l.module_id === m.id),
    has_quiz: quizModuleIds.has(m.id),
  }));
  const coursesWithModules: AdminCourseWithModules[] = courses.map((c) => ({
    ...c,
    modules: modulesWithLessons.filter((m) => m.course_id === c.id),
  }));
  const tracksWithCourses: AdminTrackWithCourses[] = tracks.map((t) => ({
    ...t,
    courses: coursesWithModules.filter((c) => c.track_id === t.id),
  }));

  return { tracks: tracksWithCourses };
}

// Admin escape hatch: force one track back to its current code-defined content right now, even if
// the auto-sync already considers it up to date (e.g. to discard manual CMS edits deliberately).
// Destructive: it deletes the track's courses, which cascades to learner progress. applySeedTrack
// runs the whole replacement in one locked transaction, so a failure here leaves the track as it was
// rather than emptied, and it cannot interleave with a cold-start sync of the same track.
export async function resyncTrackFromSeed(
  trackKey: string,
): Promise<{ success: boolean; message: string }> {
  const actor = await requireLearningHubAdmin();
  await ensureLearningHubReady();
  const seedTrack = SEED_TRACKS.find((t) => t.key === trackKey);
  if (!seedTrack)
    return { success: false, message: `No seed content defined for track "${trackKey}".` };

  log.info('cms.track.resync.requested', { track: trackKey, actor: actor.email });
  await applySeedTrack(seedTrack, SEED_TRACKS.indexOf(seedTrack), true);
  return { success: true, message: `Reset "${seedTrack.name}" to its default seed content.` };
}

export async function createCourse(
  trackId: number,
  title: string,
  description: string,
  status: CourseStatus,
): Promise<{ id: number }> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  const maxRows = await sql<QueryResultRow[]>(
    `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_courses WHERE track_id = ?`,
    [trackId],
  );
  const nextOrder = Number(maxRows[0]?.next ?? 0);
  const result = await exec(
    `INSERT INTO learning_courses (track_id, title, description, order_index, status) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [trackId, title, description, nextOrder, status],
  );
  return { id: result.insertId };
}

export async function updateCourse(
  id: number,
  fields: { title: string; description: string; status: CourseStatus },
): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  await exec(
    `UPDATE learning_courses SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.description, fields.status, id],
  );
}

export async function deleteCourse(id: number): Promise<void> {
  const actor = await requireLearningHubAdmin();
  await ensureLearningHubReady();
  /* Deleting a course cascades to its modules, its lessons and the learner progress
     recorded against them. Count first: after the DELETE there is nothing left to count,
     and this line is the only record of what went. */
  const doomed = await sql<QueryResultRow[]>(
    `SELECT (SELECT COUNT(*)::int FROM learning_modules WHERE course_id = $1) AS modules,
                (SELECT COUNT(*)::int FROM learning_lessons l JOIN learning_modules m ON m.id = l.module_id
                  WHERE m.course_id = $1) AS lessons,
                (SELECT COUNT(*)::int FROM learning_lesson_progress p
                   JOIN learning_lessons l ON l.id = p.lesson_id
                   JOIN learning_modules m ON m.id = l.module_id
                  WHERE m.course_id = $1) AS progress_rows`,
    [id],
  );
  const result = await exec(`DELETE FROM learning_courses WHERE id = ?`, [id]);
  log.info('cms.course.deleted', {
    courseId: id,
    actor: actor.email,
    rowsDeleted: result.rowCount,
    ...doomed[0],
  });
}

export async function createModule(courseId: number, title: string): Promise<{ id: number }> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  const maxRows = await sql<QueryResultRow[]>(
    `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_modules WHERE course_id = ?`,
    [courseId],
  );
  const nextOrder = Number(maxRows[0]?.next ?? 0);
  const result = await exec(
    `INSERT INTO learning_modules (course_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
    [courseId, title, nextOrder],
  );
  return { id: result.insertId };
}

export async function updateModule(
  id: number,
  fields: { title: string; resource_label: string | null; resource_url: string | null },
): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  await exec(
    `UPDATE learning_modules SET title = ?, resource_label = ?, resource_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.resource_label || null, fields.resource_url || null, id],
  );
}

export async function deleteModule(id: number): Promise<void> {
  const actor = await requireLearningHubAdmin();
  await ensureLearningHubReady();
  /* Deleting a module cascades to its lessons and the learner progress recorded against
     them. Count first: after the DELETE there is nothing left to count. */
  const doomed = await sql<QueryResultRow[]>(
    `SELECT (SELECT COUNT(*)::int FROM learning_lessons WHERE module_id = $1) AS lessons,
                (SELECT COUNT(*)::int FROM learning_lesson_progress p
                   JOIN learning_lessons l ON l.id = p.lesson_id
                  WHERE l.module_id = $1) AS progress_rows`,
    [id],
  );
  const result = await exec(`DELETE FROM learning_modules WHERE id = ?`, [id]);
  log.info('cms.module.deleted', {
    moduleId: id,
    actor: actor.email,
    rowsDeleted: result.rowCount,
    ...doomed[0],
  });
}

export async function createLesson(
  moduleId: number,
  title: string,
  body: string,
  durationMinutes: number | null,
  videoUrl?: string | null,
): Promise<{ id: number }> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  const safeVideoUrl = sanitiseVideoUrl(videoUrl);
  const maxRows = await sql<QueryResultRow[]>(
    `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_lessons WHERE module_id = ?`,
    [moduleId],
  );
  const nextOrder = Number(maxRows[0]?.next ?? 0);
  const result = await exec(
    `INSERT INTO learning_lessons (module_id, title, body, video_url, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [moduleId, title, body, safeVideoUrl, durationMinutes, nextOrder],
  );
  return { id: result.insertId };
}

export async function updateLesson(
  id: number,
  fields: {
    title: string;
    body: string;
    video_url: string | null;
    duration_minutes: number | null;
  },
): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  const safeVideoUrl = sanitiseVideoUrl(fields.video_url);
  await exec(
    `UPDATE learning_lessons SET title = ?, body = ?, video_url = ?, duration_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.body, safeVideoUrl, fields.duration_minutes, id],
  );
}

export async function deleteLesson(id: number): Promise<void> {
  const actor = await requireLearningHubAdmin();
  await ensureLearningHubReady();
  /* Cascades to the learner progress recorded against this lesson. Count first: after the
     DELETE there is nothing left to count. */
  const doomed = await sql<QueryResultRow[]>(
    `SELECT (SELECT COUNT(*)::int FROM learning_lesson_progress WHERE lesson_id = $1) AS progress_rows`,
    [id],
  );
  const result = await exec(`DELETE FROM learning_lessons WHERE id = ?`, [id]);
  log.info('cms.lesson.deleted', {
    lessonId: id,
    actor: actor.email,
    rowsDeleted: result.rowCount,
    ...doomed[0],
  });
}

type ReorderTable = 'learning_courses' | 'learning_modules' | 'learning_lessons';
const PARENT_COLUMN: Record<ReorderTable, string> = {
  learning_courses: 'track_id',
  learning_modules: 'course_id',
  learning_lessons: 'module_id',
};

// A reorder is read-then-swap: the two UPDATEs must land together or not at all, or the pair ends up
// sharing one order_index and the list silently reorders itself. The SELECT takes FOR UPDATE so two
// admins reordering the same parent queue up instead of both swapping against the same stale read.
// Callers are the move* actions below, which run requireLearningHubAdmin() before getting here.
async function moveOrderIndex(
  table: ReorderTable,
  parentId: number,
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  const parentColumn = PARENT_COLUMN[table];
  await withTransaction(learningHubPool, async (client) => {
    const rows = await sqlOn<QueryResultRow[]>(
      client,
      `SELECT id, order_index FROM ${table} WHERE ${parentColumn} = ? ORDER BY order_index ASC, id ASC FOR UPDATE`,
      [parentId],
    );
    const swap = planOrderSwap(rows, id, direction);
    if (!swap) return;
    await execOn(client, `UPDATE ${table} SET order_index = ? WHERE id = ?`, [
      swap.moved.order_index,
      swap.moved.id,
    ]);
    await execOn(client, `UPDATE ${table} SET order_index = ? WHERE id = ?`, [
      swap.displaced.order_index,
      swap.displaced.id,
    ]);
  });
}

export async function moveCourse(
  trackId: number,
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  await moveOrderIndex('learning_courses', trackId, id, direction);
}
export async function moveModule(
  courseId: number,
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  await moveOrderIndex('learning_modules', courseId, id, direction);
}
export async function moveLesson(
  moduleId: number,
  id: number,
  direction: 'up' | 'down',
): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  await moveOrderIndex('learning_lessons', moduleId, id, direction);
}

/* ── Knowledge checks (one optional quiz per module) ─────────────────────
   Feedback-only: no gating on progress. The learner-facing fetch withholds
   is_correct until submitQuizAttempt() grades the attempt server-side, so
   the answer key never ships to the client before the quiz is submitted. ── */

// Answer key. Admin-only: degrade to null rather than throwing, the editor
// treats null as "no quiz yet".
export async function getModuleQuizForAdmin(
  moduleId: number,
): Promise<ModuleQuizWithAnswers | null> {
  const actor = await getLearningHubActor();
  if (!actor?.isAdmin) return null;
  await ensureLearningHubReady();
  const raw = await loadModuleQuizRaw(moduleId);
  if (!raw) return null;
  return {
    id: Number(raw.quiz.id),
    module_id: moduleId,
    title: String(raw.quiz.title),
    questions: raw.questions.map((q) => ({
      id: Number(q.id),
      question_text: String(q.question_text),
      order_index: Number(q.order_index),
      options: (raw.optionsByQuestion.get(Number(q.id)) ?? []).map((o) => ({
        id: Number(o.id),
        option_text: String(o.option_text),
        order_index: Number(o.order_index),
        is_correct: Boolean(o.is_correct),
      })),
    })),
  };
}

export async function saveModuleQuiz(
  moduleId: number,
  title: string,
  questions: { question_text: string; options: { option_text: string; is_correct: boolean }[] }[],
): Promise<void> {
  // Guard first, transaction second: a denied caller never opens one.
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  // Saving a quiz deletes the old questions before writing the new ones, so a failure part-way
  // through used to leave the module with a half-saved quiz (or none at all, with the title row
  // still claiming there is one). All of it now commits together or not at all.
  await withTransaction(learningHubPool, async (client) => {
    const existing = await sqlOn<QueryResultRow[]>(
      client,
      `SELECT id FROM learning_quizzes WHERE module_id = ?`,
      [moduleId],
    );
    let quizId: number;
    if (existing[0]) {
      quizId = Number(existing[0].id);
      await execOn(
        client,
        `UPDATE learning_quizzes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [title, quizId],
      );
      await execOn(client, `DELETE FROM learning_quiz_questions WHERE quiz_id = ?`, [quizId]);
    } else {
      const result = await execOn(
        client,
        `INSERT INTO learning_quizzes (module_id, title) VALUES (?, ?) RETURNING id`,
        [moduleId, title],
      );
      quizId = result.insertId;
    }

    // Sequential, not Promise.all: every statement shares the one transaction client, where
    // concurrent calls would only queue behind each other anyway.
    for (const [qIdx, q] of questions.entries()) {
      const qResult = await execOn(
        client,
        `INSERT INTO learning_quiz_questions (quiz_id, question_text, order_index) VALUES (?, ?, ?) RETURNING id`,
        [quizId, q.question_text, qIdx],
      );
      for (const [oIdx, o] of q.options.entries()) {
        await execOn(
          client,
          `INSERT INTO learning_quiz_options (question_id, option_text, is_correct, order_index) VALUES (?, ?, ?, ?) RETURNING id`,
          [qResult.insertId, o.option_text, o.is_correct, oIdx],
        );
      }
    }
  });
}

export async function deleteModuleQuiz(moduleId: number): Promise<void> {
  await requireLearningHubAdmin();
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_quizzes WHERE module_id = ?`, [moduleId]);
}

const EMPTY_ATTEMPT: QuizAttemptResult = { total: 0, correctCount: 0, scorePct: 0, results: [] };

export async function submitQuizAttempt(
  quizId: number,
  answers: QuizAnswerInput[],
): Promise<QuizAttemptResult> {
  // Grading reveals the answer key, so an actor is required even though module
  // knowledge checks are feedback-only.
  const actor = await getLearningHubActor();
  if (!actor) return EMPTY_ATTEMPT;
  await ensureLearningHubReady();
  /*
   * `module_id IS NOT NULL` is the security control, not a tidy-up.
   *
   * One table holds both kinds of quiz: a module knowledge check (module_id) and a lesson gating
   * quiz (lesson_id). This action ships the answer key with every attempt, which is correct for a
   * knowledge check — it gates nothing — and catastrophic for a gating quiz. `submitLessonQuiz`
   * withholds the key until the learner passes, but that only closes the front door: the lesson
   * payload hands the client `LessonQuiz.id`, this is a public POST endpoint guarded only by "is
   * signed in", and it took any quizId at all. Submit a blank attempt here with a gating quiz's
   * id, read the key out of the response, then pass the real quiz.
   *
   * Filtering to module quizzes means a gating quiz id now matches no rows and grades as an empty
   * attempt, so the key never leaves the server by this route.
   */
  const correctRows = await sql<QueryResultRow[]>(
    `SELECT o.question_id, o.id AS option_id
     FROM learning_quiz_options o
     JOIN learning_quiz_questions q ON q.id = o.question_id
     JOIN learning_quizzes z ON z.id = q.quiz_id
     WHERE q.quiz_id = ? AND z.module_id IS NOT NULL AND o.is_correct = true`,
    [quizId],
  );
  const correctByQuestion = new Map<number, number>();
  for (const r of correctRows) correctByQuestion.set(Number(r.question_id), Number(r.option_id));

  /* Same grader as the gating quiz, minus the redaction: a module check gates nothing, so the
     key ships with every attempt. */
  return gradeQuizAttempt(correctByQuestion, answers);
}
