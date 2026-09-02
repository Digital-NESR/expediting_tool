'use server';

import type { QueryResultRow } from 'pg';
import { createHash } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import learningHubPool from '@/lib/db-learning-hub';
import { SEED_TRACKS, type SeedTrack } from '@/lib/learning-hub-seed-content';
import type {
  LearningTrack,
  LearningCourse,
  LearningModule,
  LearningLesson,
  TrackWithProgress,
  LearningHubDashboardData,
  CourseWithProgress,
  TrackDetailData,
  ModuleOutline,
  CourseDetailData,
  LessonDetailData,
  MyWorkCourse,
  MyWorkData,
  AdminModuleWithLessons,
  AdminCourseWithModules,
  AdminTrackWithCourses,
  LearningHubAdminData,
  CourseStatus,
  ModuleQuiz,
  ModuleQuizWithAnswers,
  ModuleQuizPageData,
  QuizAnswerInput,
  QuizAttemptResult,
} from '@/types/learning-hub';

/* ── Query helpers (house pattern: ? -> $n, sql() for SELECT, exec() for writes) ── */

type QueryParams = (string | number | boolean | null | undefined | string[] | number[])[];

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
async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await learningHubPool.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}
async function exec(statement: string, params: QueryParams = []): Promise<{ rowCount: number; insertId: number }> {
  const result = await learningHubPool.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return { rowCount: result.rowCount ?? 0, insertId: Number.isFinite(insertId) ? insertId : 0 };
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

// Inserts a track's courses/modules/lessons breadth-first (siblings in parallel, not one deep serial
// chain) — a cold-start seed of dozens of sequential round trips risks exceeding the serverless
// function's execution timeout. Each level only depends on its parent's id, so siblings are independent.
// Shared by the one-time empty-DB seed and the admin "reset track to defaults" action.
async function insertTrackCourses(trackId: number, track: SeedTrack): Promise<void> {
  await Promise.all(
    track.courses.map(async (course, courseIdx) => {
      const courseResult = await exec(
        `INSERT INTO learning_courses (track_id, title, description, order_index, status) VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [trackId, course.title, course.description, courseIdx, course.status],
      );
      await Promise.all(
        course.modules.map(async (mod, moduleIdx) => {
          const moduleResult = await exec(
            `INSERT INTO learning_modules (course_id, title, order_index, resource_label, resource_url) VALUES (?, ?, ?, ?, ?) RETURNING id`,
            [courseResult.insertId, mod.title, moduleIdx, mod.resourceLabel ?? null, mod.resourceUrl ?? null],
          );
          await Promise.all(
            mod.lessons.map((lesson, lessonIdx) =>
              exec(
                `INSERT INTO learning_lessons (module_id, title, body, video_url, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
                [moduleResult.insertId, lesson.title, lesson.body, lesson.videoUrl ?? null, lesson.duration_minutes ?? null, lessonIdx],
              ),
            ),
          );
        }),
      );
    }),
  );
}

// A stable fingerprint of a track's code-defined content. Stored per-track as seed_version so we can
// tell whether SEED_TRACKS changed since the last sync, without diffing every field by hand.
function hashSeedTrack(track: SeedTrack): string {
  return createHash('sha256').update(JSON.stringify(track)).digest('hex');
}

async function insertNewSeedTrack(track: SeedTrack, orderIndex: number, version: string): Promise<number> {
  const result = await exec(
    `INSERT INTO learning_tracks (key, name, description, icon, color, order_index, seed_version) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [track.key, track.name, track.description, track.icon, track.color, orderIndex, version],
  );
  await insertTrackCourses(result.insertId, track);
  return result.insertId;
}

async function applySeedTrackToExisting(trackId: number, track: SeedTrack, version: string): Promise<void> {
  await exec(
    `UPDATE learning_tracks SET name = ?, description = ?, icon = ?, color = ?, seed_version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [track.name, track.description, track.icon, track.color, version, trackId],
  );
  await exec(`DELETE FROM learning_courses WHERE track_id = ?`, [trackId]);
  await insertTrackCourses(trackId, track);
}

