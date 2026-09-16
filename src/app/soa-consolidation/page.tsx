import { redirect } from 'next/navigation';
import { countriesFor, getSoaActor } from '@/lib/soa/access';
import SoaConsolidationClient from './SoaConsolidationClient';
import type { Viewer } from './types';

/**
 * The tool's one route, as a server component whose only job is to say who is looking.
 *
 * The role and the country scope used to be a dropdown in the navbar; they now come off the
 * actor's grants, resolved here and handed to the client as plain data. `layout.tsx` has already
 * turned away anyone without a role, so reaching this with none is a bug rather than a state to
 * render — the redirect is the belt to the layout's braces, not the real gate.
 */
export default async function SoaConsolidationPage() {
  const actor = await getSoaActor();
  if (!actor) redirect('/login');
  if (actor.role === null) redirect('/home');

  const viewer: Viewer = {
    name: actor.name,
    email: actor.email,
    role: actor.role,
    countries: countriesFor(actor, 'viewer'),
  };

  return <SoaConsolidationClient viewer={viewer} />;
}
