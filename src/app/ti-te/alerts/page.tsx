import type { Metadata } from 'next';
import { getAllShipments } from '@/app/actions/tite';
import AlertsClient from './AlertsClient';

export const metadata: Metadata = { title: 'Alerts — TI-TE | SC Agents' };

export default async function AlertsPage() {
  const shipments = await getAllShipments();
  return <AlertsClient shipments={shipments} />;
}