// Runs on every cold start (cheap once synced — just one SELECT + hash comparison per track).
// A track whose code content hasn't changed since the last sync (seed_version matches) is left
// completely alone, so admin edits made through the CMS survive unrelated deploys. A track whose
// code content DID change (this is how a content push like the SAP video rebuild reaches production)
// gets its courses replaced with what's now in SEED_TRACKS automatically — no manual "reset" needed.
async function syncSeedTracks(): Promise<void> {
  const existingTracks = await sql<QueryResultRow[]>(`SELECT id, key, seed_version FROM learning_tracks`);
  const existingByKey = new Map(existingTracks.map((t) => [String(t.key), t]));

  for (let trackIdx = 0; trackIdx < SEED_TRACKS.length; trackIdx++) {
    const track = SEED_TRACKS[trackIdx];
    const version = hashSeedTrack(track);
    const existing = existingByKey.get(track.key);

    if (!existing) {
      await insertNewSeedTrack(track, trackIdx, version);
      continue;
    }
    if (String(existing.seed_version ?? '') === version) continue;
    await applySeedTrackToExisting(Number(existing.id), track, version);
  }
}

// Admin escape hatch: force one track back to its current code-defined content right now, even if
// the auto-sync above already considers it up to date (e.g. to discard manual CMS edits deliberately).
export async function resyncTrackFromSeed(trackKey: string): Promise<{ success: boolean; message: string }> {
  await ensureLearningHubSchema();
  const seedTrack = SEED_TRACKS.find((t) => t.key === trackKey);
  if (!seedTrack) return { success: false, message: `No seed content defined for track "${trackKey}".` };
  const version = hashSeedTrack(seedTrack);

  const existingTrack = await sql<QueryResultRow[]>(`SELECT id FROM learning_tracks WHERE key = ?`, [trackKey]);
  if (existingTrack[0]) {
    await applySeedTrackToExisting(Number(existingTrack[0].id), seedTrack, version);
  } else {
    const trackIdx = SEED_TRACKS.indexOf(seedTrack);
    await insertNewSeedTrack(seedTrack, trackIdx, version);
  }
  return { success: true, message: `Reset "${seedTrack.name}" to its default seed content.` };
}

async function ensureLearningHubReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = ensureLearningHubSchema()
      .then(() => syncSeedTracks())
      .catch((err) => {
        // Don't let a failed cold-start attempt permanently wedge a warm serverless instance —
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
export async function getLessonTitle(id: number): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT title FROM learning_lessons WHERE id = ?`, [id]);
    return (rows[0]?.title as string) ?? null;
  } catch { return null; }
}

/* ── Access requests (request -> admin approve; mirrors the other tools) ────── */

async function getLearningHubActor(): Promise<{ email: string; name: string; isAdmin: boolean } | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  return { email, name: session?.user?.name?.trim() || email.split('@')[0], isAdmin: adminEmails.includes(email) };
}

export interface LearningHubAccessRequest {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  status: string;
  requested_at: string | null;
  reviewed_at: string | null;
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  try { return new Date(v as string).toISOString(); } catch { return null; }
}

function mapAccessRow(r: QueryResultRow): LearningHubAccessRequest {
  return {
    user_email: r.user_email as string,
    display_name: (r.display_name as string) ?? null,
    job_title: (r.job_title as string) ?? null,
    status: r.status as string,
    requested_at: isoOrNull(r.requested_at),
    reviewed_at: isoOrNull(r.reviewed_at),
  };
}

export async function getLearningHubAccessRequest(userEmail: string): Promise<LearningHubAccessRequest | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(
      `SELECT user_email, display_name, job_title, status, requested_at, reviewed_at FROM access_requests WHERE user_email = ?`,
      [userEmail.toLowerCase()],
    );
    return rows[0] ? mapAccessRow(rows[0]) : null;
  } catch (err) { console.error('[lh.getLearningHubAccessRequest]', err); return null; }
}

export async function submitLearningHubAccessRequest(input: {
  userEmail: string; displayName: string; jobTitle?: string | null; department?: string | null;
}): Promise<{ success: boolean; error?: string }> {
  if (!input.userEmail) return { success: false, error: 'Not signed in.' };
  try {
    await ensureLearningHubReady();
    await exec(
      `INSERT INTO access_requests (user_email, display_name, job_title, department, status, requested_countries, requested_at)
       VALUES (?, ?, ?, ?, 'Pending', '{}', NOW())
       ON CONFLICT (user_email) DO UPDATE SET
         display_name = EXCLUDED.display_name, job_title = EXCLUDED.job_title,
         status = 'Pending', requested_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, notes = NULL, approved_countries = NULL`,
      [input.userEmail.toLowerCase(), input.displayName, input.jobTitle ?? null, input.department ?? null],
    );
    return { success: true };
  } catch (err) { console.error('[lh.submitLearningHubAccessRequest]', err); return { success: false, error: 'Failed to submit request. Please try again.' }; }
}

export async function getLearningHubAccessRequests(): Promise<LearningHubAccessRequest[]> {
  try {
    const actor = await getLearningHubActor();
    if (!actor?.isAdmin) return [];
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(
      `SELECT user_email, display_name, job_title, status, requested_at, reviewed_at FROM access_requests
       ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, requested_at DESC`,
    );
    return rows.map(mapAccessRow);
  } catch (err) { console.error('[lh.getLearningHubAccessRequests]', err); return []; }
}

export async function getLearningHubPendingCount(): Promise<number> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT COUNT(*)::int AS cnt FROM access_requests WHERE status = 'Pending'`);
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) { console.error('[lh.getLearningHubPendingCount]', err); return 0; }
}

