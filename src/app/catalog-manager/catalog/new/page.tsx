import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getCatalogActor,
  getCountries,
  getCurrencies,
  getUoms,
  getSuppliers,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogEntryFormClient from '../CatalogEntryFormClient';

export const metadata: Metadata = { title: 'NESR | New Entry - Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function NewCatalogEntryPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country = 'ALL' } = await searchParams;
  const [actor, countries, currencies, uoms, suppliers, pendingCount] = await Promise.all([
    getCatalogActor(),
    getCountries(),
    getCurrencies(),
    getUoms(),
    getSuppliers(),
    getPendingApprovalCount(),
  ]);
  if (!actor.canCreate) redirect('/catalog-manager/catalog');

  const managers = [...new Set(suppliers.map((s) => s.accountable_manager).filter(Boolean) as string[])].sort();

  return (
    <CatalogEntryFormClient
      initial={null}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      currencies={currencies.map((c) => ({ code: c.code }))}
      uoms={uoms.map((u) => ({ name: u.name }))}
      managers={managers}
      scope={country}
      pendingCount={pendingCount}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
    />
  );
}
