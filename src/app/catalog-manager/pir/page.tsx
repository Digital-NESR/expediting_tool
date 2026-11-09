import type { Metadata } from 'next';
import {
  listPirEntries,
  getPirMeta,
  getCatalogActor,
  getPendingApprovalCount,
  type PirSort,
} from '@/app/actions/catalog-manager';
import { getPermissionProfile } from '@/lib/catalog-manager-utils';
import PirCatalogClient from './PirCatalogClient';

export const metadata: Metadata = { title: 'NESR | PIR / Inventory - Catalog Manager' };
export const dynamic = 'force-dynamic';

const SORTS: PirSort[] = ['supplier', 'priceHi', 'priceLo', 'record'];

export default async function PirCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    country?: string;
    porg?: string;
    plant?: string;
    mgroup?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const query = {
    q: sp.q ?? '',
    country: sp.country ?? '',
    porg: sp.porg ?? '',
    plant: sp.plant ?? '',
    mgroup: sp.mgroup ?? '',
    sort: (SORTS.includes(sp.sort as PirSort) ? sp.sort : 'supplier') as PirSort,
    page: Math.max(1, Number(sp.page) || 1),
  };

  const [result, meta, actor, pendingCount] = await Promise.all([
    listPirEntries(query),
    getPirMeta(),
    getCatalogActor(),
    getPendingApprovalCount(),
  ]);

  return (
    <PirCatalogClient
      rows={result.rows}
      total={result.total}
      page={result.page}
      pageSize={result.pageSize}
      /* What the filters currently match, straight off the same count that produced the rows. */
      stats={result.stats}
      /* The whole mirror. The cards use it only as a denominator, so a filtered figure can
         never be mistaken for the total. Facets stay whole too, or narrowing a filter would
         delete the options needed to widen it again. */
      totals={meta.stats}
      facets={meta.facets}
      filters={query}
      roleLabel={getPermissionProfile(actor.role).description}
      canApprove={actor.canApprove}
      canAdmin={actor.canAdmin}
      pendingCount={pendingCount}
    />
  );
}
