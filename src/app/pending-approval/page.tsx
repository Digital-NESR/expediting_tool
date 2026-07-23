import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCurrentAccessRequest } from '@/app/actions/access';
import PendingApprovalClient from './PendingApprovalClient';

export const metadata = { title: 'NESR | Pending Approval' };

export default async function PendingApprovalPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const existing = await getCurrentAccessRequest(session.user.email);

  // Redirect if no pending request
  if (!existing || existing.status !== 'Pending') redirect('/');

  return (
    <PendingApprovalClient
      displayName={session.user.name ?? session.user.email}
      requestedCountries={existing.requested_countries}
    />
  );
}
