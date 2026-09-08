import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { getCachedSession } from '@/lib/session';
import AdminShell from './AdminShell';
import type { AdminCounts } from './adminNav';
import { getPendingAccessCount } from '@/app/actions/adminAccess';
import { getTitePendingCount } from '@/app/actions/tite';
import { getSourceGuidePendingCount } from '@/app/actions/sourceguide';
import { getCatalogAccessPendingCount } from '@/app/actions/catalog-manager';
import { getSnsPendingAccessCount } from '@/app/actions/sns';
import { getLaptopPendingAccessCount } from '@/app/actions/laptopProcurement';

export const metadata = { title: 'NESR | Admin' };

// The admin area is always auth + cookie gated, so it is never statically
// prerendered. Declaring it dynamic keeps `next build` from attempting a
// static pass (which would flag AdminShell's useSearchParams usage).
export const dynamic = 'force-dynamic';

/* This layout gates the ENTIRE /admin/* segment: only ADMIN_EMAILS
   may enter, exactly as before. It also fetches the lightweight
   pending-count badges once (cheap COUNT queries) and keeps the
   shell mounted while the [app] route swaps beneath it — so the
   heavy, per-application data now loads one app at a time. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getCachedSession();

  if (!session?.user?.email) {
    redirect('/login');
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const isAdmin = adminEmails.includes(session.user.email.toLowerCase());

  if (!isAdmin) {
    return (
      <div className="min-h-[100dvh] bg-slate-50 flex flex-col items-center justify-center font-sans">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 max-w-sm w-full text-center">
          <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m0-9v4m-6.364 5.364A9 9 0 1118.364 5.636 9 9 0 015.636 18.364z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-slate-900">Access Denied</h1>
          <p className="text-sm text-slate-500 mt-2 leading-relaxed">
            You do not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  /* Lightweight badge counts (COUNT queries), fetched once for the
     whole session. ProcureGuard is open-access → no pending badge. */
  const [po, tite, sourceguide, catalog, sns, laptop] = await Promise.all([
    getPendingAccessCount(),
    getTitePendingCount(),
    getSourceGuidePendingCount(),
    getCatalogAccessPendingCount(),
    getSnsPendingAccessCount(),
    getLaptopPendingAccessCount(),
  ]);

  const counts: AdminCounts = {
    po,
    tite,
    sourceguide,
    catalog,
    sns,
    laptop,
  };

  return (
    <Suspense fallback={null}>
      <AdminShell
        userEmail={session.user.email}
        userName={session.user.name ?? session.user.email}
        counts={counts}
      >
        {children}
      </AdminShell>
    </Suspense>
  );
}
