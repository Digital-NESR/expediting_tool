/**
 * Learning Hub data layer.
 *
 * Deliberately NOT a `'use server'` module: everything exported from an actions
 * file is a public POST endpoint. The readers below are only ever called from
 * server pages, so they live here as plain functions and stop being reachable
 * by any signed-in employee with a crafted request.
 *
 * Identity is taken from the session (`currentActor()`), never from a caller
 * argument, and always through `normalizeEmail()` so one person is one row in
 * `learning_lesson_progress` / `learning_quiz_results` regardless of the casing
 * Azure AD hands back.
 */

import type { PoolClient, QueryResultRow } from 'pg';
import { createHash } from 'crypto';
import learningHubPool from '@/lib/db-learning-hub';
import { withTransaction, lockForTransaction } from '@/lib/db/tx';
import { currentActor, normalizeEmail } from '@/lib/require-access';
import { SEED_TRACKS, type SeedTrack } from '@/lib/learning-hub-seed-content';
import type {
  LearningTrack,
  LearningCourse,
  LearningModule,
  LearningLesson,
  LearningHubNavTrack,
  TrackWithProgress,
  LearningHubDashboardData,
  CourseWithProgress,
  TrackDetailData,
  ModuleOutline,
  CourseDetailData,
  LessonDetailData,
  MyWorkCourse,
  MyWorkData,
  ModuleQuiz,
  ModuleQuizPageData,
  LessonQuiz,
} from '@/types/learning-hub';

/* ── Query helpers (house pattern: ? -> $n, sql() for SELECT, exec() for writes) ── */

export type QueryParams = (string | number | boolean | null | undefined | string[] | number[])[];

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}
function normaliseParams(params: QueryParams): QueryParams {
  return params.map((value) => (value === undefined ? null : value));
}
function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
export async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await learningHubPool.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}
export async function exec(statement: string, params: QueryParams = []): Promise<{ rowCount: number; insertId: number }> {
  const result = await learningHubPool.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return { rowCount: result.rowCount ?? 0, insertId: Number.isFinite(insertId) ? insertId : 0 };
}

/* Transaction-bound twins of sql()/exec(). A multi-statement write must run every
   statement on the client withTransaction() supplied: anything going through the
   pool helpers above lands on a different connection, outside the transaction, and
   will not roll back with it. */
export async function sqlOn<T extends QueryResultRow[]>(
  client: PoolClient,
  statement: string,
  params: QueryParams = [],
): Promise<T> {
  const result = await client.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}
export async function execOn(
  client: PoolClient,
  statement: string,
  params: QueryParams = [],
): Promise<{ rowCount: number; insertId: number }> {
  const result = await client.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return { rowCount: result.rowCount ?? 0, insertId: Number.isFinite(insertId) ? insertId : 0 };
}

/* ── Learner identity (never taken from the caller) ──────────────────────── */

interface LearnerIdentity { email: string; isAdmin: boolean }

async function learnerIdentity(): Promise<LearnerIdentity | null> {
  const actor = await currentActor();
  if (!actor) return null;
  return { email: normalizeEmail(actor.email), isAdmin: actor.isPlatformAdmin };
}

// Draft courses are admin-only. Appended to a DETAIL query's WHERE clause so a
// guessed id cannot expose unpublished content (the LIST queries already filter).
function publishedFilter(isAdmin: boolean): string {
  return isAdmin ? '' : ` AND status = 'published'`;
}

/* ── Schema (created in code, idempotent) + one-time default content seed ── */

let readyPromise: Promise<void> | null = null;

