import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getToolScope } from '@/lib/tool-scope';
import { SourceGuideAccessProvider } from './SourceGuideAccessContext';
import SourceGuideAccessOverlay from './SourceGuideAccessOverlay';
import SourceGuideShell from './SourceGuideShell';

export const metadata: Metadata = { title: 'NESR | SourceGuide' };
export const dynamic = 'force-dynamic';

export default async function SourceGuideLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  /* Admin list, status and view-only come from the one shared definition, so this
     layout and `getSgUser()` in the actions cannot disagree — they used to: the
     layout called an approved user with no champion countries view-only while the
     actions only did so for the 'All Countries - View Only' sentinel. */
  const scope = getToolScope(session, 'sourceguide');
  const userName = scope.name;

  if (scope.isAdmin) {
    return (
      <SourceGuideAccessProvider
        isAdmin
        approvedCountries={[]}
        viewOnly={false}
        userName={userName}
      >
        <SourceGuideShell userName={userName} userEmail={session.user.email}>
          {children}
        </SourceGuideShell>
      </SourceGuideAccessProvider>
    );
  }

  const rawStatus = scope.status;

  // Champions + approved users are 'approved'; everyone else sees the request overlay.
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
  return (
    <SourceGuideAccessProvider
      isAdmin={false}
      approvedCountries={scope.approvedCountries}
      viewOnly={scope.viewOnly}
      userName={userName}
    >
      <SourceGuideShell userName={userName} userEmail={session.user.email}>
        {children}
      </SourceGuideShell>
    </SourceGuideAccessProvider>
  );
}