async function setLearningHubAccessStatus(userEmail: string, status: 'Approved' | 'Rejected' | 'Revoked'): Promise<{ success: boolean; error?: string }> {
  const actor = await getLearningHubActor();
  if (!actor?.isAdmin) return { success: false, error: 'Admins only.' };
  try {
    await ensureLearningHubReady();
    await exec(`UPDATE access_requests SET status = ?, reviewed_at = NOW(), reviewed_by = ? WHERE user_email = ?`, [status, actor.name, userEmail.toLowerCase()]);
    return { success: true };
  } catch (err) { console.error('[lh.setLearningHubAccessStatus]', err); return { success: false, error: 'Action failed.' }; }
}

export async function approveLearningHubAccessRequest(userEmail: string) { return setLearningHubAccessStatus(userEmail, 'Approved'); }
export async function rejectLearningHubAccessRequest(userEmail: string) { return setLearningHubAccessStatus(userEmail, 'Rejected'); }
export async function revokeLearningHubAccess(userEmail: string) { return setLearningHubAccessStatus(userEmail, 'Revoked'); }

export async function deleteLearningHubAccessRequest(userEmail: string): Promise<{ success: boolean; error?: string }> {
  const actor = await getLearningHubActor();
  if (!actor?.isAdmin) return { success: false, error: 'Admins only.' };
  try {
    await ensureLearningHubReady();
    await exec(`DELETE FROM access_requests WHERE user_email = ?`, [userEmail.toLowerCase()]);
    return { success: true };
  } catch (err) { console.error('[lh.deleteLearningHubAccessRequest]', err); return { success: false, error: 'Failed to delete request.' }; }
}

/* ── Dashboard ────────────────────────────────────────────────────────── */

export async function getLearningHubDashboardData(userEmail: string): Promise<LearningHubDashboardData> {
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

export async function getTrackDetail(trackKey: string, userEmail: string): Promise<TrackDetailData | null> {
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

/* ── Course detail (modules + lessons outline) ───────────────────────── */

export async function getCourseDetail(
  trackKey: string,
  courseId: number,
  userEmail: string,
): Promise<CourseDetailData | null> {
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;

  const courses = await sql<LearningCourse[]>(`SELECT * FROM learning_courses WHERE id = ? AND track_id = ?`, [
    courseId,
    track.id,
  ]);
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
    const lessonsWithCompletion = lessons.map((l) => ({ ...l, completed: completedIds.has(l.id) }));
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
  userEmail: string,
): Promise<LessonDetailData | null> {
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;

  const courses = await sql<LearningCourse[]>(`SELECT * FROM learning_courses WHERE id = ? AND track_id = ?`, [
    courseId,
    track.id,
  ]);
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

  return {
    track,
    course,
    lesson,
    completed: completedRows.length > 0,
    prev: prevRow ? { lesson_id: Number(prevRow.id), course_id: course.id, title: String(prevRow.title) } : null,
    next: nextRow ? { lesson_id: Number(nextRow.id), course_id: course.id, title: String(nextRow.title) } : null,
  };
}

/* ── Progress mutations ──────────────────────────────────────────────── */

export async function markLessonComplete(lessonId: number, userEmail: string): Promise<{ success: boolean }> {
  await ensureLearningHubReady();
  await exec(
    `INSERT INTO learning_lesson_progress (user_email, lesson_id) VALUES (?, ?)
     ON CONFLICT (user_email, lesson_id) DO NOTHING`,
    [userEmail, lessonId],
  );
  return { success: true };
}

export async function markLessonIncomplete(lessonId: number, userEmail: string): Promise<{ success: boolean }> {
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_lesson_progress WHERE user_email = ? AND lesson_id = ?`, [userEmail, lessonId]);
  return { success: true };
}

/* ── My Work (cross-track progress) ──────────────────────────────────── */

export async function getMyWorkData(userEmail: string): Promise<MyWorkData> {
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

/* ── Admin CMS ────────────────────────────────────────────────────────── */

export async function getLearningHubAdminData(): Promise<LearningHubAdminData> {
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks ORDER BY order_index ASC, id ASC`);
  const courses = await sql<LearningCourse[]>(`SELECT * FROM learning_courses ORDER BY track_id ASC, order_index ASC, id ASC`);
  const modules = await sql<LearningModule[]>(`SELECT * FROM learning_modules ORDER BY course_id ASC, order_index ASC, id ASC`);
  const lessons = await sql<LearningLesson[]>(`SELECT * FROM learning_lessons ORDER BY module_id ASC, order_index ASC, id ASC`);
  const quizRows = await sql<QueryResultRow[]>(`SELECT module_id FROM learning_quizzes`);
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

export async function createCourse(
  trackId: number,
  title: string,
  description: string,
  status: CourseStatus,
): Promise<{ id: number }> {
  await ensureLearningHubReady();
  const maxRows = await sql<QueryResultRow[]>(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_courses WHERE track_id = ?`, [trackId]);
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
  await ensureLearningHubReady();
  await exec(
    `UPDATE learning_courses SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.description, fields.status, id],
  );
}

export async function deleteCourse(id: number): Promise<void> {
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_courses WHERE id = ?`, [id]);
}

export async function createModule(courseId: number, title: string): Promise<{ id: number }> {
  await ensureLearningHubReady();
  const maxRows = await sql<QueryResultRow[]>(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_modules WHERE course_id = ?`, [courseId]);
  const nextOrder = Number(maxRows[0]?.next ?? 0);
  const result = await exec(`INSERT INTO learning_modules (course_id, title, order_index) VALUES (?, ?, ?) RETURNING id`, [
    courseId,
    title,
    nextOrder,
  ]);
  return { id: result.insertId };
}

