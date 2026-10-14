import type { QueryResultRow } from 'pg';
import rfxOfficerPool from '@/lib/db-rfx-officer';
import { logger } from '@/lib/logger';

/**
 * The released purchase requisitions a requester can pick from.
 *
 * Read from RFx Officer's `released_prs`, which is line-level: 5,906 rows over 1,810 PRs. A
 * requester picks a PR, not a PR line, so the rows are rolled up to one entry per requisition
 * here rather than in the screen.
 *
 * A CONVENIENCE, NOT AN AUTHORITY. The table holds what RFx Officer has sourced, not every PR
 * SAP has released: only 9 of the 99 well-formed PR numbers already filed on adhoc requests
 * appear in it. So a PR missing from this list is an ordinary thing and the form accepts it on
 * format alone. Nothing here is allowed to become a validation rule, which is why this module
 * returns suggestions and knows nothing about whether a submission is acceptable.
 */

const log = logger('procure-guard-released-prs');

/** Enough rows to find what you meant, few enough to read without scrolling the page. */
const LIMIT = 25;

export interface ReleasedPrOption {
  /** The ten-digit requisition number. */
  pr: string;
  /** The first line's description, which is what makes one PR recognisable among many. */
  description: string;
  /** Lines on the requisition, so a one-line PR is distinguishable from a forty-line one. */
  lines: number;
  country: string;
  requisitioner: string;
  /** Release date as `yyyy-mm-dd`, or '' where the feed has none. */
  releasedOn: string;
}

/**
 * A PR's country as this feed spells it, matched against the country on the ProcureGuard form.
 *
 * The two lists disagree: the form offers `Saudi Arabia (KSA)` and `United Arab Emirates (UAE)`
 * where the feed says `Saudi Arabia` and `United Arab Emirates`, and the form has `HQ Dubai`,
 * `EOS` and `Other`, which the feed has no notion of.
 *
 * So the country only ever SORTS, never filters. A mapping that silently fails would empty the
 * picker and read as a broken feature, where a mis-sorted list is still a list.
 */
function countryKey(country: string | null | undefined): string {
  return String(country ?? '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

export async function searchReleasedPrs(
  query: string,
  country?: string | null,
): Promise<ReleasedPrOption[]> {
  const q = String(query ?? '').trim();
  const key = countryKey(country);

  try {
    /* Matched on the number and on the description, because a requester who has the paperwork
       searches by number and one who does not searches by what it was for.

       `pr_release_date_final` orders the result: the PR somebody is raising a payment against is
       almost always a recent one, so newest-first puts the answer at the top before any typing.
       The country sort runs ahead of it, which is the whole of its influence. */
    const { rows } = await rfxOfficerPool.query<QueryResultRow>(
      `SELECT trim(purchase_requisition)                       AS pr,
              COUNT(*)::int                                    AS lines,
              MIN(NULLIF(trim(description), ''))               AS description,
              MIN(NULLIF(trim(country), ''))                   AS country,
              MIN(NULLIF(trim(requisitioner), ''))             AS requisitioner,
              MAX(pr_release_date_final)                       AS released_on
         FROM released_prs
        WHERE ($1 = '' OR trim(purchase_requisition) LIKE $1 || '%' OR description ILIKE '%' || $1 || '%')
        GROUP BY trim(purchase_requisition)
        ORDER BY (lower(trim(COALESCE(MIN(country), ''))) = $2) DESC,
                 MAX(pr_release_date_final) DESC NULLS LAST,
                 trim(purchase_requisition) DESC
        LIMIT $3`,
      [q, key, LIMIT],
    );

    return rows.map((r) => ({
      pr: String(r.pr),
      description: String(r.description ?? ''),
      lines: Number(r.lines ?? 0),
      country: String(r.country ?? ''),
      requisitioner: String(r.requisitioner ?? ''),
      releasedOn: r.released_on instanceof Date ? r.released_on.toISOString().slice(0, 10) : '',
    }));
  } catch (err) {
    /* An empty list rather than a thrown page. This is a type-ahead beside a field that accepts
       a typed number anyway, so a database that is down costs the requester the convenience and
       not the request. */
    log.error('searchReleasedPrs.failed', err, { query: q });
    return [];
  }
}
