'use server';

/**
 * What the Purchase Orders boards call when the filter bar changes.
 *
 * Every export of a `'use server'` module is a public POST endpoint, so each one re-checks the
 * reader here rather than trusting the page that rendered the component. The boards are
 * platform-admin only — company-wide purchasing data with no country scoping of its own — so
 * that is the single gate, and an unauthorised call gets `null` rather than an error: the
 * client renders its "unavailable" card either way, and a 403 would tell a prober that the
 * data exists.
 *
 * The filter payload arrives from a browser and is narrowed by `coerceFilters` before it
 * reaches any query; nothing from the caller is ever interpolated into SQL.
 */

import { currentActor } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { coerceFilters } from '@/lib/purchase-orders/filters';
import { loadPurchaseOrderAnalytics } from '@/lib/purchase-orders/queries';
import { loadPastDueAnalysis } from '@/lib/purchase-orders/past-due';
import type { PurchaseOrderAnalytics } from '@/lib/purchase-orders/queries';
import type { PastDueAnalysis } from '@/lib/purchase-orders/past-due';

const log = logger('purchase-orders-actions');

async function isAdmin(): Promise<boolean> {
  const actor = await currentActor();
  return Boolean(actor?.isPlatformAdmin);
}

export async function fetchPurchaseOrderAnalytics(
  rawFilters: unknown,
): Promise<PurchaseOrderAnalytics | null> {
  if (!(await isAdmin())) return null;
  try {
    return await loadPurchaseOrderAnalytics(coerceFilters(rawFilters));
  } catch (err) {
    log.error('overview.failed', err);
    return null;
  }
}

export async function fetchPastDueAnalysis(rawFilters: unknown): Promise<PastDueAnalysis | null> {
  if (!(await isAdmin())) return null;
  try {
    return await loadPastDueAnalysis(coerceFilters(rawFilters));
  } catch (err) {
    log.error('past-due.failed', err);
    return null;
  }
}
