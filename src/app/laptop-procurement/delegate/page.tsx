import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getLaptopDelegationData } from '@/app/actions/laptopProcurement';
import { canUseLaptopReviewerQueue } from '@/lib/laptopProcurement-utils';
import LaptopDelegateClient from './LaptopDelegateClient';

export const metadata: Metadata = { title: 'Delegation | Laptop Procurement' };
export const dynamic = 'force-dynamic';

export default async function LaptopDelegatePage() {
  const data = await getLaptopDelegationData();
  if (!data) redirect('/laptop-procurement');
  if (!canUseLaptopReviewerQueue(data.actor.effectiveAccessView)) redirect('/laptop-procurement');
  return <LaptopDelegateClient data={data} />;
}
