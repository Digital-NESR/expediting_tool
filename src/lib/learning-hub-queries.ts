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
import learningHubPool from '@/lib/db-learning-hub';
import { createSqlHelpers } from '@/lib/db/sql';
import { withTransaction, lockForTransaction } from '@/lib/db/tx';
import { requireSchema } from '@/lib/db/schema-version';
import { currentActor, normalizeEmail } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { SEED_TRACKS, type SeedTrack } from '@/lib/learning-hub-seed-content';
/* The decisions this file used to make inline now live in one pg-free module so they can be unit
   tested; everything below fetches rows and hands them to it. */
import {
  DEFAULT_QUIZ_PASS_PCT,
  bucketMyWorkCourses,
  foldCourseGating,
  hashSeedTrack,
  lessonProgressFlags,
  progressPct,
  type LessonGate,
} from '@/lib/learning-hub-logic';
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

const log = logger('learning-hub');

/* Re-exported from their new home so the eighteen existing import sites keep working. */
export { DEFAULT_QUIZ_PASS_PCT, hashSeedTrack };

/* ── Query helpers (house pattern: ? -> $n, sql() for SELECT, exec() for writes) ── */

export type QueryParams = (string | number | boolean | null | undefined | string[] | number[])[];

export const { sql, exec } = createSqlHelpers(learningHubPool);

/* Transaction-bound twins of sql()/exec(). A multi-statement write must run every
   statement on the client withTransaction() supplied: anything going through the
   pool helpers above lands on a different connection, outside the transaction, and
   will not roll back with it. */
export function sqlOn<T extends QueryResultRow[]>(
  client: PoolClient,
  statement: string,
  params: QueryParams = [],
): Promise<T> {
  return createSqlHelpers(client).sql<T>(statement, params);
}
export function execOn(
  client: PoolClient,
  statement: string,
  params: QueryParams = [],
): Promise<{ rowCount: number; insertId: number }> {
  return createSqlHelpers(client).exec(statement, params);
}

/* ── Learner identity (never taken from the caller) ──────────────────────── */

interface LearnerIdentity {
  email: string;
  isAdmin: boolean;
}

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

/* ── Schema guard + one-time default content seed ─────────────────────────
   The DDL that used to live here — 26 CREATE TABLE / ALTER TABLE / CREATE INDEX statements run
   on the first request every serverless instance served — now lives in
   database/migrations/learning-hub/001_baseline.sql and is applied once at deploy by
   `npm run migrate`. What is left below is the assertion that it was, plus the two things that
   were never schema: the tab_label_prefix backfill and the SEED_TRACKS content sync. */

const DB_KEY = 'learning-hub';
const BASELINE = '001_baseline';

/* Content, not structure: a one-time UPDATE and a seed-content sync. Both are idempotent and both
   are memoised together, so a warm instance pays for them once rather than on every read. */
let seedPromise: Promise<void> | null = null;

// One-time, idempotent backfill of the single track that already had the tab-label behaviour
// hard-coded, so the column starts out matching what production renders today. New tracks opt in by
// setting it. This is a data fix, which is why it stayed behind when the DDL moved to the migration.
async function backfillTrackDefaults(): Promise<void> {
  await exec(
    `UPDATE learning_tracks SET tab_label_prefix = 'SC' WHERE key = 'supply_chain' AND tab_label_prefix IS NULL`,
  );
}

export interface ReconcileCounts {
  coursesAdded: number;
  coursesUpdated: number;
  coursesRemoved: number;
  modulesAdded: number;
  modulesUpdated: number;
  modulesRemoved: number;
  lessonsAdded: number;
  lessonsUpdated: number;
  lessonsRemoved: number;
  /** Progress rows destroyed because their lesson is genuinely gone from the seed. */
  progressLost: number;
}

const ZERO_COUNTS: ReconcileCounts = {
  coursesAdded: 0,
  coursesUpdated: 0,
  coursesRemoved: 0,
  modulesAdded: 0,
  modulesUpdated: 0,
  modulesRemoved: 0,
  lessonsAdded: 0,
  lessonsUpdated: 0,
  lessonsRemoved: 0,
  progressLost: 0,
};

