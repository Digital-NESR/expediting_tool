import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import {
  getCatalogActor,
  getCatalogEntry,
  getCountries,
  getCurrencies,
  getUoms,
  getSuppliers,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogEntryFormClient from '../../CatalogEntryFormClient';

export const metadata: Metadata = { title: 'NESR | Edit Entry - Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function EditCatalogEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [actor, entry, countries, currencies, uoms, suppliers, pendingCount] = await Promise.all([
    getCatalogActor(),
    getCatalogEntry(Number(id)),
    getCountries(),
    getCurrencies(),
    getUoms(),
    getSuppliers(),
    getPendingApprovalCount(),
  ]);
  if (!entry) notFound();
  if (!actor.canCreate) redirect(`/catalog-manager/catalog/${id}`);

  const managers = [...new Set(suppliers.map((s) => s.accountable_manager).filter(Boolean) as string[])].sort();

  return (
    <CatalogEntryFormClient
      initial={entry}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      currencies={currencies.map((c) => ({ code: c.code }))}
      uoms={uoms.map((u) => ({ name: u.name }))}
      managers={managers}
      scope="ALL"
      pendingCount={pendingCount}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
    />
  );
}
