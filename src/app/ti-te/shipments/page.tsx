import type { Metadata } from 'next';
import { getAllShipments } from '@/app/actions/tite';
import ShipmentsClient from './ShipmentsClient';

export const metadata: Metadata = { title: 'Shipments — TI-TE | SC Agents' };

export default async function ShipmentsPage() {
  const shipments = await getAllShipments();
  return <ShipmentsClient shipments={shipments} />;
}
