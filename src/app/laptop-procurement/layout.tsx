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

  /* This comment used to describe a per-tool gate admitting global admins, holders of a
     laptop_permissions row, and active delegates. It has not worked that way for some time:
     canAccessLaptopApp returns true for anyone with an email, so the tool is open to every
     signed-in employee and the redirect below is unreachable. What a person may DO once inside
     is decided by the approver matrix and canCreateRequests, which are real checks. Leaving the
     call in place because narrowing it is a product decision, not a cleanup. */
  const allowed = await canAccessLaptopApp();
  if (!allowed) redirect('/home');

  return <>{children}</>;
}
