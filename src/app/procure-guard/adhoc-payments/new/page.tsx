import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor } from '@/app/actions/procureGuard';
import { getProcureGuardUser } from '@/lib/auth';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import AdhocPaymentFormClient from './AdhocPaymentFormClient';

export const metadata: Metadata = { title: 'NESR | New Adhoc PO - ProcureGuard' };

export default async function NewAdhocPaymentPage() {
  const user = await getProcureGuardUser();
  const actor = await getProcureGuardActor();

  if (!actor || !canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  if (!actor.permissions.canCreateRequests) {
    redirect('/procure-guard/adhoc-payments');
  }

  return (
    <AdhocPaymentFormClient
      requesterName={user?.name ?? user?.email ?? ''}
      requesterEmail={user?.email ?? ''}
      defaultDepartment={user?.department ?? ''}
      accessView={actor.permissions.accessView}
    />
  );
}
