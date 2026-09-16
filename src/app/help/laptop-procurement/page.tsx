/*
 * Public Help & Training page for Laptop Procurement — no auth required.
 * Training material is authored in LaptopHelpContent; the header comes from
 * the /help layout.
 */
'use client';

import { LaptopLogoMark } from '@/app/laptop-procurement/components/LaptopProcurementLogo';
import LaptopHelpContent from '@/app/laptop-procurement/components/LaptopHelpContent';

export default function LaptopProcurementHelpPublicPage() {
  return (
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
  );
}
