import type { Metadata } from 'next';
import { getShipmentById } from '@/app/actions/tite';
import ShipmentDetailClient from './ShipmentDetailClient';

export const metadata: Metadata = { title: 'Shipment Detail — TI-TE | SC Agents' };

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const shipment = await getShipmentById(Number(id));
  return <ShipmentDetailClient shipment={shipment} rawId={id} />;
}
