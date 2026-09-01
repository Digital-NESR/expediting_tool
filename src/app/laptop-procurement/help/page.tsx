import type { Metadata } from 'next';
import { getLaptopActor } from '@/app/actions/laptopProcurement';
import LaptopHelpClient from './LaptopHelpClient';

export const metadata: Metadata = { title: 'Help & Training | Laptop Procurement' };

export default async function LaptopHelpPage() {
  const actor = await getLaptopActor();
  return <LaptopHelpClient accessView={actor?.effectiveAccessView ?? 'requester'} />;
}
