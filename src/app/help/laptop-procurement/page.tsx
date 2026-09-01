/*
 * Public Help & Training page for Laptop Procurement — no auth required.
 * Training material is authored in LaptopHelpContent.
 */
'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LaptopLogoMark } from '@/app/laptop-procurement/components/LaptopProcurementLogo';
import LaptopHelpContent from '@/app/laptop-procurement/components/LaptopHelpContent';

export default function LaptopProcurementHelpPublicPage() {
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
          <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md border border-[#307c4c]/15 bg-white p-0.5">
            <LaptopLogoMark className="h-full w-full" />
          </div>
          <p className="text-xs text-slate-400">Laptop Procurement / Help</p>
        </div>
        <h1 className="mb-1 text-2xl font-bold tracking-tight">Help &amp; Training</h1>
        <p className="mb-6 text-sm text-slate-500">Choose your role, then read the guide for it.</p>
        <LaptopHelpContent />
      </main>
    </div>
  );
}
