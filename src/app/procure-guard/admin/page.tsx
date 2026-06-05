import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getProcureGuardActor, getProcureGuardAdminData } from '@/app/actions/procureGuard';
import { canUseProcureGuardAdmin } from '@/lib/procureGuard-utils';
import AdminPanelClient from './AdminPanelClient';

export const metadata: Metadata = { title: 'Admin Panel | ProcureGuard' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const actor = await getProcureGuardActor();
  if (actor && !canUseProcureGuardAdmin(actor.permissions.accessView)) {
    redirect(actor.permissions.accessView === 'analyst' ? '/procure-guard/analytics' : '/procure-guard');
  }
  const data = await getProcureGuardAdminData();
  return <AdminPanelClient data={data} />;
}
