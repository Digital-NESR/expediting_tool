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

  // Tool-level gate: env admins, or users approved for 'learning_hub'. Non-approved users are
  // bounced to the tool picker, where the home card offers "Request access".
  const isAdmin = session.user.isAdmin ?? false;
  const status = session.user.toolAccess?.learning_hub?.status;
  if (!isAdmin && status !== 'approved') redirect('/home');

  return <>{children}</>;
}
