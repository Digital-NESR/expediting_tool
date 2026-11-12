import { redirect } from 'next/navigation';
import { currentActor } from '@/lib/require-access';

export const metadata = { title: 'NESR | RRSM' };

// Auth-gated, so never statically prerendered.
export const dynamic = 'force-dynamic';

/**
 * Admins only, enforced here rather than on the card.
 *
 * The launcher's `adminPreview` card is a UI state: it greys the tile and makes it inert for
 * everyone else, and that is all it does. Anyone who types the URL walks straight past it. The
 * Supply Chain Analytics preview shipped with exactly that hole — a card that looked locked in
 * front of a route with no gate at all — so this one gets the server-side check on the way in.
 *
 * Sign-in itself is already handled: `src/proxy.ts` sends anyone without a session to /login
 * before a route is reached. The `actor` check below is the belt to that braces, for the case
 * where this layout is rendered outside the proxy's matcher.
 */
export default async function RrsmLayout({ children }: { children: React.ReactNode }) {
  const actor = await currentActor();
  if (!actor) redirect('/login');
  if (!actor.isPlatformAdmin) redirect('/home');

  return <>{children}</>;
}
