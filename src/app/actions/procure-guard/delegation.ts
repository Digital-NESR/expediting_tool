'use server';

/**
 * Approver delegation actions: a delegator handing over their own authority, and the admin-managed
 * variant that sets one up on any approver's behalf. Every export is a public POST endpoint.
 */
import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { logger } from '@/lib/logger';
import { normalizeEmail } from '@/lib/require-access';
import { getPermissionProfile, normalizeProcureGuardCountryScope } from '@/lib/procureGuard-utils';
import { actorReviewGrants } from '@/lib/procure-guard/access';
import { getActor, requireAdminActor } from '@/lib/procure-guard/actor';
import { getPermissionRowForEmail } from '@/lib/procure-guard/actor-scope';
import { ADMIN_DELEGATION_REFUSAL, isValidEmail } from '@/lib/procure-guard/constants';
import {
  getDelegatorOpenItems,
  sendProcureGuardDelegationEmail,
} from '@/lib/procure-guard/delegation-email';
import { ensureProcureGuardSchema, exec, serialise, sql } from '@/lib/procure-guard/internals';
import {
  blankToNull,
  isProcureGuardAdminEmail,
  requireText,
  validateDelegationExpiry,
} from '@/lib/procure-guard/validation';
import type {
  ActionResult,
  ProcureGuardDelegation,
  ProcureGuardDelegationData,
  ProcureGuardPermissionRole,
} from '@/types/procureGuard';

const log = logger('procure-guard');

export async function getProcureGuardDelegationData(): Promise<ProcureGuardDelegationData | null> {
  try {
    const actor = await getActor();
    await ensureProcureGuardSchema();
    const grantedRows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_delegations WHERE LOWER(delegator_email) = LOWER(?) ORDER BY is_active DESC, created_at DESC`,
      [actor.email],
    );
    const receivedRows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_delegations WHERE LOWER(delegate_email) = LOWER(?) AND is_active = TRUE AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) ORDER BY created_at DESC`,
      [actor.email],
    );
    return {
      actor,
      granted: serialise<ProcureGuardDelegation[]>(grantedRows),
      received: serialise<ProcureGuardDelegation[]>(receivedRows),
    };
  } catch (err) {
    log.error('getProcureGuardDelegationData.failed', err);
    return null;
  }
}

export async function grantProcureGuardDelegation(input: {
  delegateEmail: string;
  delegateName?: string;
  expiresAt?: string | null;
}): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    await ensureProcureGuardSchema();
    const selfGrant = actorReviewGrants(actor).find((grant) => grant.source === 'self');
    if (!selfGrant) {
      return { success: false, error: 'Only approvers can delegate their approval authority.' };
    }
    if (selfGrant.isAdmin) {
      return { success: false, error: ADMIN_DELEGATION_REFUSAL };
    }
    const delegateEmail = requireText(input.delegateEmail, 'Delegate email').toLowerCase();
    if (!isValidEmail(delegateEmail)) {
      return { success: false, error: 'Enter a valid delegate email address.' };
    }
    if (delegateEmail === normalizeEmail(actor.email)) {
      return { success: false, error: 'You cannot delegate to yourself.' };
    }
    const expiresAt = validateDelegationExpiry(input.expiresAt);

    // Replace any existing active delegation to the same person so there is only one live grant.
    await exec(
      `UPDATE procure_guard_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(delegator_email) = LOWER(?) AND LOWER(delegate_email) = LOWER(?) AND is_active = TRUE`,
      [actor.email, delegateEmail],
    );
    const result = await exec(
      `INSERT INTO procure_guard_delegations (delegator_email, delegator_name, delegate_email, delegate_name, expires_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [
        actor.email.toLowerCase(),
        actor.name,
        delegateEmail,
        blankToNull(input.delegateName),
        expiresAt,
      ],
    );

    const openItems = await getDelegatorOpenItems(selfGrant);
    await sendProcureGuardDelegationEmail('granted', {
      delegateEmail,
      delegateName: input.delegateName?.trim() || null,
      delegatorName: actor.name,
      expiresAt,
      openItems,
    });

    revalidatePath('/procure-guard/delegate');
    return { success: true, data: { id: result.insertId } };
  } catch (err) {
    log.error('grantProcureGuardDelegation.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create delegation.',
    };
  }
}

export async function revokeProcureGuardDelegation(id: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureProcureGuardSchema();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_delegations WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { success: false, error: 'Delegation not found.' };
    const isOwner = String(row.delegator_email).toLowerCase() === actor.email.toLowerCase();
    if (!isOwner && !actor.permissions.canManagePermissions) {
      return { success: false, error: 'You can only revoke delegations you created.' };
    }
    if (row.is_active) {
      await exec(
        `UPDATE procure_guard_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id],
      );
      await sendProcureGuardDelegationEmail('revoked', {
        delegateEmail: String(row.delegate_email),
        delegateName: (row.delegate_name as string) ?? null,
        delegatorName: (row.delegator_name as string) || actor.name,
        expiresAt: null,
        openItems: [],
      });
    }
    revalidatePath('/procure-guard/delegate');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('revokeProcureGuardDelegation.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to revoke delegation.',
    };
  }
}

