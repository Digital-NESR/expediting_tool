/* ─── Every CREATE TABLE and ALTER TABLE this tool runs, in one place.

   These still execute lazily on the request path, which the audit flags as its own finding
   (laptop-procurement-4). Collecting them here does not fix that; it makes the eventual move to
   real migrations a matter of reading one file instead of six scattered memos. ─── */

import type { QueryResultRow } from 'pg';
import { exec, sql } from '@/lib/laptop-procurement/db';

// laptop_approver_matrix predates this app's incremental-migration pattern (its
// it_manager_2_* columns were added directly against the DB, not via code here) — this
// is the first ADD COLUMN for it, memoized the same way ensureLaptopDecisionColumns is.
export let laptopApproverMatrixColumnsEnsured: Promise<void> | null = null;

export async function ensureLaptopApproverMatrixColumns(): Promise<void> {
  if (laptopApproverMatrixColumnsEnsured) return laptopApproverMatrixColumnsEnsured;
  laptopApproverMatrixColumnsEnsured = (async () => {
    await exec(
      `ALTER TABLE laptop_approver_matrix ADD COLUMN IF NOT EXISTS it_manager_3_name TEXT`,
    );
    await exec(
      `ALTER TABLE laptop_approver_matrix ADD COLUMN IF NOT EXISTS it_manager_3_email TEXT`,
    );
  })().catch((err) => {
    laptopApproverMatrixColumnsEnsured = null;
    throw err;
  });
  return laptopApproverMatrixColumnsEnsured;
}

// laptop_permissions.role has a DB-level CHECK constraint enumerating every allowed
// value (a legacy list that already includes roles this app no longer uses, like
// 'Analyst'/'Read Only') — it doesn't auto-follow LaptopPermissionRole, so adding
// 'Viewer' there requires widening the constraint here too, or every save of a Viewer
// permission row fails at the DB with a check-violation.
export let laptopPermissionsRoleConstraintEnsured: Promise<void> | null = null;

export async function ensureLaptopPermissionsRoleConstraint(): Promise<void> {
  if (laptopPermissionsRoleConstraintEnsured) return laptopPermissionsRoleConstraintEnsured;
  laptopPermissionsRoleConstraintEnsured = (async () => {
    await exec(
      `ALTER TABLE laptop_permissions DROP CONSTRAINT IF EXISTS laptop_permissions_role_check`,
    );
    await exec(
      `ALTER TABLE laptop_permissions ADD CONSTRAINT laptop_permissions_role_check
       CHECK (role IN ('Requester', 'Analyst', 'Read Only', 'IT Manager', 'Country Manager', 'IT Director', 'Supply Chain Director', 'Admin', 'Viewer'))`,
    );
  })().catch((err) => {
    laptopPermissionsRoleConstraintEnsured = null;
    throw err;
  });
  return laptopPermissionsRoleConstraintEnsured;
}

export let laptopDelegationTableEnsured: Promise<void> | null = null;

export async function ensureLaptopDelegationTable(): Promise<void> {
  if (laptopDelegationTableEnsured) return laptopDelegationTableEnsured;
  laptopDelegationTableEnsured = (async () => {
    await exec(`CREATE TABLE IF NOT EXISTS laptop_delegations (
      id SERIAL PRIMARY KEY,
      delegator_email TEXT NOT NULL,
      delegator_name TEXT,
      delegate_email TEXT NOT NULL,
      delegate_name TEXT,
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await exec(`ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`);
    // Role-based delegation: which specific approver-matrix slot (stage + country) is
    // being handed over, rather than delegating everything the delegator happens to
    // hold. Nullable only because pre-existing rows predate this column.
    await exec(`ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS stage TEXT`);
    await exec(`ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS country TEXT`);
    await exec(
      `CREATE INDEX IF NOT EXISTS idx_laptop_delegations_delegate ON laptop_delegations (LOWER(delegate_email))`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS idx_laptop_delegations_delegator ON laptop_delegations (LOWER(delegator_email))`,
    );
  })().catch((err) => {
    laptopDelegationTableEnsured = null;
    throw err;
  });
  return laptopDelegationTableEnsured;
}

/**
 * Backstop unique index on reference_number, so even a writer that skips the advisory
 * lock (an older instance mid-deploy, a hand-run INSERT) cannot land a duplicate.
 *
 * Created only once the existing data is verified clean: references were reused once
 * historically (see LAPTOP_REFERENCE_FLOOR), so a leftover duplicate from that era is
 * reported for manual repair rather than allowed to fail here on every cold start.
 * Purely hardening — a failure never blocks a submission.
 */
export let laptopReferenceIndexEnsured: Promise<void> | null = null;

export async function ensureLaptopReferenceUniqueIndex(): Promise<void> {
  if (laptopReferenceIndexEnsured) return laptopReferenceIndexEnsured;
  laptopReferenceIndexEnsured = (async () => {
    const existing = await sql<QueryResultRow[]>(
      `SELECT 1 FROM pg_indexes
       WHERE tablename = 'laptop_requests' AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(reference_number)%'
       LIMIT 1`,
    );
    if (existing[0]) return;
    const duplicates = await sql<QueryResultRow[]>(
      `SELECT reference_number, COUNT(*) AS copies FROM laptop_requests
       WHERE reference_number IS NOT NULL
       GROUP BY reference_number HAVING COUNT(*) > 1
       ORDER BY reference_number`,
    );
    if (duplicates.length) {
      console.error(
        '[ensureLaptopReferenceUniqueIndex] reference_number is not unique — index skipped. Duplicates:',
        duplicates.map((d) => `${d.reference_number} x${d.copies}`).join(', '),
      );
      return;
    }
    await exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_laptop_requests_reference_number ON laptop_requests (reference_number)`,
    );
  })().catch((err) => {
    // Not retried: the advisory lock is what actually prevents collisions, this is
    // only the belt-and-braces. Never fail a request creation over it.
    console.warn('[ensureLaptopReferenceUniqueIndex]', err);
  });
  return laptopReferenceIndexEnsured;
}

export let laptopDecisionColumnsEnsured: Promise<void> | null = null;

export async function ensureLaptopDecisionColumns(): Promise<void> {
  if (laptopDecisionColumnsEnsured) return laptopDecisionColumnsEnsured;
  laptopDecisionColumnsEnsured = (async () => {
    await exec(`ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS itm_decision TEXT`);
    await exec(`ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS cm_decision TEXT`);
    await exec(`ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS itd_decision TEXT`);
    await exec(`ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS scd_decision TEXT`);
  })().catch((err) => {
    laptopDecisionColumnsEnsured = null;
    throw err;
  });
  return laptopDecisionColumnsEnsured;
}

export let laptopAccessRequestTableEnsured: Promise<void> | null = null;

export async function ensureLaptopAccessRequestTable(): Promise<void> {
  if (laptopAccessRequestTableEnsured) return laptopAccessRequestTableEnsured;
  laptopAccessRequestTableEnsured = (async () => {
    async function execSchema(statement: string) {
      try {
        await exec(statement);
      } catch (err) {
        const code =
          typeof err === 'object' && err && 'code' in err
            ? String((err as { code?: unknown }).code)
            : '';
        if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
      }
    }
    await execSchema(`
      CREATE TABLE IF NOT EXISTS laptop_access_requests (
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
    await execSchema(
      `CREATE INDEX IF NOT EXISTS idx_laptop_access_requests_status ON laptop_access_requests (status)`,
    );
  })().catch((err) => {
    laptopAccessRequestTableEnsured = null;
    throw err;
  });
  return laptopAccessRequestTableEnsured;
}