async function ensureLearningHubSchema(): Promise<void> {
  async function execSchema(statement: string) {
    try {
      await exec(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710' && code !== '42701') throw err;
    }
  }

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_tracks (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    color TEXT,
    order_index INT NOT NULL DEFAULT 0,
    seed_version TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`ALTER TABLE learning_tracks ADD COLUMN IF NOT EXISTS seed_version TEXT`);
  // Browser-tab label rule as DATA instead of a track-key literal in the query layer: a track with a
  // prefix set shows the compact "<prefix> lvl N" form in the tight tab space (see getCourseTabTitle).
  await execSchema(`ALTER TABLE learning_tracks ADD COLUMN IF NOT EXISTS tab_label_prefix TEXT`);
  // One-time, idempotent backfill of the single track that already had this behaviour hard-coded, so
  // the column starts out matching what production renders today. New tracks opt in by setting it.
  await execSchema(`UPDATE learning_tracks SET tab_label_prefix = 'SC' WHERE key = 'supply_chain' AND tab_label_prefix IS NULL`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_courses (
    id SERIAL PRIMARY KEY,
    track_id INT NOT NULL REFERENCES learning_tracks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    order_index INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_courses_track ON learning_courses(track_id)`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_modules (
    id SERIAL PRIMARY KEY,
    course_id INT NOT NULL REFERENCES learning_courses(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    resource_label TEXT,
    resource_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS resource_label TEXT`);
  await execSchema(`ALTER TABLE learning_modules ADD COLUMN IF NOT EXISTS resource_url TEXT`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_modules_course ON learning_modules(course_id)`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_lessons (
    id SERIAL PRIMARY KEY,
    module_id INT NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    video_url TEXT,
    duration_minutes INT,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`ALTER TABLE learning_lessons ADD COLUMN IF NOT EXISTS video_url TEXT`);
  // No fabricated default: a lesson only shows a duration if someone actually set one.
  await execSchema(`ALTER TABLE learning_lessons ALTER COLUMN duration_minutes DROP NOT NULL`);
  await execSchema(`ALTER TABLE learning_lessons ALTER COLUMN duration_minutes DROP DEFAULT`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_lessons_module ON learning_lessons(module_id)`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_lesson_progress (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    lesson_id INT NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, lesson_id)
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_lesson_progress(user_email)`);

  // Knowledge checks: one optional quiz per module, feedback-only (not a completion gate).
  await execSchema(`CREATE TABLE IF NOT EXISTS learning_quizzes (
    id SERIAL PRIMARY KEY,
    module_id INT NOT NULL UNIQUE REFERENCES learning_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'Knowledge check',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_quiz_questions (
    id SERIAL PRIMARY KEY,
    quiz_id INT NOT NULL REFERENCES learning_quizzes(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_quiz_questions_quiz ON learning_quiz_questions(quiz_id)`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_quiz_options (
    id SERIAL PRIMARY KEY,
    question_id INT NOT NULL REFERENCES learning_quiz_questions(id) ON DELETE CASCADE,
    option_text TEXT NOT NULL,
    is_correct BOOLEAN NOT NULL DEFAULT false,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_quiz_options_question ON learning_quiz_options(question_id)`);

  // Lesson-level quizzes (attach a quiz to a lesson/video) + per-user pass tracking for gating.
  await execSchema(`ALTER TABLE learning_quizzes ALTER COLUMN module_id DROP NOT NULL`);
  await execSchema(`ALTER TABLE learning_quizzes ADD COLUMN IF NOT EXISTS lesson_id INT REFERENCES learning_lessons(id) ON DELETE CASCADE`);
  await execSchema(`ALTER TABLE learning_quizzes ADD COLUMN IF NOT EXISTS pass_pct INT NOT NULL DEFAULT 70`);
  await execSchema(`CREATE UNIQUE INDEX IF NOT EXISTS idx_learning_quizzes_lesson ON learning_quizzes(lesson_id) WHERE lesson_id IS NOT NULL`);
  await execSchema(`CREATE TABLE IF NOT EXISTS learning_quiz_results (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    quiz_id INT NOT NULL REFERENCES learning_quizzes(id) ON DELETE CASCADE,
    best_pct INT NOT NULL DEFAULT 0,
    passed BOOLEAN NOT NULL DEFAULT false,
    attempts INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, quiz_id)
  )`);

  // Access requests: request -> admin approves (mirrors the other tools). One row per user.
  await execSchema(`CREATE TABLE IF NOT EXISTS access_requests (
    user_email TEXT PRIMARY KEY,
    display_name TEXT,
    job_title TEXT,
    department TEXT,
    status TEXT NOT NULL DEFAULT 'Pending',
    requested_countries TEXT[] DEFAULT '{}',
    approved_countries TEXT[] DEFAULT '{}',
    requested_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ,
    reviewed_by TEXT,
    notes TEXT
  )`);
}

// Inserts a track's courses/modules/lessons one multi-row INSERT per level: three round trips for the
// whole track instead of one per row. The previous breadth-first Promise.all fanned the inserts across
// pool connections to stay inside the serverless execution timeout; every statement now shares the one
// transaction client, where parallel calls would just queue, so batching is what keeps it fast (and the
// transaction short). Each level is matched back to its parent through order_index — which is unique
// within a parent here — rather than through the row order of RETURNING, which is not guaranteed.
// Shared by the one-time empty-DB seed and the admin "reset track to defaults" action.
async function insertTrackCourses(client: PoolClient, trackId: number, track: SeedTrack): Promise<void> {
  if (track.courses.length === 0) return;

  const courseParams: QueryParams = [];
  const courseRowsSql = track.courses.map((course, courseIdx) => {
    courseParams.push(trackId, course.title, course.description, courseIdx, course.status);
    return `(?, ?, ?, ?, ?)`;
  });
  const insertedCourses = await sqlOn<QueryResultRow[]>(
    client,
    `INSERT INTO learning_courses (track_id, title, description, order_index, status)
     VALUES ${courseRowsSql.join(', ')} RETURNING id, order_index`,
    courseParams,
  );
  const courseIdByOrder = new Map(insertedCourses.map((r) => [Number(r.order_index), Number(r.id)]));

  const moduleParams: QueryParams = [];
  const moduleRowsSql: string[] = [];
  track.courses.forEach((course, courseIdx) => {
    const courseId = courseIdByOrder.get(courseIdx)!;
    course.modules.forEach((mod, moduleIdx) => {
      moduleParams.push(courseId, mod.title, moduleIdx, mod.resourceLabel ?? null, mod.resourceUrl ?? null);
      moduleRowsSql.push(`(?, ?, ?, ?, ?)`);
    });
  });
  if (moduleRowsSql.length === 0) return;
  const insertedModules = await sqlOn<QueryResultRow[]>(
    client,
    `INSERT INTO learning_modules (course_id, title, order_index, resource_label, resource_url)
     VALUES ${moduleRowsSql.join(', ')} RETURNING id, course_id, order_index`,
    moduleParams,
  );
  const moduleIdByCourseAndOrder = new Map(
    insertedModules.map((r) => [`${Number(r.course_id)}:${Number(r.order_index)}`, Number(r.id)]),
  );

  const lessonParams: QueryParams = [];
  const lessonRowsSql: string[] = [];
  track.courses.forEach((course, courseIdx) => {
    const courseId = courseIdByOrder.get(courseIdx)!;
    course.modules.forEach((mod, moduleIdx) => {
      const moduleId = moduleIdByCourseAndOrder.get(`${courseId}:${moduleIdx}`)!;
      mod.lessons.forEach((lesson, lessonIdx) => {
        lessonParams.push(
          moduleId,
          lesson.title,
          lesson.body,
          lesson.videoUrl ?? null,
          lesson.duration_minutes ?? null,
          lessonIdx,
        );
        lessonRowsSql.push(`(?, ?, ?, ?, ?, ?)`);
      });
    });
  });
  if (lessonRowsSql.length === 0) return;
  await execOn(
    client,
    `INSERT INTO learning_lessons (module_id, title, body, video_url, duration_minutes, order_index)
     VALUES ${lessonRowsSql.join(', ')}`,
    lessonParams,
  );
}

// A stable fingerprint of a track's code-defined content. Stored per-track as seed_version so we can
// tell whether SEED_TRACKS changed since the last sync, without diffing every field by hand.
export function hashSeedTrack(track: SeedTrack): string {
  return createHash('sha256').update(JSON.stringify(track)).digest('hex');
}

/**
 * Rebuild one track from its code-defined seed content, atomically.
 *
 * Replacing a track's content deletes its courses, which cascades all the way down to
 * `learning_lesson_progress` — so a half-finished run is not a cosmetic problem, it is a
 * track left permanently empty with every learner's progress already gone. Three things
 * make that unreachable:
 *
 *  - the whole replacement runs in ONE transaction, so a crash mid-rebuild rolls the delete
 *    back and the old content stays live;
 *  - an advisory lock on the track key serialises it, so two serverless cold starts landing
 *    on the same deploy cannot both delete-and-reinsert the same track and interleave into
 *    duplicated courses;
 *  - `seed_version` is written LAST. If anything fails the stamp is never applied, so the
 *    track still looks un-synced and the next request retries — the opposite of the old
 *    order, which stamped "done" before the content it claimed was there existed.
 *
 * `force` is the admin "reset to defaults" path: rebuild even when the stamp already matches.
 * Returns false when an up-to-date track was left alone.
 */
export async function applySeedTrack(track: SeedTrack, orderIndex: number, force = false): Promise<boolean> {
  const version = hashSeedTrack(track);

  return withTransaction(learningHubPool, async (client) => {
    await lockForTransaction(client, `learning-hub:seed-track:${track.key}`);

    // Re-read under the lock: a concurrent cold start may have finished the rebuild while we
    // were queued on it, in which case there is nothing left to do.
    const existingRows = await sqlOn<QueryResultRow[]>(
      client,
      `SELECT id, seed_version FROM learning_tracks WHERE key = ?`,
      [track.key],
    );
    const existing = existingRows[0];
    if (existing && !force && String(existing.seed_version ?? '') === version) return false;

    let trackId: number;
    if (existing) {
      trackId = Number(existing.id);
      // seed_version deliberately NOT set here — see the final UPDATE below.
      await execOn(
        client,
        `UPDATE learning_tracks SET name = ?, description = ?, icon = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [track.name, track.description, track.icon, track.color, trackId],
      );
      await execOn(client, `DELETE FROM learning_courses WHERE track_id = ?`, [trackId]);
    } else {
      const inserted = await execOn(
        client,
        `INSERT INTO learning_tracks (key, name, description, icon, color, order_index) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [track.key, track.name, track.description, track.icon, track.color, orderIndex],
      );
      trackId = inserted.insertId;
    }

    await insertTrackCourses(client, trackId, track);

    // Last statement: the stamp only exists if everything above it does.
    await execOn(client, `UPDATE learning_tracks SET seed_version = ? WHERE id = ?`, [version, trackId]);
    return true;
  });
}

// Runs on every cold start (cheap once synced, just one SELECT + hash comparison per track).
// A track whose code content hasn't changed since the last sync (seed_version matches) is left
// completely alone, so admin edits made through the CMS survive unrelated deploys. A track whose
// code content DID change (this is how a content push like the SAP video rebuild reaches production)
// gets its courses replaced with what's now in SEED_TRACKS automatically, no manual "reset" needed.
// The batch SELECT here is only a fast path that keeps the steady state to a single query; the
// authoritative comparison happens again inside applySeedTrack(), under the lock.
async function syncSeedTracks(): Promise<void> {
  const existingTracks = await sql<QueryResultRow[]>(`SELECT key, seed_version FROM learning_tracks`);
  const versionByKey = new Map(existingTracks.map((t) => [String(t.key), String(t.seed_version ?? '')]));

  for (let trackIdx = 0; trackIdx < SEED_TRACKS.length; trackIdx++) {
    const track = SEED_TRACKS[trackIdx];
    if (versionByKey.get(track.key) === hashSeedTrack(track)) continue;
    await applySeedTrack(track, trackIdx);
  }
}

export async function ensureLearningHubReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = ensureLearningHubSchema()
      .then(() => syncSeedTracks())
      .catch((err) => {
        // Don't let a failed cold-start attempt permanently wedge a warm serverless instance -
        // clear the cache so the next request gets a fresh try instead of the same cached rejection.
        readyPromise = null;
        throw err;
      });
  }
  await readyPromise;
}

/* ── Shared row shapes for aggregate queries ─────────────────────────── */

interface CountRow extends QueryResultRow {
  lesson_count: number;
  completed_count: number;
}

/* ── Lightweight title lookups (for page <title> metadata) ───────────────── */

export async function getTrackName(key: string): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT name FROM learning_tracks WHERE key = ?`, [key]);
    return (rows[0]?.name as string) ?? null;
  } catch { return null; }
}
export async function getCourseTitle(id: number): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT title FROM learning_courses WHERE id = ?`, [id]);
    return (rows[0]?.title as string) ?? null;
  } catch { return null; }
}
// Browser-tab label. A track that sets `tab_label_prefix` uses the short level form
// ("SC lvl 1") in the tight tab space, even though the card/page shows the full course
// title; every other track just shows the title. The rule lives on the track row, so no
// track key is spelled out here.
export async function getCourseTabTitle(trackKey: string, id: number): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(
      `SELECT c.title, c.order_index, t.tab_label_prefix
       FROM learning_courses c
       JOIN learning_tracks t ON t.id = c.track_id
       WHERE c.id = ? AND t.key = ?`,
      [id, trackKey],
    );
    if (!rows[0]) return null;
    const prefix = rows[0].tab_label_prefix ? String(rows[0].tab_label_prefix) : '';
    if (prefix) return `${prefix} lvl ${Number(rows[0].order_index ?? 0) + 1}`;
    return (rows[0].title as string) ?? null;
  } catch { return null; }
}
export async function getLessonTitle(id: number): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT title FROM learning_lessons WHERE id = ?`, [id]);
    return (rows[0]?.title as string) ?? null;
  } catch { return null; }
}

/* ── Sidebar navigation (one source of truth for every Learning Hub page) ── */

/**
 * The tracks the sidebar links to, loaded once in the Learning Hub layout and shared by
 * every page under it. Previously the sidebar carried a hard-coded link list, which drifted
 * from the database (it linked a track a fresh DB never creates, i.e. a 404).
 *
 * Counts are published-only and user-independent, so the caller can apply the same
 * `isComingSoon()` rule the dashboard and track pages use.
 */
export async function getLearningHubNavTracks(): Promise<LearningHubNavTrack[]> {
  const me = await learnerIdentity();
  if (!me) return [];
  await ensureLearningHubReady();

  const rows = await sql<QueryResultRow[]>(
    `SELECT t.key, t.name, t.icon,
            COUNT(DISTINCT c.id)::int AS course_count,
            COUNT(DISTINCT l.id)::int AS lesson_count
     FROM learning_tracks t
     LEFT JOIN learning_courses c ON c.track_id = t.id AND c.status = 'published'
     LEFT JOIN learning_modules m ON m.course_id = c.id
     LEFT JOIN learning_lessons l ON l.module_id = m.id
     GROUP BY t.id, t.key, t.name, t.icon, t.order_index
     ORDER BY t.order_index ASC, t.id ASC`,
  );

  return rows.map((r) => ({
    key: String(r.key),
    name: String(r.name),
    icon: r.icon ? String(r.icon) : null,
    course_count: Number(r.course_count ?? 0),
    lesson_count: Number(r.lesson_count ?? 0),
  }));
}

/* ── Dashboard ────────────────────────────────────────────────────────── */

const EMPTY_DASHBOARD: LearningHubDashboardData = {
  tracks: [],
  totalLessons: 0,
  totalCompleted: 0,
  continueLesson: null,
};

export async function getLearningHubDashboardData(): Promise<LearningHubDashboardData> {
  const me = await learnerIdentity();
  if (!me) return EMPTY_DASHBOARD;
  const userEmail = me.email;
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks ORDER BY order_index ASC, id ASC`);

  const tracksWithProgress: TrackWithProgress[] = [];
  let totalLessons = 0;
  let totalCompleted = 0;

  for (const track of tracks) {
    const rows = await sql<CountRow[]>(
      `SELECT
         COUNT(DISTINCT l.id)::int AS lesson_count,
         COUNT(DISTINCT p.id)::int AS completed_count
       FROM learning_courses c
       JOIN learning_modules m ON m.course_id = c.id
       JOIN learning_lessons l ON l.module_id = m.id
       LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id AND p.user_email = ?
       WHERE c.track_id = ? AND c.status = 'published'`,
      [userEmail, track.id],
    );
    const courseCountRows = await sql<QueryResultRow[]>(
      `SELECT COUNT(*)::int AS count FROM learning_courses WHERE track_id = ? AND status = 'published'`,
      [track.id],
    );
    const lessonCount = Number(rows[0]?.lesson_count ?? 0);
    const completedCount = Number(rows[0]?.completed_count ?? 0);
    totalLessons += lessonCount;
    totalCompleted += completedCount;

    tracksWithProgress.push({
      ...track,
      course_count: Number(courseCountRows[0]?.count ?? 0),
      lesson_count: lessonCount,
      completed_count: completedCount,
      progress_pct: lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0,
    });
  }

  const continueRows = await sql<QueryResultRow[]>(
    `SELECT t.key AS track_key, t.name AS track_name, c.id AS course_id, c.title AS course_title,
            l.id AS lesson_id, l.title AS lesson_title
     FROM learning_lessons l
     JOIN learning_modules m ON m.id = l.module_id
     JOIN learning_courses c ON c.id = m.course_id
     JOIN learning_tracks t ON t.id = c.track_id
     LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id AND p.user_email = ?
     WHERE c.status = 'published' AND p.id IS NULL
     ORDER BY t.order_index ASC, c.order_index ASC, m.order_index ASC, l.order_index ASC
     LIMIT 1`,
    [userEmail],
  );

  const continueRow = continueRows[0];

  return {
    tracks: tracksWithProgress,
    totalLessons,
    totalCompleted,
    continueLesson: continueRow
      ? {
          track_key: String(continueRow.track_key),
          track_name: String(continueRow.track_name),
          course_id: Number(continueRow.course_id),
          course_title: String(continueRow.course_title),
          lesson_id: Number(continueRow.lesson_id),
          lesson_title: String(continueRow.lesson_title),
        }
      : null,
  };
}

