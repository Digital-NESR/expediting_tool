'use server';

/* ─── The cross-shipment recent-activity feed. ─── */

import titePool from '@/lib/db-tite';
import { currentTiteUser, isTiteApproved, titeReadScope } from '@/lib/tite-auth';
import { ensureTiteSchema } from '@/lib/tite-documents';
import { log } from '@/lib/tite/internals';
import type { RecentActivityRow } from '@/lib/tite/types';

/**
 * The caller's own recent activity. The identity is the session's, not a parameter.
 *
 * Keyed on `performed_by_email`, not the free-text display name: a rename in Azure
 * AD used to empty a user's feed, and two colleagues with the same display name
 * saw each other's rows. Rows written before the column existed carry a NULL email
 * — those still match on the display name so existing history does not vanish, and
 * that fallback can be dropped once the backfill below has run:
 *
 *   UPDATE shipment_activity_log sal
 *      SET performed_by_email = LOWER(ar.user_email)
 *     FROM access_requests ar
 *    WHERE sal.performed_by_email IS NULL
 *      AND LOWER(TRIM(sal.performed_by)) = LOWER(TRIM(ar.display_name));
 */
export async function getRecentActivity(days: number = 7): Promise<RecentActivityRow[]> {
  const user = await currentTiteUser();
  if (!isTiteApproved(user)) return [];
  try {
    await ensureTiteSchema();
    const userName = user.name;
    const { rows } = await titePool.query<RecentActivityRow>(
      `SELECT
         sal.id,
         sal.shipment_id,
         sal.action,
         sal.details,
         sal.performed_by,
         sal.performed_at::text AS performed_at,
         s.reference_number,
         s.description,
         s.country
       FROM shipment_activity_log sal
       JOIN shipments s ON s.id = sal.shipment_id
       WHERE (
               sal.performed_by_email = $1
               OR (sal.performed_by_email IS NULL AND sal.performed_by = $2)
             )
         AND sal.performed_at >= NOW() - ($3 || ' days')::INTERVAL
         ${titeReadScope(user) === null ? '' : 'AND s.country = ANY($4::text[])'}
       ORDER BY sal.performed_at DESC
       LIMIT 20`,
      titeReadScope(user) === null
        ? [user.email, userName, days]
        : [user.email, userName, days, titeReadScope(user)],
    );
    return rows;
  } catch (err) {
    log.error('getRecentActivity.failed', err);
    return [];
  }
}
