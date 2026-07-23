import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getProcureGuardRequestDetail } from '@/app/actions/procureGuard';
import AdvancePaymentFormClient from '../../new/AdvancePaymentFormClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `NESR | Edit Advance Payment ${id} - ProcureGuard` };
}

export default async function EditAdvancePaymentPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const data = await getProcureGuardRequestDetail('advance', numericId);
  if (!data || !('advance_purpose' in data.request)) notFound();

  const ownsRequest = data.request.requested_by_email.toLowerCase() === data.actor.email.toLowerCase();
  const canEdit = (data.request.status === 'Submitted' || data.request.status === 'Rejected') && (ownsRequest || data.actor.permissions.canManageData);

  if (!canEdit) redirect(`/procure-guard/advance-payments/${numericId}`);

  return (
    <AdvancePaymentFormClient
      requesterName={data.actor.name}
      requesterEmail={data.actor.email}
      defaultDepartment={data.actor.department ?? ''}
      accessView={data.actor.permissions.accessView}
      editRequest={data.request}
    />
  );
}
