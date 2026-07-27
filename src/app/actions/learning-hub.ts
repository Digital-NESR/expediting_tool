'use server';

import type { QueryResultRow } from 'pg';
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
} from '@/types/learning-hub';

/* ── Query helpers (house pattern: ? -> $n, sql() for SELECT, exec() for writes) ── */

type QueryParams = (string | number | boolean | null | undefined | string[])[];

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);

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
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_modules_course ON learning_modules(course_id)`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_lessons (
    id SERIAL PRIMARY KEY,
    module_id INT NOT NULL REFERENCES learning_modules(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 10,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_lessons_module ON learning_lessons(module_id)`);

  await execSchema(`CREATE TABLE IF NOT EXISTS learning_lesson_progress (
    id SERIAL PRIMARY KEY,
    user_email TEXT NOT NULL,
    lesson_id INT NOT NULL REFERENCES learning_lessons(id) ON DELETE CASCADE,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_email, lesson_id)
  )`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_learning_progress_user ON learning_lesson_progress(user_email)`);
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
            `INSERT INTO learning_modules (course_id, title, order_index) VALUES (?, ?, ?) RETURNING id`,
            [courseResult.insertId, mod.title, moduleIdx],
          );
          await Promise.all(
            mod.lessons.map((lesson, lessonIdx) =>
              exec(
                `INSERT INTO learning_lessons (module_id, title, body, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?) RETURNING id`,
                [moduleResult.insertId, lesson.title, lesson.body, lesson.duration_minutes, lessonIdx],
              ),
            ),
          );
        }),
      );
    }),
  );
}

async function seedLearningHubDefaultsIfEmpty(): Promise<void> {
  const existing = await sql<QueryResultRow[]>(`SELECT COUNT(*)::int AS count FROM learning_tracks`);
  if (Number(existing[0]?.count ?? 0) > 0) return;

  await Promise.all(
    SEED_TRACKS.map(async (track, trackIdx) => {
      const trackResult = await exec(
        `INSERT INTO learning_tracks (key, name, description, icon, color, order_index) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
        [track.key, track.name, track.description, track.icon, track.color, trackIdx],
      );
      await insertTrackCourses(trackResult.insertId, track);
    }),
  );
}

// Admin-only escape hatch: the empty-DB seed above only ever runs once. If an earlier broken deploy
// left partial or stale content behind, later edits to the seed content are otherwise silently ignored
// forever. This resets one track's courses (and their modules/lessons/progress, via cascade) back to
// whatever is currently defined in code for that track key.
export async function resyncTrackFromSeed(trackKey: string): Promise<{ success: boolean; message: string }> {
  await ensureLearningHubSchema();
  const seedTrack = SEED_TRACKS.find((t) => t.key === trackKey);
  if (!seedTrack) return { success: false, message: `No seed content defined for track "${trackKey}".` };

  const existingTrack = await sql<QueryResultRow[]>(`SELECT id FROM learning_tracks WHERE key = ?`, [trackKey]);
  let trackId: number;
  if (existingTrack[0]) {
    trackId = Number(existingTrack[0].id);
    await exec(
      `UPDATE learning_tracks SET name = ?, description = ?, icon = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [seedTrack.name, seedTrack.description, seedTrack.icon, seedTrack.color, trackId],
    );
    await exec(`DELETE FROM learning_courses WHERE track_id = ?`, [trackId]);
  } else {
    const trackIdx = SEED_TRACKS.indexOf(seedTrack);
    const result = await exec(
      `INSERT INTO learning_tracks (key, name, description, icon, color, order_index) VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [seedTrack.key, seedTrack.name, seedTrack.description, seedTrack.icon, seedTrack.color, trackIdx],
    );
    trackId = result.insertId;
  }

  await insertTrackCourses(trackId, seedTrack);
  return { success: true, message: `Reset "${seedTrack.name}" to its default seed content.` };
}

async function ensureLearningHubReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = ensureLearningHubSchema()
      .then(() => seedLearningHubDefaultsIfEmpty())
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
    moduleOutlines.push({ ...mod, lessons: lessonsWithCompletion });
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

  const modulesWithLessons: AdminModuleWithLessons[] = modules.map((m) => ({
    ...m,
    lessons: lessons.filter((l) => l.module_id === m.id),
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

export async function updateModule(id: number, title: string): Promise<void> {
  await ensureLearningHubReady();
  await exec(`UPDATE learning_modules SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [title, id]);
}

export async function deleteModule(id: number): Promise<void> {
  await ensureLearningHubReady();
  await exec(`DELETE FROM learning_modules WHERE id = ?`, [id]);
}

export async function createLesson(
  moduleId: number,
  title: string,
  body: string,
  durationMinutes: number,
): Promise<{ id: number }> {
  await ensureLearningHubReady();
  const maxRows = await sql<QueryResultRow[]>(`SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM learning_lessons WHERE module_id = ?`, [moduleId]);
  const nextOrder = Number(maxRows[0]?.next ?? 0);
  const result = await exec(
    `INSERT INTO learning_lessons (module_id, title, body, duration_minutes, order_index) VALUES (?, ?, ?, ?, ?) RETURNING id`,
    [moduleId, title, body, durationMinutes, nextOrder],
  );
  return { id: result.insertId };
}

export async function updateLesson(
  id: number,
  fields: { title: string; body: string; duration_minutes: number },
): Promise<void> {
  await ensureLearningHubReady();
  await exec(
    `UPDATE learning_lessons SET title = ?, body = ?, duration_minutes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [fields.title, fields.body, fields.duration_minutes, id],
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
