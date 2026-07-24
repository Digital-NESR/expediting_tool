import { authOptions, getServerSession } from '@/lib/auth';
import ReconciliationClient from './ReconciliationClient';

export const metadata = { title: 'NESR | Reconciliation - PO Expediting' };

export default async function ReconciliationPage() {
  const session = await getServerSession(authOptions);
  const userEmail = session?.user?.email ?? '';
  const userName  = session?.user?.name ?? userEmail;
  return <ReconciliationClient userEmail={userEmail} userName={userName} />;
}
