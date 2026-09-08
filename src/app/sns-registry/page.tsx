import { redirect } from 'next/navigation';
import { getSnsRecords, getSnsReferenceData, getSnsViewer } from '@/app/actions/sns';
import SnsRegistryClient from './SnsRegistryClient';

export const dynamic = 'force-dynamic';

export default async function SnsRegistryPage() {
  const viewer = await getSnsViewer();

  // No approved access (or none at all) — send them to request it rather than
  // showing an empty shell they cannot use.
  if (!viewer) redirect('/sns-registry/request-access');

  const [reference, initialRecords] = await Promise.all([
    getSnsReferenceData(),
    getSnsRecords(),
  ]);

  return (
    <SnsRegistryClient
      viewer={viewer}
      reference={reference}
      initialRecords={initialRecords}
    />
  );
}
