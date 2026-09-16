/*
 * Public Help & Training page for PO Expediting - no tool access required.
 * Training material (videos) is configured in PoExpeditingHelpContent; the
 * header comes from the /help layout.
 */
'use client';

import PoExpeditingHelpContent from '@/app/po-expediting/components/PoExpeditingHelpContent';

export default function PoExpeditingHelpPublicPage() {
  return (
    <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[#307c4c]/10">
          <svg
            className="h-4 w-4 text-[#307c4c]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.75}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"
            />
          </svg>
        </div>
        <p className="text-xs text-slate-400">PO Expediting / Help</p>
      </div>
      <PoExpeditingHelpContent />
    </main>
  );
}
