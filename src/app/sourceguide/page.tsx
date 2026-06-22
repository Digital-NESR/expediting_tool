import type { Metadata } from 'next';
import { getStats, getCategories } from '@/app/actions/sourceguide';
import DashboardClient from './DashboardClient';

export const metadata: Metadata = { title: 'SourceGuide — Dashboard | SC Agents' };

export default async function SourceGuideDashboardPage() {
  const [stats, categories] = await Promise.all([getStats(), getCategories()]);
  return <DashboardClient stats={stats} categories={categories} />;
}
