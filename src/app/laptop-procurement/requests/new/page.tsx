import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopActor, getLaptopDeviceOptions } from '@/app/actions/laptopProcurement';
import { getProcureGuardUser } from '@/lib/auth';
import { canUseLaptopOperationalPages } from '@/lib/laptopProcurement-utils';
import LaptopRequestFormClient from './LaptopRequestFormClient';

export const metadata: Metadata = { title: 'NESR | New Request - Laptop Procurement' };

export default async function NewLaptopRequestPage() {
  const user = await getProcureGuardUser();
  const actor = await getLaptopActor();

  if (!actor || !canUseLaptopOperationalPages(actor.permissions.accessView)) {
    redirect('/laptop-procurement/analytics');
  }

  const devices = await getLaptopDeviceOptions();

  return (
    <LaptopRequestFormClient
      requesterName={user?.name ?? user?.email ?? ''}
      requesterEmail={user?.email ?? ''}
      accessView={actor.permissions.accessView}
      devices={devices}
    />
  );
}