// Admin-managed delegation: an admin sets up a delegation on behalf of any approver (delegator → delegate),
// rather than the delegator delegating their own authority via /procure-guard/delegate.
export async function adminGrantProcureGuardDelegation(input: {
  delegatorEmail: string;
  delegateEmail: string;
  delegateName?: string;
  expiresAt?: string | null;
}): Promise<ActionResult<{ id: number }>> {
  try {
    await requireAdminActor();
    await ensureProcureGuardSchema();

    const delegatorEmail = requireText(input.delegatorEmail, 'Approver email').toLowerCase();
    const delegateEmail = requireText(input.delegateEmail, 'Delegate email').toLowerCase();
    if (!isValidEmail(delegatorEmail))
      return { success: false, error: 'Enter a valid approver email address.' };
    if (!isValidEmail(delegateEmail))
      return { success: false, error: 'Enter a valid delegate email address.' };
    if (delegatorEmail === delegateEmail)
      return { success: false, error: 'Approver and delegate must be different people.' };

    // The delegator must have approval authority to hand off.
    const delegatorRow = await getPermissionRowForEmail(delegatorEmail);
    const delegatorRole = (delegatorRow?.role ??
      (isProcureGuardAdminEmail(delegatorEmail)
        ? 'Admin'
        : 'Requester')) as ProcureGuardPermissionRole;
    const delegatorProfile = getPermissionProfile(delegatorRole);
    if (!delegatorProfile.canViewAll) {
      return {
        success: false,
        error: 'The selected approver has no approval authority to delegate.',
      };
    }
    if (delegatorRole === 'Admin') {
      return { success: false, error: ADMIN_DELEGATION_REFUSAL };
    }
    const delegatorName = delegatorRow?.name || delegatorEmail;
    const expiresAt = validateDelegationExpiry(input.expiresAt);

    // Replace any existing active delegation for this same pair so there is only one live grant.
    await exec(
      `UPDATE procure_guard_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(delegator_email) = LOWER(?) AND LOWER(delegate_email) = LOWER(?) AND is_active = TRUE`,
      [delegatorEmail, delegateEmail],
    );
    const result = await exec(
      `INSERT INTO procure_guard_delegations (delegator_email, delegator_name, delegate_email, delegate_name, expires_at)
       VALUES (?, ?, ?, ?, ?) RETURNING id`,
      [delegatorEmail, delegatorName, delegateEmail, blankToNull(input.delegateName), expiresAt],
    );

    const openItems = await getDelegatorOpenItems({
      source: 'self',
      fromEmail: delegatorEmail,
      fromName: delegatorName,
      role: delegatorRole,
      country: normalizeProcureGuardCountryScope(delegatorRow?.country),
      segment: delegatorRow?.segment ?? null,
      // Admin delegators are refused above, so the delegator is never an admin here.
      isAdmin: false,
    });
    await sendProcureGuardDelegationEmail('granted', {
      delegateEmail,
      delegateName: input.delegateName?.trim() || null,
      delegatorName,
      expiresAt,
      openItems,
    });

    revalidatePath('/admin');
    revalidatePath('/procure-guard/delegate');
    return { success: true, data: { id: result.insertId } };
  } catch (err) {
    log.error('adminGrantProcureGuardDelegation.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create delegation.',
    };
  }
}
