'use server';

import type { QueryResultRow } from 'pg';
import delegationPool from '@/lib/db-delegation';
import type { DelegationAppId, DelegationRow } from '@/lib/delegation-shared';

/* ============================================================================
   DELEGATION RESOLVER (slim) — Catalog Repo admin preview.

   The cross-app Delegations hub lives in the local-dev app; here we only need the
   read-side resolver so Catalog Repo can honor any active delegation grants.
   Everything is fail-safe: if delegation_db / the table is absent, returns [].
============================================================================ */

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}
function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isExpectedMissingDb(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === '3D000' || code === '42P01' || code === '57P03' || code === 'ECONNREFUSED' || code === 'ENOTFOUND';
}

let schemaPromise: Promise<void> | null = null;
async function ensureDelegationSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    await delegationPool.query(`CREATE TABLE IF NOT EXISTS delegations (
      id BIGSERIAL PRIMARY KEY,
      delegator_email TEXT NOT NULL,
      delegator_name TEXT,
      delegate_email TEXT NOT NULL,
      delegate_name TEXT,
      app TEXT NOT NULL DEFAULT 'all',
      starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ends_at TIMESTAMPTZ NOT NULL,
      note TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_by TEXT,
      revoked_at TIMESTAMPTZ
    )`);
    await delegationPool.query(`CREATE INDEX IF NOT EXISTS idx_delegations_delegate ON delegations (LOWER(delegate_email))`);
  })().catch((err) => {
    schemaPromise = null;
    throw err;
  });
  return schemaPromise;
}

/** Returns the people whose authority `myEmail` currently holds for `app`. Fail-safe → []. */
export async function getDelegatorsForApp(
  myEmail: string,
  app: DelegationAppId,
): Promise<{ email: string; name: string | null }[]> {
  const email = (myEmail ?? '').trim().toLowerCase();
  if (!email) return [];
  try {
    await ensureDelegationSchema();
    const result = await delegationPool.query(
      toPostgresQuery(
        `SELECT DISTINCT delegator_email, delegator_name
           FROM delegations
          WHERE LOWER(delegate_email) = ?
            AND status = 'active'
            AND NOW() BETWEEN starts_at AND ends_at
            AND (app = 'all' OR app = ?)`,
      ),
      [email, app],
    );
    const rows = serialise<DelegationRow[]>(result.rows as QueryResultRow[]);
    return rows.map((r) => ({ email: r.delegator_email, name: r.delegator_name }));
  } catch (err) {
    if (!isExpectedMissingDb(err)) console.warn('[delegation] resolver degraded to no-delegation:', (err as Error)?.message ?? err);
    return [];
  }
}
