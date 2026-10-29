'use server';

/**
 * One traveller's history, for their own page.
 *
 * Its own file rather than another export in `travel-analytics.ts`, because the page is a
 * server component that calls this directly and the board's own actions are all client-invoked.
 * Keeping them apart means the board's bundle does not reach for a query it never runs.
 *
 * This is a public POST endpoint like every other `'use server'` export, so the actor and the
 * scope resolve first. The scope is then handed to the query, which filters the person's trips
 * to the reader's countries: a country reader opening a colleague who also flies elsewhere sees
 * the part of that history they are entitled to and no more.
 */
import { requireUser } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { travelScopeFor } from '@/lib/travel-analytics/grants';
import { loadTravellerProfile, type TravellerProfile } from '@/lib/travel-analytics/queries';

const log = logger('travel-analytics-traveller');

export async function getTravellerProfile(employeeId: string): Promise<TravellerProfile | null> {
  const actor = await requireUser();
  const scope = await travelScopeFor(actor.email);
  if (!scope) return null;

  try {
    return await loadTravellerProfile(scope, employeeId);
  } catch (err) {
    log.error('getTravellerProfile.failed', err, { employeeId });
    return null;
  }
}
