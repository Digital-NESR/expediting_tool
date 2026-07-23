import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import {
  getCatalogActor,
  getCountries,
  getCurrencies,
  getUoms,
  getSuppliers,
  getUsers,
  getCategoriesWithSubs,
  getCountryApprovers,
  getApprovalThresholds,
  getServiceActivities,
  getPendingApprovalCount,
  getCatalogAnalyticsData,
  getPirMeta,
  listCatalogEntries,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import AdminClient from './AdminClient';

export const metadata: Metadata = { title: 'NESR | Administration - Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) redirect('/catalog-manager');

  const [countries, currencies, uoms, suppliers, users, categories, approvers, thresholds, services, pendingCount, analytics, pirMeta, allEntries] = await Promise.all([
    getCountries(),
    getCurrencies(),
    getUoms(),
    getSuppliers(),
    getUsers(),
    getCategoriesWithSubs(),
    getCountryApprovers(),
    getApprovalThresholds(),
    getServiceActivities(),
    getPendingApprovalCount(),
    getCatalogAnalyticsData('ALL'),
    getPirMeta(),
    listCatalogEntries({ country: 'ALL' }),
  ]);
  const pendingPreview = allEntries.filter((e) => e.status === 'Pending Approval').slice(0, 5);

  return (
    <AdminClient
      countries={countries}
      currencies={currencies}
      uoms={uoms}
      suppliers={suppliers}
      users={users}
      categories={categories.map((c) => ({ id: c.id, name: c.name, type: c.type, status: c.status, subs: c.subs.map((s) => s.name) }))}
      approvers={approvers}
      thresholds={thresholds}
      services={services}
      pendingCount={pendingCount}
      analytics={analytics}
      pirStats={pirMeta.stats}
      pendingPreview={pendingPreview}
      roleLabel={getPermissionProfile(actor.role).description}
    />
  );
}
