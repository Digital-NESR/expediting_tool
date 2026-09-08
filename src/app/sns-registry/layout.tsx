import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import './sns.css';

export const metadata: Metadata = { title: 'NESR | S&S Registry' };
export const dynamic = 'force-dynamic';

export default async function SnsRegistryLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Per-page gating happens below this layout: /sns-registry needs approved
  // access, /sns-registry/request-access is reachable by any signed-in user
  // precisely because they do not have it yet.
  return <>{children}</>;
}