/* ── Track detail (course list) ──────────────────────────────────────── */

export async function getTrackDetail(trackKey: string): Promise<TrackDetailData | null> {
  const me = await learnerIdentity();
  if (!me) return null;
  const userEmail = me.email;
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;

  const courses = await sql<LearningCourse[]>(
    `SELECT * FROM learning_courses WHERE track_id = ? AND status = 'published' ORDER BY order_index ASC, id ASC`,
    [track.id],
  );

  const coursesWithProgress: CourseWithProgress[] = [];
  for (const course of courses) {
    const rows = await sql<CountRow[]>(
      `SELECT COUNT(DISTINCT l.id)::int AS lesson_count, COUNT(DISTINCT p.id)::int AS completed_count
       FROM learning_modules m
       JOIN learning_lessons l ON l.module_id = m.id
       LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id AND p.user_email = ?
       WHERE m.course_id = ?`,
      [userEmail, course.id],
    );
    const lessonCount = Number(rows[0]?.lesson_count ?? 0);
    const completedCount = Number(rows[0]?.completed_count ?? 0);
    coursesWithProgress.push({
      ...course,
      lesson_count: lessonCount,
      completed_count: completedCount,
      progress_pct: lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0,
    });
  }

  return { track, courses: coursesWithProgress };
}

