'use server';

/**
 * The released-PR type-ahead behind the requisition field on the adhoc form.
 *
 * Every export of a `'use server'` file is a public POST endpoint, so the actor is resolved and
 * the access guard runs as the FIRST statement, the same as every other ProcureGuard action. The
 * rows are another team's procurement pipeline (what NESR is buying, from whom, for which
 * country) and are not for anyone who happens to find the endpoint.
 */
import { getActor, requireProcureGuardOperationalAccess } from '@/lib/procure-guard/actor';
import { searchReleasedPrs, type ReleasedPrOption } from '@/lib/procure-guard/released-prs';

export async function searchReleasedPurchaseRequisitions(
  query: string,
  country?: string | null,
): Promise<ReleasedPrOption[]> {
  requireProcureGuardOperationalAccess(await getActor());
  return searchReleasedPrs(query, country);
}
