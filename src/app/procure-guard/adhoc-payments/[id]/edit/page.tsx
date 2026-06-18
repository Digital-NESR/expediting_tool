import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { getProcureGuardRequestDetail } from '@/app/actions/procureGuard';
import AdhocPaymentFormClient from '../../new/AdhocPaymentFormClient';

type PageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return { title: `Edit Adhoc PO ${id} | ProcureGuard` };
}

export default async function EditAdhocPaymentPage({ params }: PageProps) {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) notFound();

  const data = await getProcureGuardRequestDetail('adhoc', numericId);
  if (!data || 'advance_purpose' in data.request) notFound();

  const ownsRequest = data.request.requested_by_email.toLowerCase() === data.actor.email.toLowerCase();
  const canEdit = (data.request.status === 'Submitted' || data.request.status === 'Rejected') && (ownsRequest || data.actor.permissions.canManageData);

  if (!canEdit) redirect(`/procure-guard/adhoc-payments/${numericId}`);

  return (
    <AdhocPaymentFormClient
      requesterName={data.actor.name}
      requesterEmail={data.actor.email}
      defaultDepartment={data.actor.department ?? ''}
      accessView={data.actor.permissions.accessView}
      editRequest={data.request}
    />
  );
}
