import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdhocPaymentsData, getProcureGuardActor } from '@/app/actions/procureGuard';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import AdhocPaymentsStatusClient from './AdhocPaymentsStatusClient';
import RefreshOnView from '../components/RefreshOnView';

export const metadata: Metadata = { title: 'NESR | Adhoc PO Status - ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function AdhocPaymentsStatusPage() {
  const actor = await getProcureGuardActor();
  if (!actor) redirect('/');
  if (!canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  const data = await getAdhocPaymentsData();
  return <><RefreshOnView /><AdhocPaymentsStatusClient data={data} /></>;
}
