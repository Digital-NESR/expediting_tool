import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const metadata: Metadata = { title: 'NESR | Catalog Manager' };
export const dynamic = 'force-dynamic';

/**
 * Signed in is the gate. Catalog Repo is live for everyone from here on.
 *
 * It used to be `if (!isAdmin) redirect('/home')` — an env-gated admin preview from before the
 * tool had roles of its own. It has had them for a while: `getCatalogActor` resolves any signed-in
 * employee to `Viewer` (catalog-manager.ts), `/catalog-manager/request-access` lets a Viewer ask
 * for Contributor or Approver, and "Catalog Repo" under /admin reviews that queue. The redirect
 * made all three unreachable — including the request page, which sits under this very layout, so
 * the only way to ask for access was a route nobody could open.
 *
 * It was never a security control either, and the action file says so in terms: every export of
 * `src/app/actions/catalog-manager.ts` is a public POST endpoint, so each one starts with
 * `requireCatalogActor` / `optionalCatalogActor`. Authorisation lives there, per role and per
 * country. What this layout decides is only whether to render a page, and a Viewer seeing the
 * catalogue read-only is the intended ground state.
 */
export default async function CatalogManagerLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  return <>{children}</>;
}
