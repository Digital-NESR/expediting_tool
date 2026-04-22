import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import ReconciliationClient from './ReconciliationClient';

export const metadata = { title: 'Reconciliation — PO Expediting | SC Agents' };

export default async function ReconciliationPage() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? '';
  return <ReconciliationClient userEmail={userEmail} />;
}
