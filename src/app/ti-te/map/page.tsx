import type { Metadata } from 'next';
import { getAllShipments } from '@/app/actions/tite';
import MapClient from './MapClient';

export const metadata: Metadata = { title: 'Map View — TI-TE | SC Agents' };

export default async function MapPage() {
  const shipments = await getAllShipments();
  return <MapClient shipments={shipments} />;
}
