import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import AnalyticsClient from './AnalyticsClient';

export const metadata = { title: 'NESR | My Analytics - PO Expediting' };

export default async function MyAnalyticsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    redirect('/login');
  }

  return (
    <AnalyticsClient
      userEmail={session.user.email}
      userName={session.user.name ?? session.user.email}
    />
  );
}
