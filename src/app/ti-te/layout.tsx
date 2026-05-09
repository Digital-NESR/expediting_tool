import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAllTiteCountries } from '@/app/actions/tite';
import { TiteAccessProvider } from './TiteAccessContext';
import TiteAccessOverlay from './TiteAccessOverlay';

export const metadata: Metadata = { title: 'TI-TE | SC Agents' };

/* Static fallback — shown when DB has no country data yet */
const TITE_FALLBACK_COUNTRIES = [
  'Saudi Arabia (KSA)',
  'United Arab Emirates (UAE)',
  'Qatar',
  'Kuwait',
  'Oman',
  'Bahrain',
  'Egypt',
  'Algeria',
  'Iraq',
  'Libya',
  'Chad',
  'Congo',
  'Other',
];

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
    const dbCountries = await getAllTiteCountries();
    const allCountries =
      dbCountries.length > 0 ? dbCountries : TITE_FALLBACK_COUNTRIES;

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
        allCountries={allCountries}
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
