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
  learnerStage,
  planOrderSwap,
  progressPct,
} from '@/lib/learning-hub-logic';
import { requireSchema } from '@/lib/db/schema-version';
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
  LhLessonAnalytics,
  LhQuizAnalytics,
  LhLearnerRow,
  LhTrackAnalytics,
  LhWeekPoint,
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
    viewers: 0,
    learners: 0,
    lessonCompletions: 0,
    courseCompletions: 0,
    trackCount: 0,
    courseCount: 0,
    lessonCount: 0,
    quizCount: 0,
    quizTakers: 0,
    quizPassRate: null,
  },
  viewTracking: false,
  weekly: [],
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

/* Lesson views arrived in their own migration, after the hub had been live for a month. The
   analytics read joins that table, so it has to know whether the table is there - a deploy whose
   migration has not landed yet would otherwise fail the whole screen over one optional table. */
const LESSON_VIEWS_MIGRATION = '002_lesson_views';

async function hasViewTracking(): Promise<boolean> {
  try {
    await requireSchema(learningHubPool, 'learning-hub', LESSON_VIEWS_MIGRATION);
    return true;
  } catch {
    return false;
  }
}

/* A relation with the right column names and no rows, substituted for the views table when the
   migration has not run. Every query below then returns the same shape with zeroes in the view
   columns, instead of needing a second copy of itself without the join. */
const NO_VIEWS = `(SELECT ''::text AS user_email, 0 AS lesson_id,
                          NOW() AS first_viewed_at, NOW() AS last_viewed_at WHERE false)`;

const num = (v: unknown): number => Number(v ?? 0);
/** Postgres AVG over no rows is NULL, which is the honest answer and must survive to the screen. */
const avg = (v: unknown): number | null => (v == null ? null : Number(v));

