import type { QueryResultRow } from 'pg';
import { sql } from './db';

/**
 * A country's participation in a cycle.
 *
 * This module used to hold `scopeCountry`, which swept in every supplier above the cycle's
 * threshold in one go. Selection is a champion's judgement now — see
 * `src/app/actions/soa/scoping.ts` — and that function was removed rather than left exported,
 * because an unused server action is still a public POST endpoint, and this one would have
 * silently re-added every above-threshold supplier to a list somebody had just curated by hand.
 *
 * What remains is the row every selection needs to hang off.
 */

/**
 * Ensure the country has a row for this cycle, and return its id.
 *
 * A country's participation in a cycle is created lazily, on first scope, rather than seeded for
 * all 18 countries when a cycle opens: most countries are worked by one champion who starts when
 * they start, and eighteen `not_started` rows would make the rollup look like a wall of failure
 * from day one.
 */
export async function ensureCountryCycle(cycleId: number, countryId: string): Promise<number> {
  const rows = await sql<QueryResultRow[]>(
    `INSERT INTO country_cycles (cycle_id, country_id, status)
     VALUES (?, ?, 'not_started')
     ON CONFLICT (cycle_id, country_id) DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [cycleId, countryId],
  );
  return Number(rows[0].id);
}
