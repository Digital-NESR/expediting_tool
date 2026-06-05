import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardWorkQueueData } from '@/app/actions/procureGuard';
import { canUseProcureGuardReviewerQueue } from '@/lib/procureGuard-utils';
import MyWorkClient from './MyWorkClient';

export const metadata: Metadata = { title: 'My Work | ProcureGuard' };

export default async function MyWorkPage() {
  const actor = await getProcureGuardActor();
  if (actor && !canUseProcureGuardReviewerQueue(actor.permissions.accessView)) {
    redirect(actor.permissions.accessView === 'analyst' ? '/procure-guard/analytics' : '/procure-guard');
  }
  const data = await getProcureGuardWorkQueueData();
  return <MyWorkClient data={data} />;
}
