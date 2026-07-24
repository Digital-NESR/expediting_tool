import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { TiteAccessProvider } from './TiteAccessContext';
import TiteAccessOverlay from './TiteAccessOverlay';

export const metadata: Metadata = { title: 'NESR | TI-TE' };

export default async function TiteLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/login');
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  /* Admins bypass all access checks */
  if (isAdmin) {
    return (
      <TiteAccessProvider isAdmin={true} approvedCountries={[]}>
        {children}
      </TiteAccessProvider>
    );
  }

  /* Read TI-TE access from JWT session (hydrated by JWT callback) */
  const titeAccess = session.user.toolAccess?.tite;
  const rawStatus  = titeAccess?.status ?? 'new';

  if (rawStatus !== 'approved') {
    const overlayStatus: 'new' | 'pending' | 'rejected' | 'revoked' | 'denied' =
      rawStatus === 'pending'  ? 'pending'  :
      rawStatus === 'rejected' ? 'rejected' :
      rawStatus === 'revoked'  ? 'revoked'  :
      rawStatus === 'denied'   ? 'denied'   : 'new';

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

  const approvedCountries = titeAccess?.approvedCountries ?? [];

  return (
    <TiteAccessProvider isAdmin={false} approvedCountries={approvedCountries}>
      {children}
    </TiteAccessProvider>
  );
}