/* ── Quiz gating (lesson-level quizzes; must pass one to unlock the next lesson) ── */

interface LessonGate { hasQuiz: boolean; quizId: number | null; passPct: number; quizPassed: boolean; locked: boolean }

// For a course's lessons in order: a lesson is `locked` when any EARLIER lesson that has a quiz
// has not been passed. The lesson holding the first unpassed quiz is itself unlocked (you take it);
// everything after it is locked until it passes.
async function getCourseGating(courseId: number, userEmail: string): Promise<Map<number, LessonGate>> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT l.id AS lesson_id, z.id AS quiz_id, z.pass_pct, (r.passed IS TRUE) AS passed
     FROM learning_lessons l
     JOIN learning_modules m ON m.id = l.module_id
     LEFT JOIN learning_quizzes z ON z.lesson_id = l.id
     LEFT JOIN learning_quiz_results r ON r.quiz_id = z.id AND r.user_email = ?
     WHERE m.course_id = ?
     ORDER BY m.order_index ASC, m.id ASC, l.order_index ASC, l.id ASC`,
    [normalizeEmail(userEmail), courseId],
  );
  const map = new Map<number, LessonGate>();
  let blocked = false;
  for (const r of rows) {
    const quizId = r.quiz_id != null ? Number(r.quiz_id) : null;
    const hasQuiz = quizId != null;
    const quizPassed = r.passed === true;
    map.set(Number(r.lesson_id), { hasQuiz, quizId, passPct: Number(r.pass_pct ?? 70), quizPassed, locked: blocked });
    if (hasQuiz && !quizPassed) blocked = true;
  }
  return map;
}

// The learner-facing quiz (no answer key).
async function loadLessonQuiz(quizId: number): Promise<LessonQuiz | null> {
  const quizRows = await sql<QueryResultRow[]>(`SELECT id, title, pass_pct FROM learning_quizzes WHERE id = ?`, [quizId]);
  if (!quizRows[0]) return null;
  const questions = await sql<QueryResultRow[]>(
    `SELECT id, question_text FROM learning_quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC, id ASC`, [quizId],
  );
  const qIds = questions.map((q) => Number(q.id));
  const options = qIds.length
    ? await sql<QueryResultRow[]>(
        `SELECT id, question_id, option_text FROM learning_quiz_options WHERE question_id = ANY(?) ORDER BY order_index ASC, id ASC`, [qIds],
      )
    : [];
  const optsByQ = new Map<number, { id: number; text: string }[]>();
  for (const o of options) {
    const arr = optsByQ.get(Number(o.question_id)) ?? [];
    arr.push({ id: Number(o.id), text: String(o.option_text) });
    optsByQ.set(Number(o.question_id), arr);
  }
  return {
    id: Number(quizRows[0].id),
    title: String(quizRows[0].title),
    pass_pct: Number(quizRows[0].pass_pct ?? 70),
    questions: questions.map((q) => ({ id: Number(q.id), text: String(q.question_text), options: optsByQ.get(Number(q.id)) ?? [] })),
  };
}

/* ── Course detail (modules + lessons outline) ───────────────────────── */

export async function getCourseDetail(trackKey: string, courseId: number): Promise<CourseDetailData | null> {
  const me = await learnerIdentity();
  if (!me) return null;
  const userEmail = me.email;
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;

  // Draft courses stay invisible to learners even when the id is guessed.
  const courses = await sql<LearningCourse[]>(
    `SELECT * FROM learning_courses WHERE id = ? AND track_id = ?${publishedFilter(me.isAdmin)}`,
    [courseId, track.id],
  );
  const course = courses[0];
  if (!course) return null;

  const modules = await sql<LearningModule[]>(
    `SELECT * FROM learning_modules WHERE course_id = ? ORDER BY order_index ASC, id ASC`,
    [course.id],
  );

  const completedRows = await sql<QueryResultRow[]>(
    `SELECT l.id AS lesson_id
     FROM learning_lessons l
     JOIN learning_modules m ON m.id = l.module_id
     JOIN learning_lesson_progress p ON p.lesson_id = l.id
     WHERE m.course_id = ? AND p.user_email = ?`,
    [course.id, userEmail],
  );
  const completedIds = new Set(completedRows.map((r) => Number(r.lesson_id)));
  const gating = await getCourseGating(course.id, userEmail);

  const moduleIds = modules.map((m) => m.id);
  const quizRows = moduleIds.length
    ? await sql<QueryResultRow[]>(`SELECT module_id FROM learning_quizzes WHERE module_id = ANY(?)`, [moduleIds])
    : [];
  const quizModuleIds = new Set(quizRows.map((r) => Number(r.module_id)));

  const moduleOutlines: ModuleOutline[] = [];
  let lessonCount = 0;
  let completedCount = 0;
  for (const mod of modules) {
    const lessons = await sql<LearningLesson[]>(
      `SELECT * FROM learning_lessons WHERE module_id = ? ORDER BY order_index ASC, id ASC`,
      [mod.id],
    );
    const lessonsWithCompletion = lessons.map((l) => {
      const g = gating.get(l.id);
      const completed = g?.hasQuiz ? !!g.quizPassed : completedIds.has(l.id);
      return { ...l, completed, has_quiz: !!g?.hasQuiz, quiz_passed: !!g?.quizPassed, locked: !!g?.locked };
    });
    lessonCount += lessons.length;
    completedCount += lessonsWithCompletion.filter((l) => l.completed).length;
    moduleOutlines.push({ ...mod, lessons: lessonsWithCompletion, has_quiz: quizModuleIds.has(mod.id) });
  }

  return {
    track,
    course,
    modules: moduleOutlines,
    lesson_count: lessonCount,
    completed_count: completedCount,
    progress_pct: lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0,
  };
}

/* ── Lesson viewer (content + prev/next nav) ─────────────────────────── */

export async function getLessonDetail(
  trackKey: string,
  courseId: number,
  lessonId: number,
): Promise<LessonDetailData | null> {
  const me = await learnerIdentity();
  if (!me) return null;
  const userEmail = me.email;
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;

  // A draft course's lessons are not readable by guessing the lesson id.
  const courses = await sql<LearningCourse[]>(
    `SELECT * FROM learning_courses WHERE id = ? AND track_id = ?${publishedFilter(me.isAdmin)}`,
    [courseId, track.id],
  );
  const course = courses[0];
  if (!course) return null;

  const lessons = await sql<QueryResultRow[]>(
    `SELECT l.* FROM learning_lessons l
     JOIN learning_modules m ON m.id = l.module_id
     WHERE m.course_id = ?
     ORDER BY m.order_index ASC, m.id ASC, l.order_index ASC, l.id ASC`,
    [course.id],
  );

  const idx = lessons.findIndex((l) => Number(l.id) === lessonId);
  if (idx < 0) return null;
  const lesson = lessons[idx] as unknown as LearningLesson;

  const completedRows = await sql<QueryResultRow[]>(
    `SELECT id FROM learning_lesson_progress WHERE lesson_id = ? AND user_email = ?`,
    [lessonId, userEmail],
  );

  const prevRow = idx > 0 ? lessons[idx - 1] : null;
  const nextRow = idx < lessons.length - 1 ? lessons[idx + 1] : null;

  const gating = await getCourseGating(course.id, userEmail);
  const g = gating.get(lessonId);
  const locked = !!g?.locked;
  const quizPassed = !!g?.quizPassed;
  const passPct = g?.passPct ?? 70;
  const quiz = g?.hasQuiz && g.quizId != null && !locked ? await loadLessonQuiz(g.quizId) : null;
  const nextLocked = nextRow ? !!gating.get(Number(nextRow.id))?.locked : false;
  // Don't ship a locked lesson's body/video to the client.
  const visibleLesson = locked ? { ...lesson, body: '', video_url: null } : lesson;

  return {
    track,
    course,
    lesson: visibleLesson,
    completed: g?.hasQuiz ? quizPassed : completedRows.length > 0,
    prev: prevRow ? { lesson_id: Number(prevRow.id), course_id: course.id, title: String(prevRow.title) } : null,
    next: nextRow ? { lesson_id: Number(nextRow.id), course_id: course.id, title: String(nextRow.title) } : null,
    locked,
    quiz,
    quiz_passed: quizPassed,
    pass_pct: passPct,
    next_locked: nextLocked,
  };
}

/* ── My Work (cross-track progress) ──────────────────────────────────── */

const EMPTY_MY_WORK: MyWorkData = { inProgress: [], completed: [], notStarted: [] };

export async function getMyWorkData(): Promise<MyWorkData> {
  const me = await learnerIdentity();
  if (!me) return EMPTY_MY_WORK;
  const userEmail = me.email;
  await ensureLearningHubReady();

  const rows = await sql<QueryResultRow[]>(
    `SELECT
       t.key AS track_key, t.name AS track_name, t.color AS track_color,
       c.id AS course_id, c.title AS course_title,
       COUNT(DISTINCT l.id)::int AS lesson_count,
       COUNT(DISTINCT p.id)::int AS completed_count,
       MAX(p.completed_at) AS last_activity_at
     FROM learning_courses c
     JOIN learning_tracks t ON t.id = c.track_id
     JOIN learning_modules m ON m.course_id = c.id
     JOIN learning_lessons l ON l.module_id = m.id
     LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id AND p.user_email = ?
     WHERE c.status = 'published'
     GROUP BY t.key, t.name, t.color, c.id, c.title, t.order_index, c.order_index
     ORDER BY t.order_index ASC, c.order_index ASC`,
    [userEmail],
  );

  const courses: MyWorkCourse[] = rows.map((r) => {
    const lessonCount = Number(r.lesson_count ?? 0);
    const completedCount = Number(r.completed_count ?? 0);
    return {
      track_key: String(r.track_key),
      track_name: String(r.track_name),
      track_color: r.track_color ? String(r.track_color) : null,
      course_id: Number(r.course_id),
      course_title: String(r.course_title),
      lesson_count: lessonCount,
      completed_count: completedCount,
      progress_pct: lessonCount > 0 ? Math.round((completedCount / lessonCount) * 100) : 0,
      last_activity_at: r.last_activity_at ? String(r.last_activity_at) : null,
    };
  });

  return {
    inProgress: courses.filter((c) => c.completed_count > 0 && c.completed_count < c.lesson_count),
    completed: courses.filter((c) => c.lesson_count > 0 && c.completed_count === c.lesson_count),
    notStarted: courses.filter((c) => c.completed_count === 0),
  };
}

/* ── Knowledge checks (one optional quiz per module) ─────────────────────
   Feedback-only: no gating on progress. The learner-facing shape withholds
   is_correct until submitQuizAttempt() grades the attempt server-side, so the
   answer key never ships to the client before the quiz is submitted. ── */

export async function loadModuleQuizRaw(
  moduleId: number,
): Promise<{ quiz: QueryResultRow; questions: QueryResultRow[]; optionsByQuestion: Map<number, QueryResultRow[]> } | null> {
  const quizzes = await sql<QueryResultRow[]>(`SELECT * FROM learning_quizzes WHERE module_id = ?`, [moduleId]);
  const quiz = quizzes[0];
  if (!quiz) return null;

  const questions = await sql<QueryResultRow[]>(
    `SELECT * FROM learning_quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC, id ASC`,
    [quiz.id],
  );
  const questionIds = questions.map((q) => Number(q.id));
  const options = questionIds.length
    ? await sql<QueryResultRow[]>(
        `SELECT * FROM learning_quiz_options WHERE question_id = ANY(?) ORDER BY order_index ASC, id ASC`,
        [questionIds],
      )
    : [];

  const optionsByQuestion = new Map<number, QueryResultRow[]>();
  for (const o of options) {
    const qid = Number(o.question_id);
    if (!optionsByQuestion.has(qid)) optionsByQuestion.set(qid, []);
    optionsByQuestion.get(qid)!.push(o);
  }
  return { quiz, questions, optionsByQuestion };
}

async function getModuleQuizForLearner(moduleId: number): Promise<ModuleQuiz | null> {
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
      })),
    })),
  };
}

export async function getModuleQuizPageData(
  trackKey: string,
  courseId: number,
  moduleId: number,
): Promise<ModuleQuizPageData | null> {
  const me = await learnerIdentity();
  if (!me) return null;
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;
  // A draft course's knowledge check is not readable by guessing the module id.
  const courses = await sql<LearningCourse[]>(
    `SELECT * FROM learning_courses WHERE id = ? AND track_id = ?${publishedFilter(me.isAdmin)}`,
    [courseId, track.id],
  );
  const course = courses[0];
  if (!course) return null;
  const modules = await sql<LearningModule[]>(`SELECT * FROM learning_modules WHERE id = ? AND course_id = ?`, [moduleId, course.id]);
  const mod = modules[0];
  if (!mod) return null;
  const quiz = await getModuleQuizForLearner(moduleId);
  if (!quiz) return null;
  return { track, course, module: mod, quiz };
}
