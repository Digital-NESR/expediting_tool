import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLaptopRequestDetail } from '@/app/actions/laptopProcurement';
import LaptopRequestDetailClient from '../../components/LaptopRequestDetailClient';

type PageProps = { params: Promise<{ id: string }> };

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `NESR | Request ${id} - Laptop Procurement` };
}

export default async function LaptopRequestDetailPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const data = await getLaptopRequestDetail(numericId);
  if (!data) notFound();

  return <LaptopRequestDetailClient data={data} />;
}
