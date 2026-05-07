import type { Metadata } from 'next';
import { getAllShipments } from '@/app/actions/tite';
import ReportsClient from './ReportsClient';

export const metadata: Metadata = { title: 'Reports — TI-TE | SC Agents' };

export default async function ReportsPage() {
  const shipments = await getAllShipments();
  return <ReportsClient shipments={shipments} />;
}
