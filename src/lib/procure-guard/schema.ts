/**
 * ProcureGuard DDL guards and reference-number allocation.
 *
 * A plain module, deliberately NOT `'use server'`: DDL must never be reachable as a POST endpoint.
 * The SQL here is carried over byte-for-byte from the old actions file.
 */
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { exec, sql } from './internals';
import type { ExecResult } from './internals';

const log = logger('procure-guard');

async function execSchema(statement: string) {
  try {
    await exec(statement);
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
    if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
  }
}

export async function ensureProcureGuardUsageTables(): Promise<void> {
  await execSchema(`
    CREATE TABLE IF NOT EXISTS procure_guard_usage_events (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'click')),
      path TEXT NOT NULL,
      page_title TEXT,
      target_tag TEXT,
      target_text TEXT,
      target_href TEXT,
      target_role TEXT,
      duration_ms INTEGER,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_occurred_at ON procure_guard_usage_events (occurred_at DESC)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_path ON procure_guard_usage_events (path)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_user ON procure_guard_usage_events (user_email)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_type ON procure_guard_usage_events (event_type)`);
}

export async function ensureProcureGuardAccessRequestTable(): Promise<void> {
  await execSchema(`
    CREATE TABLE IF NOT EXISTS procure_guard_access_requests (
      user_email TEXT PRIMARY KEY,
      display_name TEXT,
      job_title TEXT,
      department TEXT,
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Revoked')),
      requested_role TEXT NOT NULL DEFAULT 'Requester',
      approved_role TEXT,
      country TEXT,
      segment TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT,
      notes TEXT
    )
  `);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_access_requests_status ON procure_guard_access_requests (status)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_access_requests_requested_at ON procure_guard_access_requests (requested_at DESC)`);
}

export async function ensureProcureGuardPermissionRoleValues(): Promise<void> {
  try {
    await exec(`ALTER TYPE procure_guard_permission_role ADD VALUE IF NOT EXISTS 'Analyst'`);
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
    if (code !== '42710' && code !== '42704') throw err;
  }
}

// Creates the UNIQUE indexes on reference_number and reports, once per process, whether
// they are actually in place. If legacy duplicate references block an index, this logs a
// warning with the offending values instead of failing — so the diagnostic never breaks a
// create. Memoized so it runs (and logs) only on the first request after startup.
let referenceUniquenessChecked: Promise<void> | null = null;

export async function ensureProcureGuardReferenceUniqueness(): Promise<void> {
  if (referenceUniquenessChecked) return referenceUniquenessChecked;
  referenceUniquenessChecked = (async () => {
    // Sequential reference numbers (ADH-000001 / ADV-000001) are drawn from these per-type
    // sequences. CREATE ... IF NOT EXISTS is a no-op once they exist, so this never resets the
    // counter on a populated database (the renumber migration set them); on a fresh DB they
    // start at 1.
    try {
      await exec(`CREATE SEQUENCE IF NOT EXISTS procure_guard_adhoc_reference_seq`);
      await exec(`CREATE SEQUENCE IF NOT EXISTS procure_guard_advance_reference_seq`);
    } catch (err) {
      log.warn('reference.sequenceEnsureFailed', { reason: err instanceof Error ? err.message : String(err) });
    }
    const targets = [
      { table: 'procure_guard_adhoc_payments', index: 'uq_procure_guard_adhoc_reference_number' },
      { table: 'procure_guard_advance_payments', index: 'uq_procure_guard_advance_reference_number' },
    ];
    for (const { table, index } of targets) {
      try {
        try {
          await exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${index} ON ${table} (reference_number)`);
        } catch (err) {
          const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
          // 23505 = duplicate data blocks the index; 42P07/42710 = index already exists.
          if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
        }
        const present = await sql<QueryResultRow[]>(`SELECT 1 FROM pg_indexes WHERE indexname = ? LIMIT 1`, [index]);
        if (present.length > 0) {
          log.debug('reference.uniquenessEnforced', { table, index });
        } else {
          const dups = await sql<QueryResultRow[]>(
            `SELECT reference_number, COUNT(*)::int AS n FROM ${table}
             GROUP BY reference_number HAVING COUNT(*) > 1 ORDER BY n DESC LIMIT 5`,
          );
          log.warn('reference.uniquenessNotEnforced', {
            table,
            index,
            hint: 'De-duplicate the reference numbers below, then restart to enforce.',
            duplicates: dups.map(r => `${r.reference_number} x${r.n}`),
          });
        }
      } catch (err) {
        log.warn('reference.uniquenessCheckFailed', { table, reason: err instanceof Error ? err.message : String(err) });
      }
    }
  })();
  return referenceUniquenessChecked;
}

// Sequential, human-friendly reference numbers: ADH-000001, ADV-000001, ... drawn atomically
// from a per-type Postgres sequence (nextval is concurrency-safe, so no two requests collide).
// The UNIQUE index on reference_number remains the hard backstop.
async function makeReference(prefix: 'ADH' | 'ADV'): Promise<string> {
  await ensureProcureGuardReferenceUniqueness();
  const seq = prefix === 'ADH' ? 'procure_guard_adhoc_reference_seq' : 'procure_guard_advance_reference_seq';
  const rows = await sql<QueryResultRow[]>(`SELECT nextval('${seq}') AS n`);
  const n = Number(rows[0]?.n ?? 0);
  return `${prefix}-${String(n).padStart(6, '0')}`;
}

// Runs an INSERT that includes a generated reference_number, regenerating and
// retrying on the (astronomically rare) UNIQUE-index collision (pg code 23505)
// instead of surfacing it as an error.
export async function insertProcureGuardPaymentRequest(
  prefix: 'ADH' | 'ADV',
  run: (reference: string) => Promise<ExecResult>,
): Promise<ExecResult & { reference: string }> {
  // The reference_number UNIQUE index backs the retry-on-collision below, so ensure it before inserting.
  await ensureProcureGuardReferenceUniqueness();
  for (let attempt = 0; ; attempt++) {
    const reference = await makeReference(prefix);
    try {
      const result = await run(reference);
      return { ...result, reference };
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      const constraint = typeof err === 'object' && err && 'constraint' in err ? String(err.constraint) : '';
      if (code === '23505' && constraint.includes('reference') && attempt < 4) continue;
      throw err;
    }
  }
}
