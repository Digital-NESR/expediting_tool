import { notFound, redirect } from 'next/navigation';
import { currentActor } from '@/lib/require-access';
import { travelScopeFor } from '@/lib/travel-analytics/grants';
import { visibleSections, type SectionId } from './sections';

/**
 * The gate every Supply Chain Analytics page runs before loading anything.
 *
 * The layout gates the segment too, but layouts do not re-render on navigation and layout and
 * page render in parallel, so each page re-checks the same rule. When the reader has neither
 * door the layout renders the Access Denied card, and this returns null so the page renders
 * nothing. A board the reader may not open (an admin-only board, for a travel reader) is a 404,
 * as it used to be a tab that was not drawn.
 */
export async function analyticsAccess(section?: SectionId) {
  const actor = await currentActor();
  if (!actor) redirect('/login');

  const scope = await travelScopeFor(actor.email);
  if (!actor.isPlatformAdmin && !scope) return null;

  if (section && !visibleSections(actor.isPlatformAdmin).some((s) => s.id === section)) {
    notFound();
  }
  return { actor, scope };
}
