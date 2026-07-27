import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { canAccessLaptopApp } from '@/app/actions/laptopProcurement';

export const metadata: Metadata = { title: 'NESR | Laptop Procurement' };
export const dynamic = 'force-dynamic';

export default async function LaptopProcurementLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect('/login');

  // Real per-tool gate: global admins, anyone with an explicit laptop_permissions
  // row, or anyone with an active delegation. Everyone else is bounced to the tool
  // picker.
  const allowed = await canAccessLaptopApp();
  if (!allowed) redirect('/home');

  return <>{children}</>;
}
