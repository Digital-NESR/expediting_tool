import type { Metadata } from 'next';
import {
  listCatalogEntries,
  getCatalogActor,
  getCountries,
  getCategoriesWithSubs,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogListClient from './CatalogListClient';

export const metadata: Metadata = { title: 'Catalog | NESR Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function CatalogListPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; status?: string; category?: string; expiring?: string }>;
}) {
  const sp = await searchParams;
  const country = sp.country ?? 'ALL';
  const [entries, actor, countries, categories] = await Promise.all([
    listCatalogEntries({ country }),
    getCatalogActor(),
    getCountries(),
    getCategoriesWithSubs(),
  ]);
  const pendingCount = entries.filter((e) => e.status === 'Pending Approval').length;

  return (
    <CatalogListClient
      entries={entries}
      categories={categories.map((c) => ({ name: c.name, type: c.type }))}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      scope={country}
      pendingCount={pendingCount}
      roleLabel={getPermissionProfile(actor.role).description}
      canCreate={actor.canCreate}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      homeCountry={actor.country_code}
      initialStatus={sp.status ?? null}
      initialCategory={sp.category ?? null}
      initialExpiring={sp.expiring === '1'}
    />
  );
}