export async function updateModule(
  id: number,
  fields: { title: string; resource_label: string | null; resource_url: string | null },
): Promise<void> {
  await ensureLearningHubReady();
  await exec(
    `UPDATE learning_modules SET title = ?, resource_label = ?, resource_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.resource_label || null, fields.resource_url || null, id],
  );
}

export async function deleteModule(id: number): Promise<void> {
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_modules WHERE id = ?`, [id]);
}

export async function createLesson(
  moduleId: number,
  title: string,
  body: string,
  durationMinutes: number | null,
  videoUrl?: string | null,
): Promise<{ id: number }> {
  await ensureLearningHubReady();
  const maxRows = await sql<QueryResultRow[]>(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_lessons WHERE module_id = ?`, [moduleId]);
  const nextOrder = Number(maxRows[0]?.next ?? 0);
  const result = await exec(
    `INSERT INTO learning_lessons (module_id, title, body, video_url, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
    [moduleId, title, body, videoUrl || null, durationMinutes, nextOrder],
  );
  return { id: result.insertId };
}

export async function updateLesson(
  id: number,
  fields: { title: string; body: string; video_url: string | null; duration_minutes: number | null },
): Promise<void> {
  await ensureLearningHubReady();
  await exec(
    `UPDATE learning_lessons SET title = ?, body = ?, video_url = ?, duration_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.body, fields.video_url || null, fields.duration_minutes, id],
  );
}

export async function deleteLesson(id: number): Promise<void> {
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_lessons WHERE id = ?`, [id]);
}

type ReorderTable = 'learning_courses' | 'learning_modules' | 'learning_lessons';
const PARENT_COLUMN: Record<ReorderTable, string> = {
  learning_courses: 'track_id',
  learning_modules: 'course_id',
  learning_lessons: 'module_id',
};

async function moveOrderIndex(table: ReorderTable, parentId: number, id: number, direction: 'up' | 'down'): Promise<void> {
  const parentColumn = PARENT_COLUMN[table];
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, order_index FROM ${table} WHERE ${parentColumn} = ? ORDER BY order_index ASC, id ASC`,
    [parentId],
  );
  const idx = rows.findIndex((r) => Number(r.id) === id);
  if (idx < 0) return;
  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= rows.length) return;
  const a = rows[idx];
  const b = rows[swapIdx];
  await exec(`UPDATE ${table} SET order_index = ? WHERE id = ?`, [Number(b.order_index), Number(a.id)]);
  await exec(`UPDATE ${table} SET order_index = ? WHERE id = ?`, [Number(a.order_index), Number(b.id)]);
}

export async function moveCourse(trackId: number, id: number, direction: 'up' | 'down'): Promise<void> {
  await ensureLearningHubReady();
  await moveOrderIndex('learning_courses', trackId, id, direction);
}
export async function moveModule(courseId: number, id: number, direction: 'up' | 'down'): Promise<void> {
  await ensureLearningHubReady();
  await moveOrderIndex('learning_modules', courseId, id, direction);
}
export async function moveLesson(moduleId: number, id: number, direction: 'up' | 'down'): Promise<void> {
  await ensureLearningHubReady();
  await moveOrderIndex('learning_lessons', moduleId, id, direction);
}

/* ── Knowledge checks (one optional quiz per module) ─────────────────────
   Feedback-only: no gating on progress. Learner-facing fetch withholds
   is_correct until submitQuizAttempt() grades the attempt server-side, so
   the answer key never ships to the client before the quiz is submitted. ── */

async function loadModuleQuizRaw(
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

export async function getModuleQuizForLearner(moduleId: number): Promise<ModuleQuiz | null> {
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
      })),
    })),
  };
}

export async function getModuleQuizForAdmin(moduleId: number): Promise<ModuleQuizWithAnswers | null> {
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

export async function getModuleQuizPageData(
  trackKey: string,
  courseId: number,
  moduleId: number,
): Promise<ModuleQuizPageData | null> {
  await ensureLearningHubReady();
  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [trackKey]);
  const track = tracks[0];
  if (!track) return null;
  const courses = await sql<LearningCourse[]>(`SELECT * FROM learning_courses WHERE id = ? AND track_id = ?`, [courseId, track.id]);
  const course = courses[0];
  if (!course) return null;
  const modules = await sql<LearningModule[]>(`SELECT * FROM learning_modules WHERE id = ? AND course_id = ?`, [moduleId, course.id]);
  const mod = modules[0];
  if (!mod) return null;
  const quiz = await getModuleQuizForLearner(moduleId);
  if (!quiz) return null;
  return { track, course, module: mod, quiz };
}

export async function saveModuleQuiz(
  moduleId: number,
  title: string,
  questions: { question_text: string; options: { option_text: string; is_correct: boolean }[] }[],
): Promise<void> {
  await ensureLearningHubReady();
  const existing = await sql<QueryResultRow[]>(`SELECT id FROM learning_quizzes WHERE module_id = ?`, [moduleId]);
  let quizId: number;
  if (existing[0]) {
    quizId = Number(existing[0].id);
    await exec(`UPDATE learning_quizzes SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [title, quizId]);
    await exec(`DELETE FROM learning_quiz_questions WHERE quiz_id = ?`, [quizId]);
  } else {
    const result = await exec(`INSERT INTO learning_quizzes (module_id, title) VALUES (?, ?) RETURNING id`, [moduleId, title]);
    quizId = result.insertId;
  }

  await Promise.all(
    questions.map(async (q, qIdx) => {
      const qResult = await exec(
        `INSERT INTO learning_quiz_questions (quiz_id, question_text, order_index) VALUES (?, ?, ?) RETURNING id`,
        [quizId, q.question_text, qIdx],
      );
      await Promise.all(
        q.options.map((o, oIdx) =>
          exec(
            `INSERT INTO learning_quiz_options (question_id, option_text, is_correct, order_index) VALUES (?, ?, ?, ?) RETURNING id`,
            [qResult.insertId, o.option_text, o.is_correct, oIdx],
          ),
        ),
      );
    }),
  );
}

