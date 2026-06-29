import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SourceGuideAccessProvider } from './SourceGuideAccessContext';
import SourceGuideAccessOverlay from './SourceGuideAccessOverlay';
import SourceGuideShell from './SourceGuideShell';

export const metadata: Metadata = { title: 'SourceGuide | SC Agents' };
export const dynamic = 'force-dynamic';

export default async function SourceGuideLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  const userName = session.user.name ?? session.user.email;

  if (isAdmin) {
    return (
      <SourceGuideAccessProvider isAdmin approvedCountries={[]} viewOnly={false} userName={userName}>
        <SourceGuideShell userName={userName} userEmail={session.user.email}>{children}</SourceGuideShell>
      </SourceGuideAccessProvider>
    );
  }

  const sg = session.user.toolAccess?.sourceguide;
  const rawStatus = sg?.status ?? 'new';

  // Champions + approved users are 'approved'; everyone else sees the request overlay.
  if (rawStatus !== 'approved') {
    const overlayStatus: 'new' | 'pending' | 'rejected' | 'revoked' | 'denied' =
      rawStatus === 'pending'  ? 'pending'  :
      rawStatus === 'rejected' ? 'rejected' :
      rawStatus === 'revoked'  ? 'revoked'  :
      rawStatus === 'denied'   ? 'denied'   : 'new';
    return (
      <SourceGuideAccessOverlay
        status={overlayStatus}
        userEmail={session.user.email}
        userName={userName}
        jobTitle={session.user.jobTitle}
        department={session.user.department}
      />
    );
  }

  // approvedCountries: champions get their editable country codes; users get [] (view-all, no edit)
  const approvedCountries = sg?.approvedCountries ?? [];
  const viewOnly = approvedCountries.length === 0; // approved users (non-champions) are read-only

  return (
    <SourceGuideAccessProvider isAdmin={false} approvedCountries={approvedCountries} viewOnly={viewOnly} userName={userName}>
      <SourceGuideShell userName={userName} userEmail={session.user.email}>{children}</SourceGuideShell>
    </SourceGuideAccessProvider>
  );
}
