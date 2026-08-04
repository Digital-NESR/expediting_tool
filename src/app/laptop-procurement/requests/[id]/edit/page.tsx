import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getLaptopActor, getLaptopRequestDetail } from '@/app/actions/laptopProcurement';
import { getProcureGuardUser } from '@/lib/auth';
import { canUseLaptopOperationalPages } from '@/lib/laptopProcurement-utils';
import LaptopRequestFormClient from '../../new/LaptopRequestFormClient';

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: 'NESR | Edit Request - Laptop Procurement' };
export const dynamic = 'force-dynamic';

export default async function EditLaptopRequestPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const user = await getProcureGuardUser();
  const actor = await getLaptopActor();
  if (!actor || !canUseLaptopOperationalPages(actor.effectiveAccessView)) {
    redirect('/laptop-procurement/analytics');
  }

  const data = await getLaptopRequestDetail(numericId);
  if (!data) notFound();

  return (
    <LaptopRequestFormClient
      requesterName={user?.name ?? user?.email ?? ''}
      requesterEmail={user?.email ?? ''}
      accessView={actor.effectiveAccessView}
      editRequest={data.request}
    />
  );
}
