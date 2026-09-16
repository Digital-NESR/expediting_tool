/*
 * Public Help & Training page for ProcureGuard — no auth required.
 * Training material is configured in ProcureGuardHelpContent; the header comes
 * from the /help layout.
 * Client component: ProcureGuardHelpContent is stateful and declares no
 * boundary of its own.
 */
'use client';

import Image from 'next/image';
import ProcureGuardHelpContent from '@/app/procure-guard/components/ProcureGuardHelpContent';

export default function ProcureGuardHelpPublicPage() {
  return (
    <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="h-6 w-6 shrink-0 overflow-hidden rounded-md border border-[#307c4c]/15 bg-white">
          <Image
            src="/procureguard-logo.jpg"
            alt="ProcureGuard"
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        </div>
        <p className="text-xs text-slate-400">ProcureGuard / Help</p>
      </div>
      <ProcureGuardHelpContent />
    </main>
  );
}
