'use client';

import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

/* ─── Tool definitions ───────────────────────────────────────── */
interface Tool {
  name: string;
  description: string;
  href: string;
  status: 'active' | 'coming-soon';
  icon: React.ReactNode;
}

const TOOLS: Tool[] = [
  {
    name: 'PO Expediting',
    description:
      'Monitor open purchase orders, expedite delayed lines, and collect supplier delivery updates.',
    href: '/',
    status: 'active',
    icon: (
      <svg className="w-6 h-6 text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" />
      </svg>
    ),
  },
  {
    name: 'GRN & Invoice Reconciliation',
    description: 'Compare goods receipt notes against purchase orders and invoices to identify discrepancies before payment.',
    href: '#',
    status: 'coming-soon',
    icon: (
      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    name: 'Supply Chain Analytics',
    description: 'Real-time visibility into procurement performance, supplier KPIs, and delivery trends.',
    href: '#',
    status: 'coming-soon',
    icon: (
      <svg className="w-6 h-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
];

/* ─── Tool Card ──────────────────────────────────────────────── */
function ToolCard({ tool }: { tool: Tool }) {
  const isActive = tool.status === 'active';

  const cardClass = [
    'relative bg-white rounded-xl border p-8 flex flex-col gap-4 transition-all duration-200',
    isActive
      ? 'border-gray-200 cursor-pointer hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10 group'
      : 'border-gray-200 opacity-60 cursor-default select-none',
  ].join(' ');

  const inner = (
    <>
      {/* Coming soon badge */}
      {!isActive && (
        <span className="absolute top-4 right-4 bg-gray-100 text-gray-400 text-[11px] font-medium px-2 py-1 rounded-full">
          Coming Soon
        </span>
      )}

      {/* Icon */}
      <div
        className={[
          'w-12 h-12 rounded-xl flex items-center justify-center',
          isActive ? 'bg-[#307c4c]/10' : 'bg-gray-100',
        ].join(' ')}
      >
        {tool.icon}
      </div>

      {/* Text */}
      <div className="flex-1">
        <h3
          className={[
            'text-[18px] font-semibold',
            isActive ? 'text-slate-900' : 'text-gray-400',
          ].join(' ')}
        >
          {tool.name}
        </h3>
        <p className="text-sm text-gray-500 mt-2 leading-relaxed">{tool.description}</p>
      </div>

      {/* Open link */}
      {isActive && (
        <span className="text-sm font-semibold text-[#307c4c] group-hover:underline mt-auto">
          Open →
        </span>
      )}
    </>
  );

  if (isActive) {
    return (
      <Link href={tool.href} className={cardClass}>
        {inner}
      </Link>
    );
  }

  return <div className={cardClass}>{inner}</div>;
}

/* ─── Page ───────────────────────────────────────────────────── */
export default function HomePage() {
  const { data: session } = useSession();

  const rawName = session?.user?.name ?? '';
  const firstName = rawName.split(' ')[0] || 'there';
  const userDisplay = session?.user?.name || session?.user?.email || '';

  return (
    <div className="min-h-[100dvh] bg-gray-50 font-sans text-slate-900">

      {/* ── Header ── */}
      <header className="h-16 bg-white border-b border-gray-200 px-6 lg:px-8 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image
            src="/nesr-logo-circle.png"
            alt="NESR"
            width={36}
            height={36}
            className="rounded-full"
          />
          <span className="font-semibold text-slate-900 text-sm tracking-tight">
            NESR Digital Supply Chain
          </span>
        </div>

        <div className="flex items-center gap-4">
          {userDisplay && (
            <span className="text-sm text-slate-500 hidden sm:block">{userDisplay}</span>
          )}
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-red-600 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">

        {/* Welcome */}
        <div className="mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            Welcome, {firstName}
          </h1>
          <p className="text-slate-500 mt-1 text-base">Select a tool to get started.</p>
        </div>

        {/* Tools grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOOLS.map((tool) => (
            <ToolCard key={tool.name} tool={tool} />
          ))}
        </div>

      </main>
    </div>
  );
}
