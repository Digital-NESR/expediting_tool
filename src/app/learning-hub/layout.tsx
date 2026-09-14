import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getLearningHubNavTracks } from '@/lib/learning-hub-queries';
import { LearningHubNavProvider } from './components/LearningHubNavContext';

export const metadata: Metadata = {
  title: { template: 'SC Agents | %s', default: 'SC Agents | Learning Hub' },
};
export const dynamic = 'force-dynamic';

export default async function LearningHubLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Learning Hub is open to every signed-in user - no access request needed.
  // The sidebar's links come from the database here, once, for every page below.
  const navTracks = await getLearningHubNavTracks();
  return <LearningHubNavProvider tracks={navTracks}>{children}</LearningHubNavProvider>;
}
