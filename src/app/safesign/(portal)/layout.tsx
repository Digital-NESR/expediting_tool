import Link from 'next/link';
import { redirect } from 'next/navigation';
import { currentSafeSignActor, hasAccess } from '@/lib/safesign/access';

export const metadata = { title: 'NESR | ComplyConnect' };
export const dynamic = 'force-dynamic';

/**
 * Who may open SafeSign's staff pages: a platform or SafeSign admin, or anybody given a country in
 * the admin panel (ss_country_users).
 * Sign-in is handled upstream by src/proxy.ts. Every action re-checks, because a layout does not
 * stand between a browser and a server action.
 *
 * The supplier page (/safesign/respond) sits outside this route group on purpose: this gate would
 * bounce every supplier to /login.
 */
export default async function SafeSignLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentSafeSignActor();
  if (!actor) redirect('/login');

  if (!hasAccess(actor)) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-5 font-sans">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <h1 className="text-[17px] font-semibold text-slate-900">ComplyConnect is not open to you yet</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-slate-500">
            ComplyConnect is used by the teams that send communications to suppliers. Ask a
            ComplyConnect administrator to add you to your country.
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
