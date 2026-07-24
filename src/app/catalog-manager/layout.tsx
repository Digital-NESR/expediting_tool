import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { authOptions, getServerSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'NESR | Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function CatalogManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  // Env-gated admin preview: only configured admins may enter; everyone else is
  // bounced to the tool picker (where the home card shows an "Admin Preview" badge).
  if (!isAdmin) redirect('/home');

  return <>{children}</>;
}
