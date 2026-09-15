import type { Metadata } from 'next';
import { getLaptopRequestsData } from '@/app/actions/laptopProcurement';
import LaptopRequestsClient from './LaptopRequestsClient';

export const metadata: Metadata = { title: 'NESR | Requests - Laptop Procurement' };

export default async function LaptopRequestsPage() {
  const data = await getLaptopRequestsData();
  return <LaptopRequestsClient data={data} />;
}
