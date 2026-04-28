import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCountries, getCurrentAccessRequest } from '@/app/actions/access';
import RequestAccessClient from './RequestAccessClient';

export const metadata = { title: 'Request Access — SC Agents' };

export default async function RequestAccessPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const existing = await getCurrentAccessRequest(session.user.email);

  // Already approved → go to app
  if (existing?.status === 'Approved') redirect('/');

  // Already pending → go to pending page
  if (existing?.status === 'Pending') redirect('/pending-approval');

  const countries = await getCountries();

  return (
    <RequestAccessClient
      userEmail={session.user.email}
      displayName={session.user.name ?? session.user.email}
      countries={countries}
    />
  );
}
