import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { SourceGuideAccessProvider } from './SourceGuideAccessContext';
import SourceGuideShell from './SourceGuideShell';

export const metadata: Metadata = { title: 'SourceGuide | SC Agents' };
export const dynamic = 'force-dynamic';

export default async function SourceGuideLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  // Env-gated preview: only admins and listed testers may enter — everyone
  // else is bounced back to the tool picker (the home card shows "Admin Preview").
  const sgStatus = session.user.toolAccess?.sourceguide?.status ?? 'new';
  const canAccess = isAdmin || sgStatus === 'approved';
  if (!canAccess) redirect('/home');

  const userName = session.user.name ?? session.user.email;

  return (
    <SourceGuideAccessProvider isAdmin={isAdmin} approvedCountries={[]} viewOnly={false} userName={userName}>
      <SourceGuideShell userName={userName} userEmail={session.user.email}>
        {children}
      </SourceGuideShell>
    </SourceGuideAccessProvider>
  );
}
