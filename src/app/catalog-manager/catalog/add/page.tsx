import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getCatalogActor,
  getCountries,
  getCurrencies,
  getUoms,
  getSuppliers,
  getServiceActivities,
  getPendingApprovalCount,
  getApprovalThresholds,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import AddEntriesClient from './AddEntriesClient';

export const metadata: Metadata = { title: 'NESR | Add Entries - Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function AddEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string; tab?: string }>;
}) {
  const sp = await searchParams;
  const [actor, countries, currencies, uoms, suppliers, services, pendingCount, thresholds] = await Promise.all([
    getCatalogActor(),
    getCountries(),
    getCurrencies(),
    getUoms(),
    getSuppliers(),
    getServiceActivities(),
    getPendingApprovalCount(),
    getApprovalThresholds(),
  ]);
  if (!actor.canCreate) redirect('/catalog-manager/catalog');

  const managers = [...new Set(suppliers.map((s) => s.accountable_manager).filter(Boolean) as string[])].sort();

  return (
    <AddEntriesClient
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      currencies={currencies.map((c) => ({ code: c.code, usd_rate: c.usd_rate }))}
      uoms={uoms.map((u) => ({ name: u.name }))}
      services={services.map((s) => s.text)}
      thresholds={thresholds}
      managers={managers}
      scope={sp.country ?? 'ALL'}
      initialTab={sp.tab === 'bulk' ? 'bulk' : sp.tab === 'grid' ? 'grid' : 'manual'}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
