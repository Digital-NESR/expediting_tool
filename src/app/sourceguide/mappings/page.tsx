import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCountries } from '@/app/actions/sourceguide';
import { VIEW_ONLY } from '../constants';
import MappingsClient from './MappingsClient';

export const metadata: Metadata = { title: 'Manage Mappings — SourceGuide | SC Agents' };

export default async function SourceGuideMappingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  const approved = (session.user.toolAccess?.sourceguide?.approvedCountries ?? [])
    .filter(c => c !== VIEW_ONLY);

  // viewers (no editable countries, not admin) have nothing to manage
  if (!isAdmin && approved.length === 0) redirect('/sourceguide');

  const allCountries = await getCountries();
  const editable = isAdmin ? allCountries : allCountries.filter(c => approved.includes(c.code));

  return (
    <MappingsClient
      countries={editable}
      isAdmin={isAdmin}
      userName={session.user.name ?? session.user.email}
    />
  );
}
