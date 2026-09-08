'use client';

import { useState } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import PoExpeditingHelpContent from '../components/PoExpeditingHelpContent';

export default function PoExpeditingHelpPage() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-[100dvh] w-full bg-white overflow-hidden font-sans text-slate-900 relative">
      <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
      <main className="flex-1 flex flex-col h-full relative bg-white">
        {/* Sticky top nav (matches the dashboard) */}
        <header className="h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="mr-2 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors focus:ring-2 focus:ring-[#307c4c]/50 focus:outline-none"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#307c4c]">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
                <line x1="12" y1="3" x2="12" y2="21" />
              </svg>
            </span>
            <span className="text-lg font-bold text-gray-900 tracking-tight">NESR</span>
            <span className="hidden sm:inline text-gray-300 select-none">·</span>
            <span className="hidden sm:inline text-sm font-medium text-gray-500">PO Expediting Help</span>
          </div>
          <Link
            href="/po-expediting"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-[#307c4c]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
        </header>

        <div className="flex-1 overflow-y-auto px-4 sm:px-8 py-8 scroll-smooth">
          <div className="mx-auto max-w-[900px]">
            <PoExpeditingHelpContent />
          </div>
        </div>
      </main>
    </div>
  );
}