export async function getLearningHubAnalytics(): Promise<LearningHubAnalytics> {
  try {
    const actor = await getLearningHubActor();
    if (!actor?.isAdmin) return EMPTY_ANALYTICS;
    await ensureLearningHubReady();

    const viewTracking = await hasViewTracking();
    const VIEWS = viewTracking ? 'learning_lesson_views' : NO_VIEWS;

    // All of these are independent, so they go out together: the admin page used to pay one
    // serial round trip per read before it could render anything.
    const [
      trackRows,
      courseRows,
      overallRows,
      trackLearnerRows,
      lessonRows,
      quizRows,
      userCourseRows,
      userQuizRows,
      weeklyRows,
      redBull,
    ] = await Promise.all([
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
        `SELECT (SELECT COUNT(DISTINCT user_email) FROM learning_lesson_progress)::int AS learners,
                (SELECT COUNT(*) FROM learning_lesson_progress)::int AS completions,
                (SELECT COUNT(DISTINCT user_email) FROM ${VIEWS} v)::int AS viewers,
                (SELECT COUNT(*) FROM learning_quizzes)::int AS quiz_count,
                (SELECT COUNT(DISTINCT user_email) FROM learning_quiz_results)::int AS quiz_takers,
                (SELECT COUNT(*) FROM learning_quiz_results)::int AS quiz_results,
                (SELECT COUNT(*) FROM learning_quiz_results WHERE passed)::int AS quiz_passes`,
      ),
      sql<QueryResultRow[]>(
        `SELECT c.track_id, COUNT(DISTINCT p.user_email)::int AS learners
         FROM learning_courses c
         JOIN learning_modules m ON m.course_id = c.id
         JOIN learning_lessons l ON l.module_id = m.id
         JOIN learning_lesson_progress p ON p.lesson_id = l.id
         GROUP BY c.track_id`,
      ),
      /* Per-lesson funnel. The two LEFT JOINs multiply rows against each other, which is why both
         counts are COUNT(DISTINCT ...) - a plain COUNT would report viewers times completers. */
      sql<QueryResultRow[]>(
        `SELECT l.id, l.title, m.id AS module_id, m.title AS module_title, m.course_id,
                (l.video_url IS NOT NULL AND l.video_url <> '') AS has_video,
                COUNT(DISTINCT v.user_email)::int AS viewers,
                COUNT(DISTINCT p.user_email)::int AS completions
         FROM learning_lessons l
         JOIN learning_modules m ON m.id = l.module_id
         LEFT JOIN ${VIEWS} v ON v.lesson_id = l.id
         LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id
         GROUP BY l.id, l.title, l.video_url, l.order_index, m.id, m.title, m.course_id, m.order_index
         ORDER BY m.course_id, m.order_index, l.order_index`,
      ),
      /* Per-quiz performance. A quiz hangs off EITHER a module or a lesson, so the course it
         belongs to has to be reached down both paths and coalesced. */
      sql<QueryResultRow[]>(
        `SELECT q.id, q.title, q.module_id, q.lesson_id,
                COALESCE(m.course_id, lm.course_id) AS course_id,
                (SELECT COUNT(*) FROM learning_quiz_questions qq WHERE qq.quiz_id = q.id)::int AS question_count,
                COUNT(r.user_email)::int AS takers,
                COUNT(r.user_email) FILTER (WHERE r.passed)::int AS passers,
                ROUND(AVG(r.best_pct))::int AS avg_best_pct,
                ROUND(AVG(r.attempts), 1)::float8 AS avg_attempts
         FROM learning_quizzes q
         LEFT JOIN learning_modules m ON m.id = q.module_id
         LEFT JOIN learning_lessons ql ON ql.id = q.lesson_id
         LEFT JOIN learning_modules lm ON lm.id = ql.module_id
         LEFT JOIN learning_quiz_results r ON r.quiz_id = q.id
         GROUP BY q.id, q.title, q.module_id, q.lesson_id, m.course_id, lm.course_id
         ORDER BY q.id`,
      ),
      /* One row per person per course: what they opened, what they finished, when they were last
         here. Views and completions are unioned rather than joined so a lesson somebody opened but
         never finished still counts on the view side. */
      sql<QueryResultRow[]>(
        `WITH cl AS (
           SELECT c.id AS course_id, c.track_id, l.id AS lesson_id
           FROM learning_courses c
           JOIN learning_modules m ON m.course_id = c.id
           JOIN learning_lessons l ON l.module_id = m.id
         ),
         acts AS (
           SELECT user_email, lesson_id, 'view' AS kind, last_viewed_at AS ts FROM ${VIEWS} v
           UNION ALL
           SELECT user_email, lesson_id, 'done', completed_at FROM learning_lesson_progress
         )
         SELECT cl.track_id, cl.course_id, a.user_email,
                COUNT(DISTINCT a.lesson_id) FILTER (WHERE a.kind = 'view')::int AS viewed,
                COUNT(DISTINCT a.lesson_id) FILTER (WHERE a.kind = 'done')::int AS done,
                MAX(a.ts) AS last_at
         FROM cl
         JOIN acts a ON a.lesson_id = cl.lesson_id
         GROUP BY cl.track_id, cl.course_id, a.user_email`,
      ),
      sql<QueryResultRow[]>(
        `SELECT c.track_id, r.user_email,
                COUNT(*)::int AS taken,
                COUNT(*) FILTER (WHERE r.passed)::int AS passed,
                ROUND(AVG(r.best_pct))::int AS avg_pct
         FROM learning_quiz_results r
         JOIN learning_quizzes q ON q.id = r.quiz_id
         LEFT JOIN learning_modules m ON m.id = q.module_id
         LEFT JOIN learning_lessons ql ON ql.id = q.lesson_id
         LEFT JOIN learning_modules lm ON lm.id = ql.module_id
         JOIN learning_courses c ON c.id = COALESCE(m.course_id, lm.course_id)
         GROUP BY c.track_id, r.user_email`,
      ),
      /* Twelve weeks of activity. `first_viewed_at`, not `last_viewed_at`: the question the strip
         answers is when people started lessons, and re-opening an old one is not a new start. */
      sql<QueryResultRow[]>(
        `SELECT to_char(date_trunc('week', ts), 'YYYY-MM-DD') AS week,
                COUNT(*) FILTER (WHERE kind = 'started')::int AS started,
                COUNT(*) FILTER (WHERE kind = 'completed')::int AS completed
         FROM (
           SELECT first_viewed_at AS ts, 'started' AS kind FROM ${VIEWS} v
           UNION ALL
           SELECT completed_at, 'completed' FROM learning_lesson_progress
         ) x
         WHERE ts >= date_trunc('week', NOW()) - INTERVAL '11 weeks'
         GROUP BY 1
         ORDER BY 1`,
      ),
      getRedBullGameStats(),
    ]);

    /* -- index the per-row reads by the key each assembly step needs -- */

    const lessonsByCourse = new Map<number, QueryResultRow[]>();
    for (const r of lessonRows) {
      const k = num(r.course_id);
      const list = lessonsByCourse.get(k);
      if (list) list.push(r);
      else lessonsByCourse.set(k, [r]);
    }

    const quizzesByCourse = new Map<number, QueryResultRow[]>();
    const quizByLesson = new Map<number, QueryResultRow>();
    for (const r of quizRows) {
      const k = num(r.course_id);
      const list = quizzesByCourse.get(k);
      if (list) list.push(r);
      else quizzesByCourse.set(k, [r]);
      if (r.lesson_id != null) quizByLesson.set(num(r.lesson_id), r);
    }

    const userCourseByCourse = new Map<number, QueryResultRow[]>();
    const userCourseByTrack = new Map<number, QueryResultRow[]>();
    for (const r of userCourseRows) {
      const c = num(r.course_id);
      const t = num(r.track_id);
      const cl = userCourseByCourse.get(c);
      if (cl) cl.push(r);
      else userCourseByCourse.set(c, [r]);
      const tl = userCourseByTrack.get(t);
      if (tl) tl.push(r);
      else userCourseByTrack.set(t, [r]);
    }

    const tracks: LhTrackAnalytics[] = trackRows.map((t) => {
      const trackId = num(t.id);

      const courses: LhCourseAnalytics[] = courseRows
        .filter((c) => num(c.track_id) === trackId)
        .map((c) => {
          const courseId = num(c.course_id);
          const learners = num(c.learners);
          const completedLearners = num(c.completed_learners);
          const courseUsers = userCourseByCourse.get(courseId) ?? [];

          const lessons: LhLessonAnalytics[] = (lessonsByCourse.get(courseId) ?? []).map((l) => {
            const lq = quizByLesson.get(num(l.id));
            return {
              id: num(l.id),
              title: String(l.title),
              moduleTitle: String(l.module_title),
              hasVideo: Boolean(l.has_video),
              viewers: num(l.viewers),
              completions: num(l.completions),
              quizTakers: lq ? num(lq.takers) : 0,
              quizPassers: lq ? num(lq.passers) : 0,
              avgBestPct: lq ? avg(lq.avg_best_pct) : null,
            };
          });

          const quizzes: LhQuizAnalytics[] = (quizzesByCourse.get(courseId) ?? []).map((q) => ({
            id: num(q.id),
            title: String(q.title),
            scope: q.lesson_id != null ? 'lesson' : 'module',
            questionCount: num(q.question_count),
            takers: num(q.takers),
            passers: num(q.passers),
            avgBestPct: avg(q.avg_best_pct),
            avgAttempts: avg(q.avg_attempts),
          }));

          /* A course's quiz score is the mean of its results, not the mean of its quizzes' means:
             a quiz one person sat would otherwise weigh as heavily as one thirty people sat. */
          const scored = quizzes.filter((q) => q.avgBestPct != null);
          const scoredTakers = scored.reduce((n, q) => n + q.takers, 0);
          const scoreSum = scored.reduce((n, q) => n + (q.avgBestPct ?? 0) * q.takers, 0);

          return {
            id: courseId,
            title: String(c.title),
            status: String(c.status),
            lessonCount: num(c.lesson_count),
            viewers: courseUsers.filter((r) => num(r.viewed) > 0).length,
            learners,
            completedLearners,
            lessonCompletions: num(c.lesson_completions),
            completionPct: progressPct(completedLearners, learners),
            quizCount: quizzes.length,
            quizTakers: quizzes.reduce((n, q) => n + q.takers, 0),
            quizPassers: quizzes.reduce((n, q) => n + q.passers, 0),
            avgBestPct: scoredTakers > 0 ? Math.round(scoreSum / scoredTakers) : null,
            lessons,
            quizzes,
          };
        });

      const lessonCount = courses.reduce((n, c) => n + c.lessonCount, 0);

      /* -- the journey: one row per person who has touched this module -- */
      const quizByUser = new Map(
        userQuizRows
          .filter((r) => num(r.track_id) === trackId)
          .map((r) => [String(r.user_email), r] as const),
      );
      const byUser = new Map<string, QueryResultRow[]>();
      for (const r of userCourseByTrack.get(trackId) ?? []) {
        const email = String(r.user_email);
        const list = byUser.get(email);
        if (list) list.push(r);
        else byUser.set(email, [r]);
      }
      // Somebody with quiz results but no lesson row still belongs in the table.
      for (const email of quizByUser.keys()) if (!byUser.has(email)) byUser.set(email, []);

      const learnerRows: LhLearnerRow[] = [...byUser.entries()]
        .map(([email, rows]) => {
          const doneByCourse = new Map(rows.map((r) => [num(r.course_id), num(r.done)]));
          const viewed = rows.reduce((n, r) => n + num(r.viewed), 0);
          const completed = rows.reduce((n, r) => n + num(r.done), 0);
          const q = quizByUser.get(email);
          const last = rows
            .map((r) => (r.last_at ? new Date(r.last_at as string).getTime() : 0))
            .reduce((a, b) => Math.max(a, b), 0);
          return {
            email,
            stage: learnerStage(viewed, completed, lessonCount),
            lessonsViewed: viewed,
            lessonsCompleted: completed,
            lessonCount,
            quizzesTaken: q ? num(q.taken) : 0,
            quizzesPassed: q ? num(q.passed) : 0,
            avgBestPct: q ? avg(q.avg_pct) : null,
            lastActiveAt: last > 0 ? new Date(last).toISOString() : null,
            courses: courses.map((c) => ({
              id: c.id,
              title: c.title,
              done: doneByCourse.get(c.id) ?? 0,
              total: c.lessonCount,
            })),
          };
        })
        // Furthest along first; the people to chase are then the tail of the table.
        .sort((a, b) => b.lessonsCompleted - a.lessonsCompleted || a.email.localeCompare(b.email));

      const scoredCourses = courses.filter((c) => c.avgBestPct != null);
      const scoredTakers = scoredCourses.reduce((n, c) => n + c.quizTakers, 0);
      const trackScoreSum = scoredCourses.reduce((n, c) => n + (c.avgBestPct ?? 0) * c.quizTakers, 0);

      return {
        key: String(t.key),
        name: String(t.name),
        color: (t.color as string) ?? null,
        viewers: new Set(
          (userCourseByTrack.get(trackId) ?? [])
            .filter((r) => num(r.viewed) > 0)
            .map((r) => String(r.user_email)),
        ).size,
        learners: num(trackLearnerRows.find((r) => num(r.track_id) === trackId)?.learners),
        lessonCount,
        lessonCompletions: courses.reduce((n, c) => n + c.lessonCompletions, 0),
        completedLearners: courses.reduce((n, c) => n + c.completedLearners, 0),
        quizTakers: courses.reduce((n, c) => n + c.quizTakers, 0),
        quizPassers: courses.reduce((n, c) => n + c.quizPassers, 0),
        avgBestPct: scoredTakers > 0 ? Math.round(trackScoreSum / scoredTakers) : null,
        courses,
        learnerRows,
      };
    });

    const o = overallRows[0] ?? {};
    const quizResults = num(o.quiz_results);

    return {
      overview: {
        viewers: num(o.viewers),
        learners: num(o.learners),
        lessonCompletions: num(o.completions),
        courseCompletions: tracks.reduce((n, t) => n + t.completedLearners, 0),
        trackCount: tracks.length,
        courseCount: courseRows.length,
        lessonCount: courseRows.reduce((n, c) => n + num(c.lesson_count), 0),
        quizCount: num(o.quiz_count),
        quizTakers: num(o.quiz_takers),
        quizPassRate: quizResults > 0 ? Math.round((num(o.quiz_passes) / quizResults) * 100) : null,
      },
      viewTracking,
      weekly: weeklyRows.map(
        (w): LhWeekPoint => ({
          week: String(w.week),
          started: num(w.started),
          completed: num(w.completed),
        }),
      ),
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

/**
 * Note that this learner has opened this lesson.
 *
 * Deliberately not markLessonComplete's job: completion is something the learner asserts, by
 * ticking the box or passing the quiz, and a view is something that just happened. Conflating them
 * would mean opening a lesson marked it done.
 *
 * Nothing here can fail the lesson page. A missing migration or a dead connection costs one
 * analytics row, which is not worth a blank lesson, so the error is swallowed - but logged, so a
 * permanently broken recorder is still visible.
 */
export async function recordLessonView(lessonId: number): Promise<{ success: boolean }> {
  try {
    const actor = await getLearningHubActor();
    if (!actor) return { success: false };
    await ensureLearningHubReady();
    await requireSchema(learningHubPool, 'learning-hub', LESSON_VIEWS_MIGRATION);
    await exec(
      `INSERT INTO learning_lesson_views (user_email, lesson_id) VALUES (?, ?)
       ON CONFLICT (user_email, lesson_id) DO UPDATE SET
         last_viewed_at = NOW(),
         view_count = learning_lesson_views.view_count + 1`,
      [actor.email, lessonId],
    );
    return { success: true };
  } catch (err) {
    log.error('lesson.view.record.failed', err);
    return { success: false };
  }
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
