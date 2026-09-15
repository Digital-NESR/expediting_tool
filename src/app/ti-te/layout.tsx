import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getToolScope } from '@/lib/tool-scope';
import { TiteAccessProvider } from './TiteAccessContext';
import TiteAccessOverlay from './TiteAccessOverlay';

export const metadata: Metadata = { title: 'NESR | TI-TE' };

export default async function TiteLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/login');
  }

  /* Admin list and status come from the one shared definition, so this gate and
     the server actions behind it can never disagree about who is an admin. */
  const scope = getToolScope(session, 'tite');

  /* Admins bypass all access checks */
  if (scope.isAdmin) {
    return (
      <TiteAccessProvider isAdmin={true} approvedCountries={[]}>
        {children}
      </TiteAccessProvider>
    );
  }

  const rawStatus = scope.status;

  if (rawStatus !== 'approved') {
    const overlayStatus: 'new' | 'pending' | 'rejected' | 'revoked' | 'denied' =
      rawStatus === 'pending'
        ? 'pending'
        : rawStatus === 'rejected'
          ? 'rejected'
          : rawStatus === 'revoked'
            ? 'revoked'
            : rawStatus === 'denied'
              ? 'denied'
              : 'new';

    return (
      <TiteAccessOverlay
        status={overlayStatus}
        userEmail={session.user.email}
        userName={session.user.name ?? session.user.email}
        jobTitle={session.user.jobTitle}
        department={session.user.department}
      />
    );
  }

  return (
    <TiteAccessProvider isAdmin={false} approvedCountries={scope.approvedCountries}>
      {children}
    </TiteAccessProvider>
  );
}
