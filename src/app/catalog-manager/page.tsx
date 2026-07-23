import type { Metadata } from 'next';
import {
  getCatalogManagerDashboardData,
  getCatalogActor,
  getCountries,
} from '@/app/actions/catalog-manager';
import CatalogManagerDashboardClient from './CatalogManagerDashboardClient';

export const metadata: Metadata = { title: 'NESR | Catalog Manager' };
export const dynamic = 'force-dynamic';

export default async function CatalogManagerDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  const { country = 'ALL' } = await searchParams;
  const [data, actor, countries] = await Promise.all([
    getCatalogManagerDashboardData(country),
    getCatalogActor(),
    getCountries(),
  ]);
  return (
    <CatalogManagerDashboardClient
      data={data}
      actor={actor}
      scope={country}
      countries={countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag }))}
    />
  );
}
