import { redirect } from 'next/navigation';
import { getSnsRecords, getSnsReferenceData, getSnsViewer } from '@/app/actions/sns';
import SnsRegistryClient from './SnsRegistryClient';

export const dynamic = 'force-dynamic';

export default async function SnsRegistryPage({
  searchParams,
}: {
  searchParams?: Promise<{ record?: string }>;
}) {
  const viewer = await getSnsViewer();

  // No approved access (or none at all) — send them to request it rather than
  // showing an empty shell they cannot use.
  if (!viewer) redirect('/sns-registry/request-access');

  const [reference, initialRecords] = await Promise.all([getSnsReferenceData(), getSnsRecords()]);

  // `?record=` is what every notification email links to. Resolved here rather
  // than in a client effect so the record is on screen in the first paint —
  // and so the client's initial state matches the server's, which reading
  // window.location during render would not.
  const requested = Number((searchParams ? await searchParams : {}).record);
  const initialRecordId = Number.isSafeInteger(requested) && requested > 0 ? requested : null;

  return (
    <SnsRegistryClient
      viewer={viewer}
      reference={reference}
      initialRecords={initialRecords}
      initialRecordId={initialRecordId}
    />
  );
}
