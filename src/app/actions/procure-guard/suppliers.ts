'use server';

/**
 * The existing-supplier type-ahead on the adhoc form.
 *
 * Every export of a `'use server'` file is a public POST endpoint, so the actor is resolved and
 * the operational access guard runs as the FIRST statement, the same as every other ProcureGuard
 * action. This returns the vendor master: who NESR buys from, their contact address, and which
 * of them SAP has blocked. That is not for anyone who happens to find the endpoint.
 */
import { getActor, requireProcureGuardOperationalAccess } from '@/lib/procure-guard/actor';
import { searchAvlSuppliers, type AvlSupplierOption } from '@/lib/procure-guard/avl-suppliers';

export async function searchExistingSuppliers(query: string): Promise<AvlSupplierOption[]> {
  requireProcureGuardOperationalAccess(await getActor());
  return searchAvlSuppliers(query);
}
