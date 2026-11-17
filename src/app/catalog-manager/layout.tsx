import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCatalogActor } from '@/app/actions/catalog-manager';
import CatalogAccessGate from './CatalogAccessGate';

export const metadata: Metadata = { title: 'NESR | Catalog Manager' };
export const dynamic = 'force-dynamic';

/**
 * The gate. Three outcomes: signed out, signed in without a grant, signed in with one.
 *
 * This was `if (!isAdmin) redirect('/home')` while the tool was an admin preview, and then
 * nothing at all when it went live (9e0300c) -- which opened the supplier price catalogue to
 * every signed-in employee, because `getCatalogActor` resolved anyone without an `app_user` row
 * to Viewer rather than to nobody. A colleague reached the catalogue without ever appearing in
 * the approvals queue, for the simple reason that he had never needed to ask.
 *
 * Someone with no grant now gets the request-access page in place of the tool, rather than a
 * redirect to /home. A redirect would be worse than the old preview: it bounces people with no
 * explanation and takes the request form -- which lives under this layout -- down with it.
 *
 * Not rendering `children` is what keeps this a gate rather than a card drawn over a tool that
 * already loaded. It is not the only gate either: every export of
 * `src/app/actions/catalog-manager.ts` is a public POST endpoint, so `requireCatalogActor` makes
 * the same check again where it actually counts.
 */
export default async function CatalogManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  const actor = await getCatalogActor();
  if (!actor.hasAccess) return <CatalogAccessGate />;

  return <>{children}</>;
}
