import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'NESR | Admin Analytics - ProcureGuard' };
export const dynamic = 'force-dynamic';

export default function AdminAnalyticsPage() {
  redirect('/admin?tool=procureguard-usage');
}
