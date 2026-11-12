import type { QueryResultRow } from 'pg';
import { createSqlHelpers, type SqlHelpers } from '@/lib/db/sql';
import { lockForTransaction, withTransaction } from '@/lib/db/tx';
import { logger } from '@/lib/logger';
import { icsaPool } from './db';

const log = logger('icsa-lifecycle');

/** "Today" in SQL, as a Dubai calendar date. Deadlines are inclusive whole days there. */
export const TODAY_SQL = `(NOW() AT TIME ZONE 'Asia/Dubai')::date`;

/** Forms still waiting on the respondent; these become not_completed when a country closes. */
const OUTSTANDING = `('requested', 'in_progress', 'returned')`;

/** Mark every outstanding form in these enrollments as not completed. */
export async function markOutstandingNotCompleted(
  sql: SqlHelpers['sql'],
  enrollmentIds: number[],
): Promise<void> {
  if (!enrollmentIds.length) return;
  await sql(
    `UPDATE icsa_assessments SET status = 'not_completed', updated_at = NOW()
      WHERE enrollment_id = ANY(?::bigint[]) AND status IN ${OUTSTANDING}`,
    [enrollmentIds],
  );
}

export async function logEvent(
  sql: SqlHelpers['sql'],
  e: {
    actor: string;
    action: string;
    cycleId?: number | null;
    enrollmentId?: number | null;
    assessmentId?: number | null;
    detail?: Record<string, unknown>;
  },
): Promise<void> {
  await sql(
    `INSERT INTO icsa_events (cycle_id, enrollment_id, assessment_id, actor, action, detail)
     VALUES (?, ?, ?, ?, ?, ?::jsonb)`,
    [
      e.cycleId ?? null,
      e.enrollmentId ?? null,
      e.assessmentId ?? null,
      e.actor,
      e.action,
      JSON.stringify(e.detail ?? {}),
    ],
  );
}

let lastSweep = 0;

/**
 * Enforce deadlines. There is no scheduler: this runs at the top of the ICSA reads, at most once a
 * minute per server instance, and does two things.
 *
 *   1. A country whose deadline (the cycle's, or an approved extension's) has passed while still
 *      open is force-closed, and everybody who had not submitted is marked not completed, which
 *      is how they count against the threshold.
 *   2. A cycle past its own deadline with no country left open is closed.
 *
 * Failures are logged, never thrown: a page should still render if the sweep could not run.
 */
export async function sweepOverdue(force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - lastSweep < 60_000) return;
  lastSweep = now;
  try {
    await withTransaction(icsaPool, async (client) => {
      await lockForTransaction(client, 'icsa:sweep');
      const { sql } = createSqlHelpers(client);
      const closed = await sql<QueryResultRow[]>(
        `UPDATE icsa_enrollments
            SET status = 'force_closed', closed_at = NOW(), closed_by = 'system',
                close_note = 'The deadline passed without an extension.'
          WHERE status = 'open' AND deadline < ${TODAY_SQL}
          RETURNING id, cycle_id, country`,
      );
      const ids = closed.map((r) => Number(r.id));
      await markOutstandingNotCompleted(sql, ids);
      for (const r of closed) {
        await logEvent(sql, {
          actor: 'system',
          action: 'enrollment.force_closed',
          cycleId: Number(r.cycle_id),
          enrollmentId: Number(r.id),
          detail: { country: r.country },
        });
      }
      const cycles = await sql<QueryResultRow[]>(
        `UPDATE icsa_cycles c
            SET status = 'closed', closed_at = NOW(), closed_by = 'system',
                close_reason = 'The deadline passed.'
          WHERE c.status = 'open' AND c.deadline < ${TODAY_SQL}
            AND NOT EXISTS (SELECT 1 FROM icsa_enrollments e WHERE e.cycle_id = c.id AND e.status = 'open')
          RETURNING id`,
      );
      for (const r of cycles) {
        await logEvent(sql, { actor: 'system', action: 'cycle.closed', cycleId: Number(r.id) });
      }
      if (closed.length || cycles.length) {
        log.info('sweep', { enrollments: closed.length, cycles: cycles.length });
      }
    });
  } catch (err) {
    lastSweep = 0;
    log.error('sweep.failed', err);
  }
}
