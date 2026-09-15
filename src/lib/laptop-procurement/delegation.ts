/* ─── Resolving who is acting on whose behalf, following the chain with a hop limit so a cycle
   cannot hang a request. ─── */

import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopDelegationGrant, LaptopDelegationRow } from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import { buildEffectivePermissions, emptyMatrixCapabilities } from '@/lib/laptop-procurement/actor';
import { sql } from '@/lib/laptop-procurement/db';
import { ensureLaptopDelegationTable } from '@/lib/laptop-procurement/schema';

// A delegation whose expires_at has simply passed still carries is_active = TRUE until
// someone explicitly revokes it — resolveLaptopDelegations already filters on expires_at
// directly so access is never affected, but the admin/delegate lists sort and label off
// this flag, so a merely-expired row would read as if it outranked ones genuinely
// revoked more recently.
//
// This used to be fixed by an UPDATE (expireStaleLaptopDelegations) fired on every admin
// panel and delegate page load — a write on a read path, on every page view, for a
// cosmetic ordering concern. It is derived at read time instead: same flag, same
// revoked_at, same ordering as the UPDATE-then-ORDER-BY produced, no write. The stored
// flag is still flipped for real by revokeLaptopDelegation.
export function applyLaptopDelegationExpiry(rows: LaptopDelegationRow[]): LaptopDelegationRow[] {
  const now = Date.now();
  return (
    rows
      .map((row) => {
        if (!row.is_active || !row.expires_at) return row;
        const expiresAt = new Date(row.expires_at).getTime();
        if (Number.isNaN(expiresAt) || expiresAt > now) return row;
        return { ...row, is_active: false, revoked_at: row.revoked_at ?? row.expires_at };
      })
      // Mirrors `ORDER BY is_active DESC, COALESCE(revoked_at, created_at) DESC`, but over
      // the derived flag rather than the stored one.
      .sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return (
          new Date(b.revoked_at ?? b.created_at).getTime() -
          new Date(a.revoked_at ?? a.created_at).getTime()
        );
      })
  );
}

/**
 * Every active delegation for ONE country, loaded in a single query and walked in
 * memory.
 *
 * This used to be resolveActiveLaptopDelegateEmail(email, stage, country): one query per
 * approver, recursing a further query per hop up to depth 5. A request detail page
 * resolves six matrix slots and every notification repeats the walk for each recipient,
 * so a single page render could issue dozens of round trips to a remote Postgres for
 * what is a handful of rows. The resolved answer is identical — same role-scoped
 * matching (a delegation of a *different* stage held by the same person is ignored),
 * same follow-the-chain-onward behaviour, same six-hop ceiling, same "return null and
 * keep the original approver" when nothing matches.
 */
export type LaptopDelegationChain = {
  /** Who should be notified in place of `email` for this stage, or null to keep `email`. */
  resolve(
    email: string | null | undefined,
    stage: LaptopApprovalStage,
  ): { name: string | null; email: string } | null;
};

export const NO_LAPTOP_DELEGATIONS: LaptopDelegationChain = { resolve: () => null };

// Matches the old per-hop query's depth guard: lookups ran at depth 0..5, i.e. at most
// six hops along a delegation chain before it gave up.
export const LAPTOP_DELEGATION_MAX_HOPS = 6;

export async function loadLaptopDelegationChain(
  country: string | null | undefined,
): Promise<LaptopDelegationChain> {
  if (!country) return NO_LAPTOP_DELEGATIONS;
  try {
    const rows = await sql<QueryResultRow[]>(
      `SELECT delegator_email, stage, delegate_email, delegate_name FROM laptop_delegations
       WHERE LOWER(country) = ? AND is_active = TRUE
         AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [country.toLowerCase()],
    );
    // "stage|lowercased delegator" -> delegate. First row wins, mirroring the LIMIT 1
    // (no ORDER BY) of the query this replaces.
    const byStageAndDelegator = new Map<string, { name: string | null; email: string }>();
    for (const row of rows) {
      const stage = String(row.stage ?? '');
      const delegator = String(row.delegator_email ?? '')
        .trim()
        .toLowerCase();
      const delegate = String(row.delegate_email ?? '').trim();
      if (!stage || !delegator || !delegate) continue;
      const key = `${stage}|${delegator}`;
      if (byStageAndDelegator.has(key)) continue;
      byStageAndDelegator.set(key, {
        name: (row.delegate_name as string | null) ?? null,
        email: delegate,
      });
    }
    if (byStageAndDelegator.size === 0) return NO_LAPTOP_DELEGATIONS;

    return {
      resolve(email, stage) {
        if (!email) return null;
        let current = email.trim().toLowerCase();
        let found: { name: string | null; email: string } | null = null;
        // Bounded rather than cycle-detected on purpose: a delegation loop resolved to
        // whoever the old recursion reached last before its depth guard tripped, and it
        // still does.
        for (let hop = 0; hop < LAPTOP_DELEGATION_MAX_HOPS; hop++) {
          const next = byStageAndDelegator.get(`${stage}|${current}`);
          if (!next) break;
          found = next;
          current = next.email.trim().toLowerCase();
        }
        return found;
      },
    };
  } catch (err) {
    console.error('[loadLaptopDelegationChain]', err);
    return NO_LAPTOP_DELEGATIONS;
  }
}

/**
 * Resolve active delegations TO `email` for Laptop Procurement — role-based: each row
 * hands over exactly the one (stage, country) slot it names, never the delegator's
 * other roles or their own laptop_permissions standing (deliberately built with
 * baseRole 'Requester' regardless of what the delegator actually is — an Admin
 * delegating a single country's IT Manager slot must not hand over admin rights along
 * with it). Rows predating role-based delegation (stage/country NULL) are skipped, since
 * there's no active data like that today. Fail-safe: returns [] if the delegations
 * table is unavailable.
 */
export async function resolveLaptopDelegations(email: string): Promise<LaptopDelegationGrant[]> {
  try {
    await ensureLaptopDelegationTable();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_delegations
       WHERE LOWER(delegate_email) = ? AND is_active = TRUE
         AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [email.toLowerCase()],
    );
    if (!rows.length) return [];

    const grants: LaptopDelegationGrant[] = [];
    for (const row of rows) {
      const stage = row.stage as LaptopApprovalStage | null;
      const country = row.country as string | null;
      if (!stage || !country) continue;
      const delegatorEmail = String(row.delegator_email);
      const matrixCapabilities = { ...emptyMatrixCapabilities(), [stage]: [country] };
      const grantPermissions = buildEffectivePermissions('Requester', matrixCapabilities);
      if (!grantPermissions.canViewAll) continue; // defensive — should always be true given the slot above
      grants.push({
        email: delegatorEmail,
        name: (row.delegator_name as string | null) ?? delegatorEmail,
        role: grantPermissions.role,
        matrixCapabilities,
        permissions: grantPermissions,
      });
    }
    return grants;
  } catch (err) {
    console.error('[resolveLaptopDelegations]', err);
    return [];
  }
}

export const DELEGATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
