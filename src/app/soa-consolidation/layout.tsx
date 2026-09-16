import { redirect } from 'next/navigation';
import { getSoaActor } from '@/lib/soa/access';
import { getSoaCountries } from '@/app/actions/soa/access';
import AccessGate from './AccessGate';
import { getMySoaAccessRequest } from '@/app/actions/soa/access';

export const metadata = { title: 'NESR | SOA Consolidation' };

// Auth-gated, so never statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * The gate.
 *
 * This was ADMIN_EMAILS-only with a hand-rolled deny card, which was right for a prototype nobody
 * could ask to use. The tool now has roles in the database, so the gate asks `getSoaActor()` and
 * lands on one of five outcomes:
 *
 *   no session          → /login
 *   no role, no request → the request-access page
 *   no role, Pending    → waiting for approval
 *   no role, Rejected   → say so, and let them ask again
 *   no role, Revoked    → same, with the wording that matches what happened
 *   a role              → the tool
 *
 * The four roleless states share one component; it is the same page with a different header, and
 * a rejected user is allowed to ask again, so the form belongs on it. Not rendering `children`
 * means the page component never runs, which is what keeps the gate a real gate rather than a
 * card drawn on top of a tool that already loaded.
 */
export default async function SoaConsolidationLayout({ children }: { children: React.ReactNode }) {
  const actor = await getSoaActor();

  if (!actor) {
    redirect('/login');
  }

  if (actor.role === null) {
    const countries = await getSoaCountries();
    const mine = await getMySoaAccessRequest();
    return (
      <AccessGate
        name={actor.name}
        status={actor.requestStatus}
        countries={countries}
        existing={
          mine
            ? {
                role: mine.requestedRole,
                country: mine.requestedCountryName ?? 'All countries',
              }
            : null
        }
      />
    );
  }

  return <>{children}</>;
}
