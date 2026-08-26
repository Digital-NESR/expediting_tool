import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardDashboardData } from '@/app/actions/procureGuard';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import ProcureGuardDashboardClient from './ProcureGuardDashboardClient';
import RefreshOnView from './components/RefreshOnView';

export const metadata: Metadata = { title: 'NESR | ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function ProcureGuardDashboardPage() {
  const actor = await getProcureGuardActor();
  if (!actor) redirect('/');
  if (!canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  const data = await getProcureGuardDashboardData();
  return <><RefreshOnView /><ProcureGuardDashboardClient data={data} /></>;
}
