/* ─── The audit trail. Every mutation writes one row here, and a failure to log must never fail
   the mutation it describes, which is what logSafe is for. ─── */

import sourceGuidePool from '@/lib/db-sourceguide';
import { SgUser, getSgUser } from '@/lib/sourceguide/access';
import { log } from '@/lib/sourceguide/internals';

export async function logActivity(
  country: string | null,
  commodityId: number | null,
  action: string,
  details: string,
  by: string,
  byEmail: string | null = null,
): Promise<void> {
  await sourceGuidePool.query(
    `INSERT INTO sg_activity_log (country_code, commodity_id, action, details, performed_by, performed_by_email)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [country, commodityId, action, details, by, byEmail],
  );
}

/** Best-effort audit log: never let a logging failure break the underlying mutation. */
export async function logSafe(
  country: string | null,
  commodityId: number | null,
  action: string,
  details: string,
  by: string | null,
  byEmail: string | null = null,
): Promise<void> {
  try {
    await logActivity(country, commodityId, action, details, by ?? 'System', byEmail);
  } catch (err) {
    log.error('logSafe.failed', err);
  }
}

/**
 * Best-effort usage log for read paths (page views + searches). Never throws;
 * skips anonymous. Callers that already resolved the user pass it in as `known`
 * so the session is not read twice; the log write itself is fire-and-forget, so
 * the page no longer waits on a round trip it does not use.
 */
export async function logUsage(
  eventType: 'view' | 'search',
  target: string,
  label: string | null,
  ref: string | null,
  known?: SgUser | null,
): Promise<void> {
  try {
    const u = known ?? (await getSgUser());
    if (!u) return;
    await sourceGuidePool.query(
      `INSERT INTO sg_usage_log (user_email, user_name, event_type, target, label, ref)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [u.email, u.name, eventType, target, label, ref],
    );
  } catch (err) {
    log.error('logUsage.failed', err);
  }
}
