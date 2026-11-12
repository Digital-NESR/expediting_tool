import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { getIcsaActor, hasAnyAccess } from '@/lib/icsa/access';
import { listPendingExtensions } from '@/lib/icsa/queries';
import IcsaShell from './components/IcsaShell';
import { CARD } from './components/ui';
import { icsaSignInPath } from '@/lib/icsa/demo';

export const metadata: Metadata = { title: 'NESR | ICSA' };
export const dynamic = 'force-dynamic';

/**
 * The gate. There is no access request in ICSA: administrators come from the environment,
 * champions are appointed by an administrator, and respondents are nominated by their champion.
 * Anyone else gets a page saying exactly that.
 */
export default async function IcsaLayout({ children }: { children: React.ReactNode }) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());

  if (!hasAnyAccess(actor)) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4">
        <div className={`${CARD} max-w-lg p-8`}>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#307c4c]/10">
            <ShieldCheck className="h-6 w-6 text-[#307c4c]" />
          </div>
          <h1 className="text-xl font-bold text-slate-900">Internal Control Self-Assessment</h1>
          <p className="mt-2 text-sm text-slate-600">
            You have no self-assessment to complete right now. Your country&apos;s ICSA champion
            sends you the form when a cycle opens, and you will receive an email when they do.
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Champions are appointed by the ICSA administrator. If you should be one, ask the Supply
            Chain governance team.
          </p>
          <Link
            href="/home"
            className="mt-6 inline-flex rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#307c4c]/85"
          >
            Back to NESR Home
          </Link>
        </div>
      </div>
    );
  }

  const pending = actor.isAdmin ? (await listPendingExtensions()).length : 0;

  return (
    <IcsaShell
      viewer={{
        name: actor.name,
        email: actor.email,
        isAdmin: actor.isAdmin,
        championCountries: actor.championCountries,
        isDemo: actor.isDemo,
      }}
      pendingExtensions={pending}
    >
      {children}
    </IcsaShell>
  );
}
