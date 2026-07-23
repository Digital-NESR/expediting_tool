import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getCountryDashboard } from '@/app/actions/sourceguide';
import CountryDashboardClient from './CountryDashboardClient';

export const metadata: Metadata = { title: 'NESR | Country Guide - SourceGuide' };

export default async function CountryDashboardPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const data = await getCountryDashboard(decodeURIComponent(code));
  if (!data) notFound();
  return <CountryDashboardClient data={data} />;
}
