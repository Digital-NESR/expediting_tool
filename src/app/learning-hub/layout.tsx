import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata: Metadata = {
  title: { template: 'SC Agents | %s', default: 'SC Agents | Learning Hub' },
};
export const dynamic = 'force-dynamic';

export default async function LearningHubLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Learning Hub is open to every signed-in user - no access request needed.
  return <>{children}</>;
}
