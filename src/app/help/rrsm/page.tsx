/*
 * Public Help & Training page for RRSM — no auth required, which is what the ? on the tile
 * opens and what can be sent to a supplier who has no NESR account at all.
 *
 * The content lives in RrsmHelpContent so this page and the in-tool one at /rrsm/help cannot
 * drift: two copies of the same instructions always do, and the one people read is never the
 * one somebody remembered to update.
 */
import type { Metadata } from 'next';
import { Forklift } from 'lucide-react';
import RrsmHelpContent from '@/app/rrsm/components/RrsmHelpContent';
import { readProcessCountries } from '@/lib/rrsm/process-countries';

export const metadata: Metadata = { title: 'NESR | Help & Training - RRSM' };
/* The process map reads each country's current steps, so the page is rendered per request. */
export const dynamic = 'force-dynamic';

export default async function RrsmHelpPublicPage() {
  const countries = await readProcessCountries();
  return (
    <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#307c4c]/15 bg-white">
          <Forklift className="h-3.5 w-3.5 text-[#307c4c]" />
        </div>
        <p className="text-xs text-slate-400">RRSM / Help</p>
      </div>
      <RrsmHelpContent countries={countries} />
    </main>
  );
}
