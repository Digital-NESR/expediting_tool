import type { Metadata } from 'next';
import { getAllShipments, getShipmentStats } from '@/app/actions/tite';
import TiteDashboardClient from './TiteDashboardClient';

export const metadata: Metadata = { title: 'Dashboard — TI-TE | SC Agents' };

export default async function TiteDashboardPage() {
  const [stats, shipments] = await Promise.all([
    getShipmentStats(),
    getAllShipments(),
  ]);
  return <TiteDashboardClient stats={stats} shipments={shipments} />;
}
