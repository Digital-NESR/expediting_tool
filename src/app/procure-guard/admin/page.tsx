import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = { title: 'NESR | Admin Panel - ProcureGuard' };
export const dynamic = 'force-dynamic';

export default function AdminPage() {
  redirect('/admin?tool=procureguard-admin');
}
