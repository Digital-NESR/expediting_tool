import type { Metadata } from 'next';
import { getStats, getCategories, getCountries, getSearchFacets } from '@/app/actions/sourceguide';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = { title: 'SourceGuide Dashboard | SC Agents' };

export default async function SourceGuideDashboardPage() {
  const [stats, categories, countries, facets] = await Promise.all([
    getStats(), getCategories(), getCountries(), getSearchFacets(),
  ]);
  const countryTiles = countries.map(c => ({
    code: c.code,
    name: c.name,
    tone: c.tone,
    commodities: facets.countries.find(f => f.code === c.code)?.count ?? 0,
  }));
  return <DashboardClient stats={stats} categories={categories} countries={countryTiles} />;
}
