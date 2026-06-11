import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdhocPaymentsData, getProcureGuardActor } from '@/app/actions/procureGuard';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import AdhocPaymentsStatusClient from './AdhocPaymentsStatusClient';

export const metadata: Metadata = { title: 'Adhoc PO Status | ProcureGuard' };

export default async function AdhocPaymentsStatusPage() {
  const actor = await getProcureGuardActor();
  if (actor && !canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  const data = await getAdhocPaymentsData();
  return <AdhocPaymentsStatusClient data={data} />;
}
