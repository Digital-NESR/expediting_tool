import { notFound } from 'next/navigation';
import { canUseCountry } from '@/lib/safesign/access';
import { safesignPage } from '@/lib/safesign/page';
import { getCommunication } from '@/lib/safesign/read';
import { RESPONSE_TYPE_LABEL, formatDay } from '@/lib/safesign/model';
import SafeSignShell from '../../../components/SafeSignShell';
import CommunicationClient from './CommunicationClient';

export default async function CommunicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor, shell } = await safesignPage();
  const { id } = await params;
  const comm = await getCommunication(Number(id));
  /* Another country's communication does not exist as far as this person is concerned. */
  if (!comm || !canUseCountry(actor, comm.countryId)) notFound();
  const country = actor.countries.find((c) => c.id === comm.countryId) ?? shell.country;

  return (
    <SafeSignShell
      user={{ ...shell, country }}
      title={comm.title}
      subtitle={`${comm.topicName} · ${RESPONSE_TYPE_LABEL[comm.responseType]} · due ${formatDay(comm.deadline)}`}
    >
      <CommunicationClient comm={comm} />
    </SafeSignShell>
  );
}