/**
 * Two rows describe the same thing when they share a TITLE within the same parent.
 *
 * The seed has no ids, so the sync needs some other notion of identity, and that choice decides
 * who keeps their progress. Position is the obvious candidate and the wrong one: insert a lesson
 * in the middle and every lesson after it shifts, so each silently becomes "a different lesson"
 * and a learner's completions re-attach to whatever now sits at that index. Wrong progress is
 * worse than lost progress — it claims somebody finished something they never opened.
 *
 * Title is stable under insertion, removal and reordering, which are the edits that actually
 * happen. Renaming does read as a new lesson and loses its completions; that is the honest
 * reading of a rename, and it is rare and visible where a mis-attribution is neither.
 */
function titleKey(title: string): string {
  return title.trim().toLowerCase();
}

/** A seed naming one title twice under one parent has no single answer for "which row is this". */
function assertUniqueTitles(titles: string[], where: string): void {
  const seen = new Set<string>();
  for (const title of titles) {
    const key = titleKey(title);
    if (seen.has(key)) {
      throw new Error(
        `Seed content has two entries titled "${title}" under ${where}. Titles identify rows ` +
          `across a sync, so a duplicate would make learner progress attach arbitrarily.`,
      );
    }
    seen.add(key);
  }
}

/* Counted BEFORE the delete. Afterwards the rows are gone and uncountable, and this is the only
   record that somebody's completions were destroyed. */
async function countProgressUnderCourses(client: PoolClient, courseIds: number[]): Promise<number> {
  const rows = await sqlOn<QueryResultRow[]>(
    client,
    `SELECT COUNT(*)::int AS n
       FROM learning_lesson_progress p
       JOIN learning_lessons l ON l.id = p.lesson_id
       JOIN learning_modules m ON m.id = l.module_id
      WHERE m.course_id = ANY(?)`,
    [courseIds],
  );
  return Number(rows[0]?.n ?? 0);
}

