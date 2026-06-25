import type { Metadata } from 'next';
import {
  getCatalogAnalyticsData,
  getCatalogActor,
  getCountries,
  getPendingApprovalCount,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import CatalogAnalyticsClient from './CatalogAnalyticsClient';

export const metadata: Metadata = { title: 'Analytics | NESR Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function CatalogAnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country = 'ALL' } = await searchParams;
  const [data, actor, countries, pendingCount] = await Promise.all([
    getCatalogAnalyticsData(country),
    getCatalogActor(),
    getCountries(),
    getPendingApprovalCount(country),
  ]);
  return (
    <CatalogAnalyticsClient
      data={data}
      scope={country}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
