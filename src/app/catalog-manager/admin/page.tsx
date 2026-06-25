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
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import AdminClient from './AdminClient';

export const metadata: Metadata = { title: 'Administration | NESR Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const actor = await getCatalogActor();
  if (!actor.canAdmin) redirect('/catalog-manager');

  const [countries, currencies, uoms, suppliers, users, categories, approvers, thresholds, services, pendingCount] = await Promise.all([
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
  ]);

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
      roleLabel={getPermissionProfile(actor.role).description}
    />
  );
}
