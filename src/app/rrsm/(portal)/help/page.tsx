/*
 * Help, inside the tool.
 *
 * Inside the (portal) route group, so it sits behind the same gate as the board: somebody
 * reading this from within RRSM is already signed in, and the public copy at /help/rrsm covers
 * everyone else -- including suppliers, who have no NESR account.
 *
 * Same content component as the public page, for the same reason it is a component at all.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import RrsmHelpContent from '@/app/rrsm/components/RrsmHelpContent';

export const metadata: Metadata = { title: 'NESR | Help & Training - RRSM' };

export default function RrsmHelpPage() {
  return (
    <main className="min-h-screen bg-slate-50 font-sans">
      <div className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
        <Link
          href="/rrsm"
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to RRSM
        </Link>
        <RrsmHelpContent />
      </div>
    </main>
  );
}