export async function deleteModuleQuiz(moduleId: number): Promise<void> {
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_quizzes WHERE module_id = ?`, [moduleId]);
}

export async function submitQuizAttempt(quizId: number, answers: QuizAnswerInput[]): Promise<QuizAttemptResult> {
  await ensureLearningHubReady();
  const correctRows = await sql<QueryResultRow[]>(
    `SELECT o.question_id, o.id AS option_id
     FROM learning_quiz_options o
     JOIN learning_quiz_questions q ON q.id = o.question_id
     WHERE q.quiz_id = ? AND o.is_correct = true`,
    [quizId],
  );
  const correctByQuestion = new Map<number, number>();
  for (const r of correctRows) correctByQuestion.set(Number(r.question_id), Number(r.option_id));

  const results = Array.from(correctByQuestion.entries()).map(([questionId, correctOptionId]) => {
    const submitted = answers.find((a) => a.questionId === questionId);
    const selectedOptionId = submitted?.optionId ?? null;
    return { questionId, selectedOptionId, correctOptionId, correct: selectedOptionId === correctOptionId };
  });
  const correctCount = results.filter((r) => r.correct).length;
  const total = results.length;

  return { total, correctCount, scorePct: total > 0 ? Math.round((correctCount / total) * 100) : 0, results };
}
