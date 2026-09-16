import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
// Side-effect import: logs presence of critical env vars once per cold start (production only).
import '@/lib/startup-check';
import { getPoExpeditingAccess } from '@/lib/po-access';

export const metadata: Metadata = { title: 'NESR | PO Expediting' };

/* The gate has to see the current row, not a cached render of an older one. */
export const dynamic = 'force-dynamic';

/**
 * Tool-level gate for everything under /po-expediting.
 *
 * This used to live in the proxy, which reads tool access out of the JWT cookie. Nothing
 * rendering on the server can reissue that cookie, so a user approved a minute ago was still
 * bounced to /home until they signed out and back in. The check reads the access row instead,
 * so an approval takes effect on the next page load.
 *
 * Signing in is still enforced by the proxy, which runs first; the `!approved` branch below
 * covers a signed-out user anyway, because access for nobody is never approved.
 *
 * /home is deliberately kept as the destination, exactly where the proxy sent people: the
 * launcher already shows this tool's card with its request-access flow, so a user who lands
 * there sees why they are there and what to do about it.
 */
export default async function PoExpeditingLayout({ children }: { children: React.ReactNode }) {
  const access = await getPoExpeditingAccess();
  if (!access.approved) redirect('/home');
  return <>{children}</>;
}
