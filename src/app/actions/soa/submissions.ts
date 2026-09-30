'use server';

import { logger } from '@/lib/logger';
import { AccessError } from '@/lib/require-access';
import { requireSoaCountry } from '@/lib/soa/access';
import { loadSubmissionsFor, type SubmissionView } from '@/lib/soa/submission-read';

/**
 * Reading a returned statement.
 *
 * Every export of a `'use server'` module is a public POST endpoint. An entry id arrives from the
 * browser and is not a capability, so the country that owns it is looked up first and the caller
 * is checked against that country. Otherwise a viewer of Oman could read Saudi Arabia's supplier
 * invoice numbers and balances by guessing an integer.
 */

const log = logger('soa-submissions');

export type SoaResult<T = undefined> = { success: boolean; error?: string; data?: T };

/** Statements on file for one vendor entry, newest first, with their parsed rows. */
export async function getSoaSubmissions(entryId: number): Promise<SoaResult<SubmissionView[]>> {
  try {
    const found = await loadSubmissionsFor(entryId);
    if (!found) return { success: false, error: 'No such vendor entry.' };

    // Reading is enough; accepting and rejecting are champion acts and live elsewhere.
    await requireSoaCountry(found.countryId, 'viewer');
    return { success: true, data: found.submissions };
  } catch (err) {
    log.error('getSoaSubmissions.failed', err, { entryId });
    return {
      success: false,
      error: err instanceof AccessError ? err.message : 'Could not read that statement.',
    };
  }
}
