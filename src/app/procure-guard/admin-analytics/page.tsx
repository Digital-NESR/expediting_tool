import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardAdminAnalyticsData } from '@/app/actions/procureGuard';
import { canUseProcureGuardAdmin } from '@/lib/procureGuard-utils';
import AdminAnalyticsClient from './AdminAnalyticsClient';

export const metadata: Metadata = { title: 'Admin Analytics | ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const actor = await getProcureGuardActor();
  if (actor && !canUseProcureGuardAdmin(actor.permissions.accessView)) {
    redirect(actor.permissions.accessView === 'analyst' ? '/procure-guard/analytics' : '/procure-guard');
  }
  const data = await getProcureGuardAdminAnalyticsData();
  return <AdminAnalyticsClient data={data} />;
}
