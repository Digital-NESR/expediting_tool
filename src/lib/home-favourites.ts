/**
 * Reading and writing a person's pinned tools.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and the home page is a server component that can read this directly. Only the toggle
 * needs to be callable from the browser, and that lives in `@/app/actions/home-favourites`.
 *
 * Nothing here takes an email from a caller. Every function is handed one that the action already
 * resolved from the session, because a favourites list keyed on a parameter is a favourites list
 * anybody can read or rewrite by passing somebody else's address.
 */

import pool from '@/lib/db';
import { logger } from '@/lib/logger';
import { requireSchema } from '@/lib/db/schema-version';
import { TOOLS } from '@/app/home/tools';

const log = logger('home-favourites');

/** Card ids the launcher actually renders. Anything else is not a tool and is not stored. */
const KNOWN_TOOL_IDS: ReadonlySet<string> = new Set(TOOLS.map((t) => t.id));

export function isKnownToolId(toolId: string): boolean {
  return KNOWN_TOOL_IDS.has(toolId);
}

/**
 * One person's pins, newest first.
 *
 * Returns an empty list rather than throwing. The home page is the first thing an employee sees
 * each morning and it has fifteen other things to render: a favourites section that is briefly
 * empty is a smaller failure than a launcher that will not load, and the next read fixes it.
 */
export async function listFavourites(userEmail: string): Promise<string[]> {
  if (!userEmail) return [];
  try {
    await requireSchema(pool, 'default', '002_home_favourites');
    const { rows } = await pool.query<{ tool_id: string }>(
      `SELECT tool_id FROM home_favourites WHERE user_email = $1 ORDER BY pinned_at DESC`,
      [userEmail.trim().toLowerCase()],
    );
    /* A pin for a card that no longer exists is dropped on the way out rather than deleted. The
       row is harmless, and a tool that comes back under its old id finds its pins waiting. */
    return rows.map((r) => r.tool_id).filter(isKnownToolId);
  } catch (err) {
    log.error('listFavourites.failed', err);
    return [];
  }
}

/**
 * Pin or unpin, and say which it ended up as.
 *
 * The caller is a button that has already moved, so the return value is what the UI reconciles
 * against: if the write lost a race with another tab, the answer here is the truth.
 */
export async function setFavourite(
  userEmail: string,
  toolId: string,
  pinned: boolean,
): Promise<boolean> {
  const email = userEmail.trim().toLowerCase();
  if (!email || !isKnownToolId(toolId)) return false;

  await requireSchema(pool, 'default', '002_home_favourites');
  if (pinned) {
    /* ON CONFLICT DO NOTHING, not an upsert: re-pinning something already pinned should leave
       `pinned_at` where it is rather than jumping the card to the front of somebody's list. */
    await pool.query(
      `INSERT INTO home_favourites (user_email, tool_id) VALUES ($1, $2)
       ON CONFLICT (user_email, tool_id) DO NOTHING`,
      [email, toolId],
    );
    return true;
  }
  await pool.query(`DELETE FROM home_favourites WHERE user_email = $1 AND tool_id = $2`, [
    email,
    toolId,
  ]);
  return false;
}
