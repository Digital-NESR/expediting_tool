import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { canAccessProcureGuardApp } from '@/app/actions/procureGuard';
import { getProcureGuardUser } from '@/lib/auth';
import ProcureGuardUsageTracker from './components/ProcureGuardUsageTracker';

export const metadata: Metadata = { title: 'ProcureGuard | SC Agents' };
export const dynamic = 'force-dynamic';

export default async function ProcureGuardLayout({ children }: { children: React.ReactNode }) {
  const user = await getProcureGuardUser();

  if (!user?.email) {
    redirect('/login');
  }

  const canAccess = await canAccessProcureGuardApp();
  if (!canAccess) {
    redirect('/home');
  }

  return (
    <>
      <ProcureGuardUsageTracker />
      {children}
    </>
  );
}
