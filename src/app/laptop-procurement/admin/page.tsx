import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopAdminData } from '@/app/actions/laptopProcurement';
import { canUseLaptopAdmin } from '@/lib/laptopProcurement-utils';
import LaptopAdminClient from './LaptopAdminClient';

export const metadata: Metadata = { title: 'NESR | Admin - Laptop Procurement' };

export default async function LaptopAdminPage() {
  const actor = await getLaptopActor();
  if (!actor || !canUseLaptopAdmin(actor.permissions.accessView)) {
    redirect('/laptop-procurement');
  }
  const data = await getLaptopAdminData();
  return <LaptopAdminClient data={data} />;
}
