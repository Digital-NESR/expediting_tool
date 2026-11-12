import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentRrsmActor } from '@/lib/rrsm/access';

export const metadata = { title: 'NESR | RRSM' };

// Auth-gated, so never statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * Who may open RRSM.
 *
 * This was admins only while the tool was a greyed card with nothing behind it. Now that there
 * are screens, the gate is the real one: a platform or RRSM admin, or anybody holding a grant in
 * `rrsm_users`. Sign-in itself is handled upstream by `src/proxy.ts`.
 *
 * The gate lives here rather than on the launcher card, which is a UI state and is bypassed by
 * typing the URL. Every endpoint under /actions/rrsm re-checks as well, because a layout does not
 * stand between a browser and a server action.
 */
export default async function RrsmLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentRrsmActor();
  if (!actor) redirect('/login');

  if (!actor.isAdmin && !actor.grants.length) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-5 font-sans">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-[17px] font-semibold text-slate-900">RRSM is not open to you yet</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
            Rental &amp; Recurrent Services Management is granted per country. Ask a supply chain
            administrator to add you as a buyer or an Ops validator for the country you work in.
          </p>
          <Link
            href="/home"
            className="mt-6 inline-block rounded-lg bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white"
          >
            Back to applications
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