async function countProgressUnderModules(client: PoolClient, moduleIds: number[]): Promise<number> {
  const rows = await sqlOn<QueryResultRow[]>(
    client,
    `SELECT COUNT(*)::int AS n
       FROM learning_lesson_progress p
       JOIN learning_lessons l ON l.id = p.lesson_id
      WHERE l.module_id = ANY(?)`,
    [moduleIds],
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * Bring a track's courses, modules and lessons in line with the seed WITHOUT rebuilding them.
 *
 * This replaced a delete-and-reinsert. That was simple, and it cost every learner their progress
 * on every content change: deleting a course cascades to its lessons, and lessons own
 * `learning_lesson_progress`. Adding three videos to a track seven people were part-way through
 * would have wiped fifty-six completions — so in practice the seed file became unsafe to edit,
 * which is the opposite of what a seed file is for.
 *
 * Rows that survive keep their ids, so progress, quizzes and quiz results hanging off them survive
 * too. Only a row the seed no longer mentions is deleted, and the progress that goes with it is
 * counted and reported rather than vanishing quietly.
 */
async function reconcileTrackCourses(
  client: PoolClient,
  trackId: number,
  track: SeedTrack,
): Promise<ReconcileCounts> {
  const counts: ReconcileCounts = { ...ZERO_COUNTS };
  assertUniqueTitles(
    track.courses.map((c) => c.title),
    `track "${track.key}"`,
  );

  /* ── Courses ───────────────────────────────────────────────────────────── */
  const existingCourses = await sqlOn<QueryResultRow[]>(
    client,
    `SELECT id, title FROM learning_courses WHERE track_id = ?`,
    [trackId],
  );
  const courseIdByKey = new Map(
    existingCourses.map((r) => [titleKey(String(r.title)), Number(r.id)]),
  );
  const seenCourses = new Set<string>();

  for (const [idx, course] of track.courses.entries()) {
    const key = titleKey(course.title);
    seenCourses.add(key);
    const id = courseIdByKey.get(key);
    if (id) {
      await execOn(
        client,
        `UPDATE learning_courses SET title = ?, description = ?, order_index = ?, status = ?
          WHERE id = ?`,
        [course.title, course.description, idx, course.status, id],
      );
      counts.coursesUpdated += 1;
    } else {
      const inserted = await sqlOn<QueryResultRow[]>(
        client,
        `INSERT INTO learning_courses (track_id, title, description, order_index, status)
         VALUES (?, ?, ?, ?, ?) RETURNING id`,
        [trackId, course.title, course.description, idx, course.status],
      );
      courseIdByKey.set(key, Number(inserted[0].id));
      counts.coursesAdded += 1;
    }
  }

  const staleCourses = existingCourses
    .filter((r) => !seenCourses.has(titleKey(String(r.title))))
    .map((r) => Number(r.id));
  if (staleCourses.length) {
    counts.progressLost += await countProgressUnderCourses(client, staleCourses);
    await execOn(client, `DELETE FROM learning_courses WHERE id = ANY(?)`, [staleCourses]);
    counts.coursesRemoved = staleCourses.length;
  }

  /* ── Modules, then lessons, the same way under each surviving parent ───── */
  for (const course of track.courses) {
    const courseId = courseIdByKey.get(titleKey(course.title))!;
    assertUniqueTitles(
      course.modules.map((m) => m.title),
      `course "${course.title}"`,
    );

    const existingModules = await sqlOn<QueryResultRow[]>(
      client,
      `SELECT id, title FROM learning_modules WHERE course_id = ?`,
      [courseId],
    );
    const moduleIdByKey = new Map(
      existingModules.map((r) => [titleKey(String(r.title)), Number(r.id)]),
    );
    const seenModules = new Set<string>();

    for (const [idx, mod] of course.modules.entries()) {
      const key = titleKey(mod.title);
      seenModules.add(key);
      const id = moduleIdByKey.get(key);
      if (id) {
        await execOn(
          client,
          `UPDATE learning_modules
              SET title = ?, order_index = ?, resource_label = ?, resource_url = ?
            WHERE id = ?`,
          [mod.title, idx, mod.resourceLabel ?? null, mod.resourceUrl ?? null, id],
        );
        counts.modulesUpdated += 1;
      } else {
        const inserted = await sqlOn<QueryResultRow[]>(
          client,
          `INSERT INTO learning_modules (course_id, title, order_index, resource_label, resource_url)
           VALUES (?, ?, ?, ?, ?) RETURNING id`,
          [courseId, mod.title, idx, mod.resourceLabel ?? null, mod.resourceUrl ?? null],
        );
        moduleIdByKey.set(key, Number(inserted[0].id));
        counts.modulesAdded += 1;
      }
    }

    const staleModules = existingModules
      .filter((r) => !seenModules.has(titleKey(String(r.title))))
      .map((r) => Number(r.id));
    if (staleModules.length) {
      counts.progressLost += await countProgressUnderModules(client, staleModules);
      await execOn(client, `DELETE FROM learning_modules WHERE id = ANY(?)`, [staleModules]);
      counts.modulesRemoved += staleModules.length;
    }

    for (const mod of course.modules) {
      const moduleId = moduleIdByKey.get(titleKey(mod.title))!;
      assertUniqueTitles(
        mod.lessons.map((l) => l.title),
        `module "${mod.title}"`,
      );

      const existingLessons = await sqlOn<QueryResultRow[]>(
        client,
        `SELECT id, title FROM learning_lessons WHERE module_id = ?`,
        [moduleId],
      );
      const lessonIdByKey = new Map(
        existingLessons.map((r) => [titleKey(String(r.title)), Number(r.id)]),
      );
      const seenLessons = new Set<string>();

      for (const [idx, lesson] of mod.lessons.entries()) {
        const key = titleKey(lesson.title);
        seenLessons.add(key);
        const id = lessonIdByKey.get(key);
        if (id) {
          await execOn(
            client,
            `UPDATE learning_lessons
                SET title = ?, body = ?, video_url = ?, duration_minutes = ?, order_index = ?
              WHERE id = ?`,
            [
              lesson.title,
              lesson.body,
              lesson.videoUrl ?? null,
              lesson.duration_minutes ?? null,
              idx,
              id,
            ],
          );
          counts.lessonsUpdated += 1;
        } else {
          await execOn(
            client,
            `INSERT INTO learning_lessons
               (module_id, title, body, video_url, duration_minutes, order_index)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              moduleId,
              lesson.title,
              lesson.body,
              lesson.videoUrl ?? null,
              lesson.duration_minutes ?? null,
              idx,
            ],
          );
          counts.lessonsAdded += 1;
        }
      }

      const staleLessons = existingLessons
        .filter((r) => !seenLessons.has(titleKey(String(r.title))))
        .map((r) => Number(r.id));
      if (staleLessons.length) {
        const doomed = await sqlOn<QueryResultRow[]>(
          client,
          `SELECT COUNT(*)::int AS n FROM learning_lesson_progress WHERE lesson_id = ANY(?)`,
          [staleLessons],
        );
        counts.progressLost += Number(doomed[0]?.n ?? 0);
        await execOn(client, `DELETE FROM learning_lessons WHERE id = ANY(?)`, [staleLessons]);
        counts.lessonsRemoved += staleLessons.length;
      }
    }
  }

  return counts;
}

/**
 * Bring one track in line with its code-defined seed content, atomically.
 *
 * This used to REPLACE a track: delete its courses, which cascades through modules and lessons to
 * `learning_lesson_progress`, then insert the seed again. Simple, and it meant every content
 * change cost every learner their progress — so the seed file quietly became something nobody
 * could safely edit. It now reconciles instead; see `reconcileTrackCourses` for how rows are
 * matched and why by title.
 *
 * Two things still make a half-finished run unreachable: it all happens in one transaction, and
 * `seed_version` is written LAST, so a failure leaves the track looking un-synced and the next
 * request retries — rather than stamping "done" over content that was never written.
 *
 * `force` is the admin "reset to defaults" path: reconcile even when the stamp already matches.
 * Note what that now means — a reset restores the seed's titles, bodies and ordering and removes
 * anything the CMS added, but a learner who completed a lesson that still exists keeps that
 * completion. Under the old behaviour a reset wiped the track's progress as a side effect nobody
 * asked for.
 *
 * Returns false when an up-to-date track was left alone.
 */
export async function applySeedTrack(
  track: SeedTrack,
  orderIndex: number,
  force = false,
): Promise<boolean> {
  const version = hashSeedTrack(track);

  /* The transaction reports what it destroyed rather than logging it: a rollback must
     not leave a log claiming that content which still exists was changed, so the line is
     emitted below, once the commit has actually happened. */
  const { replaced, counts } = await withTransaction(
    learningHubPool,
    async (client): Promise<{ replaced: boolean; counts: ReconcileCounts | null }> => {
      await lockForTransaction(client, `learning-hub:seed-track:${track.key}`);

      // Re-read under the lock: a concurrent cold start may have finished the rebuild while we
      // were queued on it, in which case there is nothing left to do.
      const existingRows = await sqlOn<QueryResultRow[]>(
        client,
        `SELECT id, seed_version FROM learning_tracks WHERE key = ?`,
        [track.key],
      );
      const existing = existingRows[0];
      if (existing && !force && String(existing.seed_version ?? '') === version)
        return { replaced: false, counts: null };

      let trackId: number;
      if (existing) {
        trackId = Number(existing.id);
        /* COALESCE, not a plain assignment: a seed track that does not set `tabLabelPrefix`
           leaves whatever is there alone. General Supply Chain's 'SC' was set by a backfill and
           that track is deliberately not in SEED_TRACKS — but if it is ever added without the
           field, an unguarded write would silently turn its levels back into plain titles. */
        await execOn(
          client,
          `UPDATE learning_tracks
              SET name = ?, description = ?, icon = ?, color = ?,
                  tab_label_prefix = COALESCE(?, tab_label_prefix),
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
          [
            track.name,
            track.description,
            track.icon,
            track.color,
            track.tabLabelPrefix ?? null,
            trackId,
          ],
        );
      } else {
        const inserted = await execOn(
          client,
          `INSERT INTO learning_tracks (key, name, description, icon, color, order_index, tab_label_prefix)
           VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
          [
            track.key,
            track.name,
            track.description,
            track.icon,
            track.color,
            orderIndex,
            track.tabLabelPrefix ?? null,
          ],
        );
        trackId = inserted.insertId;
      }

      const counts = await reconcileTrackCourses(client, trackId, track);

      await execOn(client, `UPDATE learning_tracks SET seed_version = ? WHERE id = ?`, [
        version,
        trackId,
      ]);
      return { replaced: true, counts };
    },
  );

  /* Reported after the commit, never before: a rollback must not leave a log claiming that
     content which still exists was changed. `progressLost` is the line that matters — it is the
     only record that somebody's completions were destroyed, and it should be zero for anything
     but a genuine removal from the seed. */
  if (counts) {
    log.info('seed.track.reconciled', {
      track: track.key,
      force,
      seedVersion: version.slice(0, 12),
      ...counts,
    });
  }
  return replaced;
}

// Runs on every cold start (cheap once synced, just one SELECT + hash comparison per track).
// A track whose code content hasn't changed since the last sync (seed_version matches) is left
// completely alone, so admin edits made through the CMS survive unrelated deploys. A track whose
// code content DID change (this is how a content push reaches production) is reconciled against
// SEED_TRACKS automatically, no manual "reset" needed — rows that still exist keep their ids, and
// with them every learner's progress.
// The batch SELECT here is only a fast path that keeps the steady state to a single query; the
// authoritative comparison happens again inside applySeedTrack(), under the lock.
async function syncSeedTracks(): Promise<void> {
  const existingTracks = await sql<QueryResultRow[]>(
    `SELECT key, seed_version FROM learning_tracks`,
  );
  const versionByKey = new Map(
    existingTracks.map((t) => [String(t.key), String(t.seed_version ?? '')]),
  );

  for (let trackIdx = 0; trackIdx < SEED_TRACKS.length; trackIdx++) {
    const track = SEED_TRACKS[trackIdx];
    if (versionByKey.get(track.key) === hashSeedTrack(track)) continue;
    /* A track whose code content changed is about to be reconciled. Only rows the seed no longer
       mentions are removed, so this is no longer the progress-destroying event it once was — but
       it is still the only record that a cold start changed published content. */
    log.info('seed.sync.trackStale', { track: track.key, known: versionByKey.has(track.key) });
    await applySeedTrack(track, trackIdx);
  }
}

/**
 * Assert the Learning Hub schema has been migrated, then make sure the code-defined seed content
 * is in the database.
 *
 * This keeps its name and its export because src/app/actions/learning-hub.ts calls it in eighteen
 * places. It is no longer a schema-creation function: the DDL moved to
 * database/migrations/learning-hub/001_baseline.sql. What remains is the migration check plus the
 * content sync, which is not schema and cannot move into a migration — SEED_TRACKS changes with
 * ordinary deploys, and the sync deliberately leaves admin CMS edits alone.
 */
export async function ensureLearningHubReady(): Promise<void> {
  await requireSchema(learningHubPool, DB_KEY, BASELINE);
  if (!seedPromise) {
    seedPromise = backfillTrackDefaults()
      .then(() => syncSeedTracks())
      .catch((err) => {
        // Don't let a failed cold-start attempt permanently wedge a warm serverless instance -
        // clear the cache so the next request gets a fresh try instead of the same cached rejection.
        seedPromise = null;
        throw err;
      });
  }
  await seedPromise;
}

/* ── Shared row shapes for aggregate queries ─────────────────────────── */

// (CountRow was the per-track/per-course aggregate row shape; those N+1 loops are now single
// GROUP BY queries whose rows are read straight off QueryResultRow.)

/* ── Lightweight title lookups (for page <title> metadata) ───────────────── */

export async function getTrackName(key: string): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT name FROM learning_tracks WHERE key = ?`, [
      key,
    ]);
    return (rows[0]?.name as string) ?? null;
  } catch {
    return null;
  }
}
export async function getCourseTitle(id: number): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT title FROM learning_courses WHERE id = ?`, [
      id,
    ]);
    return (rows[0]?.title as string) ?? null;
  } catch {
    return null;
  }
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
  } catch {
    return null;
  }
}
export async function getLessonTitle(id: number): Promise<string | null> {
  try {
    await ensureLearningHubReady();
    const rows = await sql<QueryResultRow[]>(`SELECT title FROM learning_lessons WHERE id = ?`, [
      id,
    ]);
    return (rows[0]?.title as string) ?? null;
  } catch {
    return null;
  }
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

  // One GROUP BY for EVERY track's counts, issued alongside the track list and the "continue"
  // lookup. This used to be 1 + 2N + 1 strictly sequential round trips (8 for four tracks); it is
  // now three concurrent ones. The LEFT JOIN chain reproduces the old numbers exactly: a published
  // course with no modules still counts toward course_count (as it did under the separate COUNT(*)),
  // and the lesson/completed counts still only see published courses.
  const [tracks, trackCountRows, continueRows] = await Promise.all([
    sql<LearningTrack[]>(`SELECT * FROM learning_tracks ORDER BY order_index ASC, id ASC`),
    sql<QueryResultRow[]>(
      `SELECT
         t.id AS track_id,
         COUNT(DISTINCT c.id)::int AS course_count,
         COUNT(DISTINCT l.id)::int AS lesson_count,
         COUNT(DISTINCT p.id)::int AS completed_count
       FROM learning_tracks t
       LEFT JOIN learning_courses c ON c.track_id = t.id AND c.status = 'published'
       LEFT JOIN learning_modules m ON m.course_id = c.id
       LEFT JOIN learning_lessons l ON l.module_id = m.id
       LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id AND p.user_email = ?
       GROUP BY t.id`,
      [userEmail],
    ),
    sql<QueryResultRow[]>(
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
    ),
  ]);

  const countsByTrack = new Map<number, QueryResultRow>();
  for (const row of trackCountRows) countsByTrack.set(Number(row.track_id), row);

  const tracksWithProgress: TrackWithProgress[] = [];
  let totalLessons = 0;
  let totalCompleted = 0;

  for (const track of tracks) {
    const counts = countsByTrack.get(Number(track.id));
    const lessonCount = Number(counts?.lesson_count ?? 0);
    const completedCount = Number(counts?.completed_count ?? 0);
    totalLessons += lessonCount;
    totalCompleted += completedCount;

    tracksWithProgress.push({
      ...track,
      course_count: Number(counts?.course_count ?? 0),
      lesson_count: lessonCount,
      completed_count: completedCount,
      progress_pct: progressPct(completedCount, lessonCount),
    });
  }

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

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [
    trackKey,
  ]);
  const track = tracks[0];
  if (!track) return null;

  // Course list + ONE GROUP BY covering every course's counts, in parallel (was 1 + N sequential).
  const [courses, courseCountRows] = await Promise.all([
    sql<LearningCourse[]>(
      `SELECT * FROM learning_courses WHERE track_id = ? AND status = 'published' ORDER BY order_index ASC, id ASC`,
      [track.id],
    ),
    sql<QueryResultRow[]>(
      `SELECT c.id AS course_id,
              COUNT(DISTINCT l.id)::int AS lesson_count,
              COUNT(DISTINCT p.id)::int AS completed_count
       FROM learning_courses c
       LEFT JOIN learning_modules m ON m.course_id = c.id
       LEFT JOIN learning_lessons l ON l.module_id = m.id
       LEFT JOIN learning_lesson_progress p ON p.lesson_id = l.id AND p.user_email = ?
       WHERE c.track_id = ? AND c.status = 'published'
       GROUP BY c.id`,
      [userEmail, track.id],
    ),
  ]);

  const countsByCourse = new Map<number, QueryResultRow>();
  for (const row of courseCountRows) countsByCourse.set(Number(row.course_id), row);

  const coursesWithProgress: CourseWithProgress[] = courses.map((course) => {
    const counts = countsByCourse.get(Number(course.id));
    const lessonCount = Number(counts?.lesson_count ?? 0);
    const completedCount = Number(counts?.completed_count ?? 0);
    return {
      ...course,
      lesson_count: lessonCount,
      completed_count: completedCount,
      progress_pct: progressPct(completedCount, lessonCount),
    };
  });

  return { track, courses: coursesWithProgress };
}

/* ── Quiz gating (lesson-level quizzes; must pass one to unlock the next lesson) ── */

// Fetch one course's lessons in presentation order, each with its quiz and this learner's result,
// and hand them to the gating fold. The ORDER BY is the load-bearing part on this side: the fold
// only knows "earlier" because the rows arrive in course order.
async function getCourseGating(
  courseId: number,
  userEmail: string,
): Promise<Map<number, LessonGate>> {
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
  return foldCourseGating(rows);
}

// The learner-facing quiz (no answer key).
async function loadLessonQuiz(quizId: number): Promise<LessonQuiz | null> {
  const quizRows = await sql<QueryResultRow[]>(
    `SELECT id, title, pass_pct FROM learning_quizzes WHERE id = ?`,
    [quizId],
  );
  if (!quizRows[0]) return null;
  const questions = await sql<QueryResultRow[]>(
    `SELECT id, question_text FROM learning_quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC, id ASC`,
    [quizId],
  );
  const qIds = questions.map((q) => Number(q.id));
  const options = qIds.length
    ? await sql<QueryResultRow[]>(
        `SELECT id, question_id, option_text FROM learning_quiz_options WHERE question_id = ANY(?) ORDER BY order_index ASC, id ASC`,
        [qIds],
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
    pass_pct: Number(quizRows[0].pass_pct ?? DEFAULT_QUIZ_PASS_PCT),
    questions: questions.map((q) => ({
      id: Number(q.id),
      text: String(q.question_text),
      options: optsByQ.get(Number(q.id)) ?? [],
    })),
  };
}

/* ── Course detail (modules + lessons outline) ───────────────────────── */

export async function getCourseDetail(
  trackKey: string,
  courseId: number,
): Promise<CourseDetailData | null> {
  const me = await learnerIdentity();
  if (!me) return null;
  const userEmail = me.email;
  await ensureLearningHubReady();

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [
    trackKey,
  ]);
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

  const moduleIds = modules.map((m) => m.id);

  // Completion, gating, module-quiz flags and EVERY module's lessons in one parallel batch: these
  // four reads only depend on the course/module ids, and the lesson query replaces the per-module
  // loop (was 3 + N sequential round trips for an N-module course).
  const [completedRows, gating, quizRows, lessonRows] = await Promise.all([
    sql<QueryResultRow[]>(
      `SELECT l.id AS lesson_id
       FROM learning_lessons l
       JOIN learning_modules m ON m.id = l.module_id
       JOIN learning_lesson_progress p ON p.lesson_id = l.id
       WHERE m.course_id = ? AND p.user_email = ?`,
      [course.id, userEmail],
    ),
    getCourseGating(course.id, userEmail),
    moduleIds.length
      ? sql<QueryResultRow[]>(`SELECT module_id FROM learning_quizzes WHERE module_id = ANY(?)`, [
          moduleIds,
        ])
      : Promise.resolve([] as QueryResultRow[]),
    moduleIds.length
      ? sql<LearningLesson[]>(
          `SELECT * FROM learning_lessons WHERE module_id = ANY(?) ORDER BY module_id ASC, order_index ASC, id ASC`,
          [moduleIds],
        )
      : Promise.resolve([] as LearningLesson[]),
  ]);

  const completedIds = new Set(completedRows.map((r) => Number(r.lesson_id)));
  const quizModuleIds = new Set(quizRows.map((r) => Number(r.module_id)));

  // Same per-module ordering as the old one-query-per-module loop (order_index ASC, id ASC).
  const lessonsByModule = new Map<number, LearningLesson[]>();
  for (const lesson of lessonRows) {
    const key = Number(lesson.module_id);
    const bucket = lessonsByModule.get(key);
    if (bucket) bucket.push(lesson);
    else lessonsByModule.set(key, [lesson]);
  }

  const moduleOutlines: ModuleOutline[] = [];
  let lessonCount = 0;
  let completedCount = 0;
  for (const mod of modules) {
    const lessons = lessonsByModule.get(Number(mod.id)) ?? [];
    const lessonsWithCompletion = lessons.map((l) => ({
      ...l,
      ...lessonProgressFlags(gating.get(l.id), completedIds.has(l.id)),
    }));
    lessonCount += lessons.length;
    completedCount += lessonsWithCompletion.filter((l) => l.completed).length;
    moduleOutlines.push({
      ...mod,
      lessons: lessonsWithCompletion,
      has_quiz: quizModuleIds.has(mod.id),
    });
  }

  return {
    track,
    course,
    modules: moduleOutlines,
    lesson_count: lessonCount,
    completed_count: completedCount,
    progress_pct: progressPct(completedCount, lessonCount),
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

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [
    trackKey,
  ]);
  const track = tracks[0];
  if (!track) return null;

  // A draft course's lessons are not readable by guessing the lesson id.
  const courses = await sql<LearningCourse[]>(
    `SELECT * FROM learning_courses WHERE id = ? AND track_id = ?${publishedFilter(me.isAdmin)}`,
    [courseId, track.id],
  );
  const course = courses[0];
  if (!course) return null;

  // The lesson list, this lesson's completion row and the course gating are independent of one
  // another; they used to be awaited one after the other (3 sequential round trips).
  const [lessons, completedRows, gating] = await Promise.all([
    sql<QueryResultRow[]>(
      `SELECT l.* FROM learning_lessons l
       JOIN learning_modules m ON m.id = l.module_id
       WHERE m.course_id = ?
       ORDER BY m.order_index ASC, m.id ASC, l.order_index ASC, l.id ASC`,
      [course.id],
    ),
    sql<QueryResultRow[]>(
      `SELECT id FROM learning_lesson_progress WHERE lesson_id = ? AND user_email = ?`,
      [lessonId, userEmail],
    ),
    getCourseGating(course.id, userEmail),
  ]);

  const idx = lessons.findIndex((l) => Number(l.id) === lessonId);
  if (idx < 0) return null;
  const lesson = lessons[idx] as unknown as LearningLesson;

  const prevRow = idx > 0 ? lessons[idx - 1] : null;
  const nextRow = idx < lessons.length - 1 ? lessons[idx + 1] : null;

  const g = gating.get(lessonId);
  const flags = lessonProgressFlags(g, completedRows.length > 0);
  const locked = flags.locked;
  const quizPassed = flags.quiz_passed;
  const passPct = g?.passPct ?? DEFAULT_QUIZ_PASS_PCT;
  const quiz = g?.hasQuiz && g.quizId != null && !locked ? await loadLessonQuiz(g.quizId) : null;
  const nextLocked = nextRow ? !!gating.get(Number(nextRow.id))?.locked : false;
  // Don't ship a locked lesson's body/video to the client.
  const visibleLesson = locked ? { ...lesson, body: '', video_url: null } : lesson;

  return {
    track,
    course,
    lesson: visibleLesson,
    completed: flags.completed,
    prev: prevRow
      ? { lesson_id: Number(prevRow.id), course_id: course.id, title: String(prevRow.title) }
      : null,
    next: nextRow
      ? { lesson_id: Number(nextRow.id), course_id: course.id, title: String(nextRow.title) }
      : null,
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
      progress_pct: progressPct(completedCount, lessonCount),
      last_activity_at: r.last_activity_at ? String(r.last_activity_at) : null,
    };
  });

  return bucketMyWorkCourses(courses);
}

/* ── Knowledge checks (one optional quiz per module) ─────────────────────
   Feedback-only: no gating on progress. The learner-facing shape withholds
   is_correct until submitQuizAttempt() grades the attempt server-side, so the
   answer key never ships to the client before the quiz is submitted. ── */

export async function loadModuleQuizRaw(moduleId: number): Promise<{
  quiz: QueryResultRow;
  questions: QueryResultRow[];
  optionsByQuestion: Map<number, QueryResultRow[]>;
} | null> {
  const quizzes = await sql<QueryResultRow[]>(
    `SELECT * FROM learning_quizzes WHERE module_id = ?`,
    [moduleId],
  );
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

  const tracks = await sql<LearningTrack[]>(`SELECT * FROM learning_tracks WHERE key = ?`, [
    trackKey,
  ]);
  const track = tracks[0];
  if (!track) return null;
  // A draft course's knowledge check is not readable by guessing the module id.
  const courses = await sql<LearningCourse[]>(
    `SELECT * FROM learning_courses WHERE id = ? AND track_id = ?${publishedFilter(me.isAdmin)}`,
    [courseId, track.id],
  );
  const course = courses[0];
  if (!course) return null;
  const modules = await sql<LearningModule[]>(
    `SELECT * FROM learning_modules WHERE id = ? AND course_id = ?`,
    [moduleId, course.id],
  );
  const mod = modules[0];
  if (!mod) return null;
  const quiz = await getModuleQuizForLearner(moduleId);
  if (!quiz) return null;
  return { track, course, module: mod, quiz };
}
