import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdvancePaymentRequestsData, getProcureGuardActor } from '@/app/actions/procureGuard';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import AdvancePaymentsStatusClient from './AdvancePaymentsStatusClient';
import RefreshOnView from '../components/RefreshOnView';

export const metadata: Metadata = { title: 'NESR | Advance Payments - ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function AdvancePaymentsStatusPage() {
  const actor = await getProcureGuardActor();
  if (!actor) redirect('/');
  if (!canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  const data = await getAdvancePaymentRequestsData();
  return <><RefreshOnView /><AdvancePaymentsStatusClient data={data} /></>;
}
