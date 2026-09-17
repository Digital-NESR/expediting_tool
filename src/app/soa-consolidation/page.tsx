import { redirect } from 'next/navigation';
import { countriesFor, getSoaActor } from '@/lib/soa/access';
import { loadSoa } from '@/lib/soa/read';
import SoaConsolidationClient from './SoaConsolidationClient';
import type { Viewer } from './types';

/**
 * The tool's one route: say who is looking, then read the database for them.
 *
 * `data.ts` used to supply everything on this screen — 594 lines of invented vendors against a
 * "today" pinned to 21 July 2026. It is gone; `loadSoa` is the only source now, and every
 * mutation goes back through a server action and a `router.refresh()`, which re-runs this.
 *
 * `layout.tsx` has already turned away anyone without a role, so reaching here with none is a bug
 * rather than a state to render — the redirect is the belt to the layout's braces.
 */
export default async function SoaConsolidationPage({
  searchParams,
}: {
  // Next 16 hands search params as a promise; the country picker navigates to `?country=XX`.
  searchParams: Promise<{ country?: string }>;
}) {
  const actor = await getSoaActor();
  if (!actor) redirect('/login');
  if (actor.role === null) redirect('/home');

  const { country } = await searchParams;
  // `resolveCountry` falls back to the first country in scope for anything it does not recognise,
  // so a stale bookmark lands somewhere sensible rather than on an error.
  const payload = await loadSoa(actor, country ?? null);

  const viewer: Viewer = {
    name: actor.name,
    email: actor.email,
    role: actor.role,
    countries: countriesFor(actor, 'viewer'),
    champion: countriesFor(actor, 'champion'),
  };

  return <SoaConsolidationClient viewer={viewer} payload={payload} />;
}
