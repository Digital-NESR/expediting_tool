import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/require-access';

export const metadata = { title: 'NESR | Supply Chain Analytics' };

// Auth-gated, so never statically prerendered.
export const dynamic = 'force-dynamic';

/* This is an admin-only demo/preview surface. It had no server-side gate at
   all, so any signed-in employee could open it. Same rule and same deny card
   as /admin (ADMIN_EMAILS, via the shared helper). */
export default async function SupplyChainAnalyticsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const actor = await currentActor();

  if (!actor) {
    redirect('/login');
  }

  if (!actor.isPlatformAdmin) {
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

  return <>{children}</>;
}
