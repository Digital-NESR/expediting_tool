import { redirect } from 'next/navigation';
import { currentRrsmActor } from '@/lib/rrsm/access';
import RrsmRequestAccess from '../components/RrsmRequestAccess';

export const metadata = { title: 'NESR | RRSM · Rental & Recurrent Services Management' };

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

  /* No grant: ask for one. The home card is open to everyone, so this is where somebody new
     lands; an RRSM admin decides in Admin -> RRSM -> Access requests. */
  if (!actor.isAdmin && !actor.grants.length) return <RrsmRequestAccess />;

  return <>{children}</>;
}
