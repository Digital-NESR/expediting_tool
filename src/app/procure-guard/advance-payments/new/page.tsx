import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor } from '@/app/actions/procureGuard';
import { getProcureGuardUser } from '@/lib/auth';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import AdvancePaymentFormClient from './AdvancePaymentFormClient';

export const metadata: Metadata = { title: 'New Advance Payment Request | ProcureGuard' };

export default async function NewAdvancePaymentPage() {
  const user = await getProcureGuardUser();
  const actor = await getProcureGuardActor();

  if (!actor || !canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  if (!actor.permissions.canCreateRequests) {
    redirect('/procure-guard/advance-payments');
  }

  return (
    <AdvancePaymentFormClient
      requesterName={user?.name ?? user?.email ?? ''}
      requesterEmail={user?.email ?? ''}
      defaultDepartment={user?.department ?? ''}
      accessView={actor.permissions.accessView}
    />
  );
}
