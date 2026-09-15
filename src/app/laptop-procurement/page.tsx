import type { Metadata } from 'next';
import { getLaptopDashboardData } from '@/app/actions/laptopProcurement';
import LaptopDashboardClient from './LaptopDashboardClient';

export const metadata: Metadata = { title: 'NESR | Laptop Procurement' };

export default async function LaptopProcurementDashboardPage() {
  const data = await getLaptopDashboardData();
  return <LaptopDashboardClient data={data} />;
}
