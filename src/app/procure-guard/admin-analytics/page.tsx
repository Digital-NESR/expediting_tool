import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'Admin Analytics | ProcureGuard' };
export const dynamic = 'force-dynamic';

export default function AdminAnalyticsPage() {
  redirect('/admin?tool=procureguard-usage');
}
