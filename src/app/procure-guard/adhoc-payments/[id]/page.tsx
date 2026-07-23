import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProcureGuardRequestDetail } from '@/app/actions/procureGuard';
import ProcureGuardRequestDetailClient from '../../components/ProcureGuardRequestDetailClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `NESR | Adhoc PO ${id} - ProcureGuard` };
}

export default async function AdhocPaymentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const data = await getProcureGuardRequestDetail('adhoc', numericId);
  if (!data) notFound();

  return <ProcureGuardRequestDetailClient data={data} />;
}
