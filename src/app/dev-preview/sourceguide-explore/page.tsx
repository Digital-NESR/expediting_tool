/*
 * A signed-out view of the SourceGuide Explorer, for development only.
 *
 * The Explorer is behind SSO and behind a SourceGuide access check, and it is the screen where
 * the things that can go wrong are the things a test suite cannot see: a 58-supplier node that
 * overflows its panel, a commodity chip row that wraps badly, a count sitting on top of a
 * label. So it gets a route that can actually be opened and driven.
 *
 * Dev-only twice over, the same as `/dev-preview/chain`: `notFound()` removes it from a
 * production build, and the `/dev-preview` entry in src/proxy.ts is only added outside
 * production, so the auth gate still covers it even if this file were reached.
 *
 * The data is real — it reads the same tables the action reads — but the access check is
 * bypassed, which is exactly why this must never exist in production.
 */
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import sourceGuidePool from '@/lib/db-sourceguide';
import { isCentrallyBlocked } from '@/lib/sourceguide/blocked';
import type { SgExplorerDataset } from '@/app/actions/sourceguide/explore';
import { CountryScopeProvider } from '@/app/sourceguide/CountryScope';
import { SourceGuideAccessProvider } from '@/app/sourceguide/SourceGuideAccessContext';
import ExplorerClient from '@/app/sourceguide/explore/ExplorerClient';

export const dynamic = 'force-dynamic';

export default async function ExplorerPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ country?: string }>;
}) {
  if (process.env.NODE_ENV === 'production') notFound();

  /* Defaults to the widest node+country pair in the data — Facility > Operations & Maintenance
     in Oman, 58 suppliers — because that is the case the layout has to survive. */
  const { country = 'OM' } = await searchParams;

  const [commodities, facts, suppliers, countries] = await Promise.all([
    sourceGuidePool.query(
      `SELECT id, name, code, category, sub_category, family, spend_type FROM sg_commodities`,
    ),
    sourceGuidePool.query(
      `SELECT commodity_id, country_code, supplier_code, tier
         FROM sg_mappings WHERE status = 'Active'`,
    ),
    sourceGuidePool.query(
      `SELECT a.supplier_code, a.name, a.central_block_status
         FROM supplier_avl a
        WHERE EXISTS (SELECT 1 FROM sg_mappings m
                       WHERE m.supplier_code = a.supplier_code AND m.status = 'Active')`,
    ),
    sourceGuidePool.query(`SELECT code, name, tone FROM sg_countries ORDER BY sort_order, name`),
  ]);

  const data: SgExplorerDataset = {
    commodities: commodities.rows.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      category: r.category,
      subCategory: r.sub_category,
      family: r.family,
      spendType: r.spend_type,
    })),
    facts: facts.rows.map((r) => [
      Number(r.commodity_id),
      r.country_code,
      r.supplier_code,
      r.tier === 'Preferred' ? 1 : 0,
    ]),
    suppliers: suppliers.rows.map((r) => ({
      code: r.supplier_code,
      name: r.name,
      blocked: isCentrallyBlocked(r.central_block_status),
    })),
    countries: countries.rows,
    canManage: true,
  };

  const bytes = JSON.stringify(data).length;

  return (
    <main className="min-h-screen bg-[#f5f6f5]">
      <div className="border-b border-amber-200 bg-amber-50 px-6 py-2.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
          Development preview · not reachable in production
        </p>
        <p className="mt-0.5 text-[12px] text-amber-800">
          Scoped to <b>{country === 'ALL' ? 'all countries' : country}</b>. Payload{' '}
          {(bytes / 1024).toFixed(0)} KB · {data.commodities.length} commodities ·{' '}
          {data.facts.length} mappings · {data.suppliers.length} suppliers. Add{' '}
          <code>?country=ALL</code> or any country code to change the scope.
        </p>
      </div>
      <SourceGuideAccessProvider isAdmin approvedCountries={[]} viewOnly={false} userName="Preview">
        <Suspense fallback={null}>
          <CountryScopeProvider initialCountry={country === 'ALL' ? undefined : country}>
            <ExplorerClient data={data} />
          </CountryScopeProvider>
        </Suspense>
      </SourceGuideAccessProvider>
    </main>
  );
}
