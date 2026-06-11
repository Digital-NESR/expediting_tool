'use client';

import { useState } from 'react';
import type { ProcureGuardAccessView } from '@/types/procureGuard';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../components/ProcureGuardHomeButton';
import ProcureGuardHelpContent from '../components/ProcureGuardHelpContent';

export default function ProcureGuardHelpClient({ accessView }: { accessView: ProcureGuardAccessView }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} accessView={accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">Help &amp; Training</span>
      </header>

      <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
        <ProcureGuardHelpContent />
      </main>
    </div>
  );
}
