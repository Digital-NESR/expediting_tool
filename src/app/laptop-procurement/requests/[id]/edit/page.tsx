import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLaptopActor, getLaptopDeviceOptions, getLaptopRequestDetail } from '@/app/actions/laptopProcurement';
import { getProcureGuardUser } from '@/lib/auth';
import { canUseLaptopOperationalPages } from '@/lib/laptopProcurement-utils';
import LaptopRequestFormClient from '../../new/LaptopRequestFormClient';

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'Edit Request | Laptop Procurement' };
export const dynamic = 'force-dynamic';

export default async function EditLaptopRequestPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const user = await getProcureGuardUser();
  const actor = await getLaptopActor();
  if (!actor || !canUseLaptopOperationalPages(actor.permissions.accessView)) {
    redirect('/laptop-procurement/analytics');
  }

  const [data, devices] = await Promise.all([getLaptopRequestDetail(numericId), getLaptopDeviceOptions()]);
  if (!data) notFound();

  return (
    <LaptopRequestFormClient
      requesterName={user?.name ?? user?.email ?? ''}
      requesterEmail={user?.email ?? ''}
      accessView={actor.permissions.accessView}
      devices={devices}
      editRequest={data.request}
    />
  );
}
