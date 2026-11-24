import { notFound, redirect } from 'next/navigation';
import { canManage, currentSafeSignActor } from '@/lib/safesign/access';
import { getCommunication } from '@/lib/safesign/read';
import { RESPONSE_TYPE_LABEL, formatDay } from '@/lib/safesign/model';
import SafeSignShell from '../../../components/SafeSignShell';
import CommunicationClient from './CommunicationClient';

export default async function CommunicationPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const { id } = await params;
  const comm = await getCommunication(Number(id));
  if (!comm) notFound();

  return (
    <SafeSignShell
      user={{ name: actor.name, email: actor.email, role: actor.role }}
      title={comm.title}
      subtitle={`${comm.topicName} · ${RESPONSE_TYPE_LABEL[comm.responseType]} · due ${formatDay(comm.deadline)}`}
    >
      <CommunicationClient comm={comm} canManage={canManage(actor)} />
    </SafeSignShell>
  );
}
