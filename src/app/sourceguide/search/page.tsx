import type { Metadata } from 'next';
import { getCountries, getCategories, getSearchFacets } from '@/app/actions/sourceguide';
import SearchClient from './SearchClient';

export const metadata: Metadata = { title: 'NESR | Search - SourceGuide' };

export default async function SourceGuideSearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; cat?: string; country?: string; tier?: string; spend?: string }>;
}) {
  const sp = searchParams ? await searchParams : {};
  const [countries, categories, facets] = await Promise.all([
    getCountries(), getCategories(), getSearchFacets(),
  ]);

  const initial = {
    q: sp.q ?? '',
    categories: sp.cat ? sp.cat.split(',').filter(Boolean) : [],
    countries: sp.country ? sp.country.split(',').filter(Boolean) : [],
    tiers: (sp.tier ? sp.tier.split(',').filter(Boolean) : []) as ('Preferred' | 'Backup')[],
    spendTypes: sp.spend ? sp.spend.split(',').filter(Boolean) : [],
  };

  return (
    <SearchClient
      countries={countries}
      categories={categories}
      facets={facets}
      initialQuery={initial.q}
      initialFilters={{
        categories: initial.categories,
        countries: initial.countries,
        tiers: initial.tiers,
        spendTypes: initial.spendTypes,
      }}
    />
  );
}
