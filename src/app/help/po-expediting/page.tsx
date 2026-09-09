/*
 * Public Help & Training page for PO Expediting - no tool access required.
 * Training material (videos) is configured in PoExpeditingHelpContent.
 */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import PoExpeditingHelpContent from '@/app/po-expediting/components/PoExpeditingHelpContent';

export default function PoExpeditingHelpPublicPage() {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-6">
        <Image src="/nesr-logo-circle.png" alt="NESR" width={30} height={30} className="rounded-full" />
        <span className="text-sm font-semibold tracking-tight text-slate-900">NESR Digital Supply Chain</span>
        <div className="flex-1" />
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </header>

      <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#307c4c]/10">
            <svg className="h-4 w-4 text-[#307c4c]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11" />
            </svg>
          </div>
          <p className="text-xs text-slate-400">PO Expediting / Help</p>
        </div>
        <PoExpeditingHelpContent />
      </main>
    </div>
  );
}
