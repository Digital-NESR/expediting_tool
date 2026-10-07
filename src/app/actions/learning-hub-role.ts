'use server';

/**
 * The role a learner picks for themselves, and which the hub then curates for.
 *
 * Every export in a `'use server'` file is a public POST endpoint, so the learner is taken from the
 * session and never from an argument — otherwise anybody could set a colleague's path. The role key
 * is checked against the guide in code before it is stored, which is also what stops this table
 * accepting arbitrary strings.
 */
import type { QueryResultRow } from 'pg';
import { AccessError, currentActor, normalizeEmail } from '@/lib/require-access';
import learningHubPool from '@/lib/db-learning-hub';
import { logger } from '@/lib/logger';
import { requireSchema } from '@/lib/db/schema-version';
import { sql, exec, ensureLearningHubReady } from '@/lib/learning-hub-queries';
import { guideForTrack, roleByKey } from '@/lib/learning-hub-guide';

const log = logger('learning-hub-role');

const ROLE_MIGRATION = '005_learner_role';

async function ready(): Promise<void> {
  await ensureLearningHubReady();
  await requireSchema(learningHubPool, 'learning-hub', ROLE_MIGRATION);
}

async function email(): Promise<string | null> {
  const actor = await currentActor();
  return actor ? normalizeEmail(actor.email) : null;
}

/**
 * This learner's chosen role for a module, or null.
 *
 * Null covers three different things that all mean the same on screen — no choice made, a choice
 * naming a role the guide has since dropped, and a database that has not had migration 005. All
 * three land the learner on the uncurated list with the picker offered, which is the right place
 * to be in every one of them.
 */
export async function getLearnerRole(trackKey: string): Promise<string | null> {
  try {
    const me = await email();
    if (!me) return null;
    const guide = guideForTrack(trackKey);
    if (!guide) return null;
    await ready();
    const rows = await sql<QueryResultRow[]>(
      `SELECT role_key FROM learning_learner_roles WHERE user_email = ? AND track_key = ?`,
      [me, trackKey],
    );
    const key = rows[0]?.role_key ? String(rows[0].role_key) : null;
    return roleByKey(guide, key) ? key : null;
  } catch (err) {
    log.error('role.load.failed', err);
    return null;
  }
}

/** Store a choice. Re-picking the same role is a no-op apart from the timestamp. */
export async function setLearnerRole(
  trackKey: string,
  roleKey: string,
): Promise<{ saved: boolean }> {
  const me = await email();
  if (!me) throw new AccessError('Sign in required.', 401);
  const guide = guideForTrack(trackKey);
  if (!guide) throw new AccessError('That module has no guide.', 404);
  if (!roleByKey(guide, roleKey)) throw new AccessError('No such role.', 400);
  await ready();
  await exec(
    `INSERT INTO learning_learner_roles (user_email, track_key, role_key)
     VALUES (?, ?, ?)
     ON CONFLICT (user_email, track_key) DO UPDATE SET
       role_key = EXCLUDED.role_key,
       updated_at = NOW()`,
    [me, trackKey, roleKey],
  );
  return { saved: true };
}

/** Go back to seeing everything. Deleting the row, not blanking it: there is no "no role" role. */
export async function clearLearnerRole(trackKey: string): Promise<{ cleared: boolean }> {
  const me = await email();
  if (!me) throw new AccessError('Sign in required.', 401);
  await ready();
  await exec(`DELETE FROM learning_learner_roles WHERE user_email = ? AND track_key = ?`, [
    me,
    trackKey,
  ]);
  return { cleared: true };
}

/**
 * How learners describe themselves, for the admin side.
 *
 * Worth having because it is the only self-reported thing the hub holds: everything else is
 * inferred from what people clicked. It says who the audience actually is, which is a different
 * question from who the programme was written for.
 */
export async function getLearnerRoleCounts(
  trackKey: string,
): Promise<{ roleKey: string; label: string; learners: number }[]> {
  try {
    const actor = await currentActor();
    if (!actor?.isPlatformAdmin) return [];
    const guide = guideForTrack(trackKey);
    if (!guide) return [];
    await ready();
    const rows = await sql<QueryResultRow[]>(
      `SELECT role_key, COUNT(*)::int AS learners
         FROM learning_learner_roles
        WHERE track_key = ?
        GROUP BY role_key`,
      [trackKey],
    );
    const counts = new Map(rows.map((r) => [String(r.role_key), Number(r.learners)]));
    return guide.roles
      .map((r) => ({ roleKey: r.key, label: r.role, learners: counts.get(r.key) ?? 0 }))
      .sort((a, b) => b.learners - a.learners);
  } catch (err) {
    log.error('role.counts.failed', err);
    return [];
  }
}
