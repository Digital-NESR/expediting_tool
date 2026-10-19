import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { currentActor } from '@/lib/require-access';
import { travelScopeFor } from '@/lib/travel-analytics/grants';
import { loadTravellerProfile } from '@/lib/travel-analytics/queries';
import TravellerProfileClient from './TravellerProfileClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'NESR | Traveller' };

/* The profile reads every booking in scope and folds one person out of it, which is the same
   work the board does. Same ceiling for the same reason. */
export const maxDuration = 30;

/**
 * One person's travel history.
 *
 * Gated exactly as the board is, and then gated again by the scope: `loadTravellerProfile`
 * filters this person's trips to the reader's countries, so a country reader opening a
 * colleague who also flies elsewhere sees their own countries' trips and nothing else.
 *
 * A person the reader may see nothing of is a 404 rather than an empty page. An empty history
 * looks like "they have never travelled", which is a different and wrong answer.
 */
export default async function TravellerPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  const scope = await travelScopeFor(actor.email);
  if (!scope) notFound();

  const { employeeId } = await params;
  const profile = await loadTravellerProfile(scope, decodeURIComponent(employeeId));
  if (!profile) notFound();

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6">
        <Link
          href="/supply-chain-analytics"
          className="flex items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Travel analytics
        </Link>
        <div className="h-5 w-px bg-gray-200" />
        <span className="truncate text-sm font-semibold text-slate-900">{profile.name}</span>
      </header>

      <main className="mx-auto w-full max-w-[1200px] px-4 py-5 sm:px-6">
        <TravellerProfileClient profile={profile} />
      </main>
    </div>
  );
}
