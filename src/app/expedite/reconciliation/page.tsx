import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getMyExpeditingSessions } from '@/app/actions/reconciliation';
import ReconciliationClient from './ReconciliationClient';

export const metadata = { title: 'Reconciliation — NESR Expediting' };

export default async function ReconciliationPage() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? '';
  const sessions = await getMyExpeditingSessions(userEmail);
  return <ReconciliationClient sessions={sessions} />;
}
