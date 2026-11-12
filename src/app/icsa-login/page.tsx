import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { DEMO_USERS, currentDemoUser, demoEnabled } from '@/lib/icsa/demo';
import DemoLoginForm from './DemoLoginForm';

export const metadata: Metadata = { title: 'NESR | ICSA demo sign-in' };
export const dynamic = 'force-dynamic';

const ROLE_LABEL = { admin: 'Admin', champion: 'Champion', employee: 'Employee' } as const;

/**
 * The ICSA demo sign-in. Lives outside /icsa because the /icsa layout sends signed-out
 * visitors here, and a page inside that layout would send them round in a loop.
 */
export default async function IcsaLoginPage() {
  if (!demoEnabled()) redirect('/login');
  if (await currentDemoUser()) redirect('/icsa');

  const people = DEMO_USERS.map((d) => ({
    username: d.username,
    role: ROLE_LABEL[d.role],
    country: d.country,
  }));

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-[#307c4c]">
          SC Agents · demo
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">ICSA sign-in</h1>
        <p className="mt-2 text-sm text-slate-600">
          Internal Control Self-Assessment. Pick a demo person to see ICSA as an admin, a champion
          or an employee. Every demo person uses the same demo password.
        </p>
        <DemoLoginForm people={people} />
      </div>
    </main>
  );
}
