import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardDashboardData } from '@/app/actions/procureGuard';
import { canUseProcureGuardOperationalPages } from '@/lib/procureGuard-utils';
import ProcureGuardDashboardClient from './ProcureGuardDashboardClient';

export const metadata: Metadata = { title: 'NESR | ProcureGuard' };

export default async function ProcureGuardDashboardPage() {
  const actor = await getProcureGuardActor();
  if (!actor) redirect('/');
  if (!canUseProcureGuardOperationalPages(actor.permissions.accessView)) {
    redirect('/procure-guard/analytics');
  }
  const data = await getProcureGuardDashboardData();
  return <ProcureGuardDashboardClient data={data} />;
}
