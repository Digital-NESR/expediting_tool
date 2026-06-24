import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardAnalyticsData } from '@/app/actions/procureGuard';
import { canUseProcureGuardAnalytics } from '@/lib/procureGuard-utils';
import AnalyticsClient from './AnalyticsClient';

export const metadata: Metadata = { title: 'Analytics | ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function AnalyticsPage() {
  const actor = await getProcureGuardActor();
  if (!actor) redirect('/');
  if (!canUseProcureGuardAnalytics(actor.permissions.accessView)) {
    redirect('/procure-guard');
  }
  const data = await getProcureGuardAnalyticsData();
  return <AnalyticsClient data={data} />;
}
