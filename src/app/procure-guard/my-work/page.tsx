import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardWorkQueueData } from '@/app/actions/procureGuard';
import { canUseProcureGuardReviewerQueue } from '@/lib/procureGuard-utils';
import MyWorkClient from './MyWorkClient';
import RefreshOnView from '../components/RefreshOnView';

export const metadata: Metadata = { title: 'NESR | My Work - ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function MyWorkPage() {
  const actor = await getProcureGuardActor();
  if (!actor) redirect('/');
  if (!canUseProcureGuardReviewerQueue(actor.permissions.accessView)) {
    redirect(actor.permissions.accessView === 'analyst' ? '/procure-guard/analytics' : '/procure-guard');
  }
  const data = await getProcureGuardWorkQueueData();
  return <><RefreshOnView /><MyWorkClient data={data} /></>;
}
