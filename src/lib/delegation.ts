/**
 * Delegation resolver: who has handed their authority to this person, for this tool.
 *
 * NOT a server action. It used to be the single export of a `'use server'` module, which made
 * it a public POST endpoint taking an email as its first argument — anyone signed in could ask
 * who had delegated to anyone else. Its one caller already resolves the email from the session,
 * so the argument was never meant to come from a client. A plain module cannot be POSTed to.
 *
 * FAIL-SAFE, AND CURRENTLY ALWAYS FAILING. The delegation hub lives outside this repository and
 * this app only reads from it. If the database or the table is absent the resolver returns an
 * empty list, so a missing hub degrades to "no delegations" rather than breaking an approval
 * screen. As of 16 Sep 2026 that is not hypothetical: `delegation_db` does not exist on the
 * configured Postgres server, so every call has been returning an empty list, and Catalog Repo
 * has been honouring no delegation grants at all. That was invisible before, because the
 * degraded path was silent — it now logs once per process.
 *
 * Two things this repository cannot answer, and which someone should write down:
 * which application owns the delegation hub, and whether `delegation_db` is supposed to exist
 * here at all. Until then `scripts/delegation-init-db.mjs` can create it.
 */

import type { QueryResultRow } from 'pg';
import delegationPool from '@/lib/db-delegation';
import { asSerialised, createSqlHelpers } from '@/lib/db/sql';
import { logger } from '@/lib/logger';
import type { DelegationAppId, DelegationRow } from '@/lib/delegation-shared';

const { sql } = createSqlHelpers(delegationPool);
const log = logger('delegation');

/**
 * The hub is optional infrastructure, so a missing database or table is an expected shape of
 * failure rather than a bug: 3D000 is "database does not exist", 42P01 "table does not exist",
 * 57P03 "cannot connect now", and the two Node codes are a host that is down or unresolvable.
 */
function isExpectedMissingDb(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return (
    code === '3D000' ||
    code === '42P01' ||
    code === '57P03' ||
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND'
  );
}

/**
 * Once per process, not once per call. This runs behind a Catalog Repo page, so logging every
 * degraded resolution would write a line on every render for every admin while telling nobody
 * anything new. One line per cold start is enough to notice that delegation is not working.
 */
let reportedUnavailable = false;

/**
 * Stop dialling a hub that is not there.
 *
 * Returning [] on a missing database made the failure harmless but not free. A connection to a
 * database that does not exist is never pooled -- Postgres rejects it after the TCP and TLS
 * handshake -- so unlike every other query in this app, which reuses a warm connection in about
 * ten milliseconds, this one paid the full handshake again on every single call. Measured
 * against the configured server: ~260ms per attempt, indefinitely, versus 9ms for a database
 * that exists.
 *
 * `loadCatalogActor` awaits this on every Catalog Repo page load and every server action, and
 * Catalog Repo is the only caller, which is exactly why it felt slower than the other tools.
 * Since the PIR screen re-renders on the server for each filter change, a quarter of a second
 * was being added to every interaction to ask a question whose answer was already known.
 *
 * So the first failure opens a breaker and later calls return [] without touching the pool. The
 * window is short enough that creating `delegation_db` starts being honoured within minutes
 * without a deploy, and long enough that a process never dials more than a handful of times.
 */
const UNAVAILABLE_RETRY_MS = 5 * 60 * 1000;
let unavailableUntil = 0;

/** The people whose authority `myEmail` currently holds for `app`. Never throws; worst case []. */
export async function getDelegatorsForApp(
  myEmail: string,
  app: DelegationAppId,
): Promise<{ email: string; name: string | null }[]> {
  const email = (myEmail ?? '').trim().toLowerCase();
  if (!email) return [];
  if (Date.now() < unavailableUntil) return [];
  try {
    const result = await sql<QueryResultRow[]>(
      `SELECT DISTINCT delegator_email, delegator_name
           FROM delegations
          WHERE LOWER(delegate_email) = ?
            AND status = 'active'
            AND NOW() BETWEEN starts_at AND ends_at
            AND (app = 'all' OR app = ?)`,
      [email, app],
    );
    const rows = asSerialised<DelegationRow[]>(result);
    return rows.map((r) => ({ email: r.delegator_email, name: r.delegator_name }));
  } catch (err) {
    if (isExpectedMissingDb(err)) {
      unavailableUntil = Date.now() + UNAVAILABLE_RETRY_MS;
      if (!reportedUnavailable) {
        reportedUnavailable = true;
        log.warn('hub.unavailable', {
          app,
          reason: (err as { code?: string } | null)?.code ?? 'unknown',
          effect: 'delegated authority is not being honoured; every lookup returns none',
          retryingInMs: UNAVAILABLE_RETRY_MS,
        });
      }
      return [];
    }
    log.error('resolve.failed', err, { app, email });
    return [];
  }
}
