import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardDelegationData } from '@/app/actions/procureGuard';
import { canUseProcureGuardReviewerQueue } from '@/lib/procureGuard-utils';
import ProcureGuardDelegateClient from './ProcureGuardDelegateClient';

export const metadata: Metadata = { title: 'NESR | Delegation - ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function ProcureGuardDelegatePage() {
  const data = await getProcureGuardDelegationData();
  if (!data) redirect('/procure-guard');
  // Only approvers (or someone currently holding delegated authority) have anything to do here.
  if (!canUseProcureGuardReviewerQueue(data.actor.permissions.accessView)) redirect('/procure-guard');
  return <ProcureGuardDelegateClient data={data} />;
}
