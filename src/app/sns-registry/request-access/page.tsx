import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMySnsAccessRequest, getSnsCountryOptions, getSnsViewer } from '@/app/actions/sns';
import RequestAccessClient from './RequestAccessClient';

export const metadata: Metadata = { title: 'Request Access | NESR S&S Registry' };
export const dynamic = 'force-dynamic';

export default async function SnsRequestAccessPage() {
  /* The full reference tree is gated to approved S&S viewers, and a user on
     this page by definition is not one yet — so the country list comes from
     the narrow, signed-in-only action instead. */
  const [viewer, myRequest, countries] = await Promise.all([
    getSnsViewer(),
    getMySnsAccessRequest(),
    getSnsCountryOptions(),
  ]);

  // Already approved — nothing to request.
  if (viewer) redirect('/sns-registry');

  return <RequestAccessClient myRequest={myRequest} countries={countries} />;
}
