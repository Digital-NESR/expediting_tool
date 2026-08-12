import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllShipments, getRecentActivity } from '@/app/actions/tite';
import TiteDashboardClient from './TiteDashboardClient';
import type { ShipmentStats } from '@/types/tite';

export const metadata: Metadata = { title: 'NESR | TI-TE' };

export default async function TiteDashboardPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email ?? '';
  const userName = session?.user?.name ?? '';
  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());

  const titeApprovedCountries = session?.user?.toolAccess?.tite?.approvedCountries ?? [];
  const titeViewOnly =
    session?.user?.titeViewOnly === true ||
    titeApprovedCountries.includes('All Countries - View Only');

  const approvedCountries = (isAdmin || titeViewOnly)
    ? undefined
    : titeApprovedCountries;

  const [shipments, recentActivity] = await Promise.all([
    getAllShipments(approvedCountries),
    getRecentActivity(userName, 7),
  ]);

  // Derive stats from the same shipments array so KPI cards and the compliance
  // donut always agree.  getAllShipments() already recalculates alert_level from
  // (extended_date ?? expiry_date) – today, so these counts reflect real-time
  // urgency rather than the stale stored alert_level column.
  let stats: ShipmentStats | null = null;
  if (shipments) {
    const open = shipments.filter(
      s => s.status === 'Open' || s.status === 'Open - Extended',
    );
    stats = {
      active_count:      open.length,
      overdue_count:     open.filter(s => s.alert_level === 'overdue').length,
      urgent_count:      open.filter(s => s.alert_level === 'urgent').length,
      action_count:      open.filter(s => s.alert_level === 'action' || s.alert_level === 'plan').length,
      total_deposit_usd: open.reduce((sum, s) => sum + (Number(s.deposit_usd) || 0), 0),
      import_count:      open.filter(s => (s.movement_type || '').toLowerCase().includes('import')).length,
      export_count:      open.filter(s => (s.movement_type || '').toLowerCase().includes('export')).length,
    };
  }

  return <TiteDashboardClient stats={stats} shipments={shipments} recentActivity={recentActivity} viewOnly={titeViewOnly} />;
}
