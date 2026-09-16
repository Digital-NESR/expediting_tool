/**
 * ProcureGuard's schema assertion and reference-number allocation.
 *
 * This file used to hold the tool's DDL, run behind hand-rolled memos on the first request every
 * serverless instance served. That SQL now lives in
 * database/migrations/procureguard/001_baseline.sql and is applied once at deploy by
 * `npm run migrate`; what is left here is the check that it was.
 */
import type { QueryResultRow } from 'pg';
import { ensureProcureGuardSchema, sql } from './internals';
import type { ExecResult } from './internals';

/* The schema assertion lives in ./internals, which owns the pool; it is re-exported here
   because callers that need it also import from this module. */
export { ensureProcureGuardSchema };

// Sequential, human-friendly reference numbers: ADH-000001, ADV-000001, ... drawn atomically
// from a per-type Postgres sequence (nextval is concurrency-safe, so no two requests collide).
// The UNIQUE index on reference_number remains the hard backstop.
//
// The sequences and that UNIQUE index used to be created here, once per process, by
// ensureProcureGuardReferenceUniqueness(). They are now part of the 001_baseline migration —
// including the "warn instead of fail when legacy duplicates block the index" behaviour, which
// the migration keeps as a RAISE NOTICE.
async function makeReference(prefix: 'ADH' | 'ADV'): Promise<string> {
  await ensureProcureGuardSchema();
  const seq =
    prefix === 'ADH' ? 'procure_guard_adhoc_reference_seq' : 'procure_guard_advance_reference_seq';
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
  // The reference_number UNIQUE index backs the retry-on-collision below, so confirm the migration
  // that creates it has been applied before inserting.
  await ensureProcureGuardSchema();
  for (let attempt = 0; ; attempt++) {
    const reference = await makeReference(prefix);
    try {
      const result = await run(reference);
      return { ...result, reference };
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      const constraint =
        typeof err === 'object' && err && 'constraint' in err ? String(err.constraint) : '';
      if (code === '23505' && constraint.includes('reference') && attempt < 4) continue;
      throw err;
    }
  }
}
