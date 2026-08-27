import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMySnsAccessRequest, getSnsReferenceData, getSnsViewer } from '@/app/actions/sns';
import RequestAccessClient from './RequestAccessClient';

export const metadata: Metadata = { title: 'Request Access | NESR S&S Registry' };
export const dynamic = 'force-dynamic';

export default async function SnsRequestAccessPage() {
  const [viewer, myRequest, reference] = await Promise.all([
    getSnsViewer(),
    getMySnsAccessRequest(),
    getSnsReferenceData(),
  ]);

  // Already approved — nothing to request.
  if (viewer) redirect('/sns-registry');

  return (
    <RequestAccessClient
      myRequest={myRequest}
      countries={reference.countries.map((c) => c[0])}
    />
  );
}
