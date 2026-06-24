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
      {/*
        Fluid root font-size while inside ProcureGuard. Every ProcureGuard size is rem-based
        (Tailwind spacing/text + the converted text-[…rem] labels), so scaling the root scales
        the whole UI together — cards and text shrink to fit smaller / shorter screens instead
        of using fixed sizes. Scoped to this layout: it unmounts (and resets) when you leave PG.
      */}
      <style dangerouslySetInnerHTML={{ __html: ':root{font-size:clamp(11px,calc(0.45vw + 0.45vh + 5px),16px)}' }} />
      <ProcureGuardUsageTracker />
      {children}
    </>
  );
}
