'use server';

/**
 * The one endpoint the favourites star needs.
 *
 * Every export of a `'use server'` file is a public POST endpoint, so this file holds exactly one
 * function and it takes no email: the address is read from the session here, never from the
 * caller. A toggle that accepted one would let anybody rewrite anybody's home page.
 */

import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { isKnownToolId, setFavourite } from '@/lib/home-favourites';

const log = logger('home-favourites-action');

export async function toggleFavourite(
  toolId: string,
  pinned: boolean,
): Promise<{ success: boolean; pinned: boolean }> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return { success: false, pinned: !pinned };

  if (!isKnownToolId(toolId)) {
    log.warn('toggleFavourite.unknownTool', { toolId });
    return { success: false, pinned: !pinned };
  }

  try {
    const now = await setFavourite(email, toolId, pinned);
    return { success: true, pinned: now };
  } catch (err) {
    log.error('toggleFavourite.failed', err);
    // The star has already moved in the browser; saying so lets it move back.
    return { success: false, pinned: !pinned };
  }
}
