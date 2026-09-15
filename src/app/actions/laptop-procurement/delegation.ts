'use server';

/* ─── Granting and revoking delegation. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { asSerialised } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import type {
  ActionResult,
  LaptopDelegationData,
  LaptopDelegationRow,
} from '@/types/laptopProcurement';
import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { normaliseScopeValue, requireAdminActor } from '@/lib/laptop-procurement/access';
import {
  getActor,
  getApproverMatrixCapabilities,
  getPermissionRowForEmail,
} from '@/lib/laptop-procurement/actor';
import { exec, execTx, sql } from '@/lib/laptop-procurement/db';
import {
  DELEGATION_EMAIL_RE,
  applyLaptopDelegationExpiry,
} from '@/lib/laptop-procurement/delegation';
import { blankToNull, requireText } from '@/lib/laptop-procurement/internals';
import {
  deferLaptopNotifications,
  sendLaptopDelegationNotification,
} from '@/lib/laptop-procurement/notifications';
import { ensureLaptopDelegationTable } from '@/lib/laptop-procurement/schema';

const log = logger('laptop-procurement');

export async function getLaptopDelegationData(): Promise<LaptopDelegationData | null> {
  try {
    const actor = await getActor();
    await ensureLaptopDelegationTable();
    const [grantedRows, receivedRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_delegations WHERE LOWER(delegator_email) = ? ORDER BY is_active DESC, COALESCE(revoked_at, created_at) DESC`,
        [actor.email.toLowerCase()],
      ),
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_delegations
         WHERE LOWER(delegate_email) = ? AND is_active = TRUE
           AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         ORDER BY created_at DESC`,
        [actor.email.toLowerCase()],
      ),
    ]);
    return {
      actor,
      granted: applyLaptopDelegationExpiry(asSerialised<LaptopDelegationRow[]>(grantedRows)),
      // Already filtered to unexpired rows by the query itself, so expiry never changes
      // anything here — passed through the same helper only so both lists are built the
      // same way.
      received: applyLaptopDelegationExpiry(asSerialised<LaptopDelegationRow[]>(receivedRows)),
    };
  } catch (err) {
    log.error('getLaptopDelegationData.failed', err);
    return null;
  }
}

export async function grantLaptopDelegation(input: {
  delegateEmail: string;
  delegateName?: string;
  // Role-based: exactly the (stage, country) slots being handed over — never the
  // actor's other roles, and validated against what they actually hold below.
  roles: Array<{ stage: LaptopApprovalStage; country: string }>;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<ActionResult<{ count: number }>> {
  try {
    const actor = await getActor();
    if (!actor.permissions.canViewAll) {
      return { success: false, error: 'Only approvers can delegate their approval authority.' };
    }
    await ensureLaptopDelegationTable();
    const delegateEmail = requireText(input.delegateEmail, 'Delegate email').toLowerCase();
    if (!DELEGATION_EMAIL_RE.test(delegateEmail))
      return { success: false, error: 'Enter a valid delegate email address.' };
    if (delegateEmail === actor.email.toLowerCase())
      return { success: false, error: 'You cannot delegate to yourself.' };
    if (!input.roles?.length)
      return { success: false, error: 'Select at least one role to delegate.' };
    for (const r of input.roles) {
      if (
        !actor.matrixCapabilities[r.stage]?.some(
          (c) => normaliseScopeValue(c) === normaliseScopeValue(r.country),
        )
      ) {
        return { success: false, error: `You don't hold ${r.stage} for ${r.country}.` };
      }
    }
    const startsAt = input.startsAt && input.startsAt.trim() ? input.startsAt.trim() : null;
    const expiresAt = input.endsAt && input.endsAt.trim() ? input.endsAt.trim() : null;
    if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
      return { success: false, error: 'End date must be after the start date.' };
    }

    // Deactivate-then-insert, per role: without the transaction a failure between the
    // two leaves the old delegation revoked and no replacement in its place, so the
    // stage silently loses its delegate.
    await withTransaction(laptopProcurementPool, async (client) => {
      for (const r of input.roles) {
        // Replace any existing active delegation of this exact role to the same person.
        await execTx(
          client,
          `UPDATE laptop_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE LOWER(delegator_email) = ? AND LOWER(delegate_email) = ? AND stage = ? AND LOWER(country) = ? AND is_active = TRUE`,
          [actor.email.toLowerCase(), delegateEmail, r.stage, r.country.toLowerCase()],
        );
        await execTx(
          client,
          `INSERT INTO laptop_delegations (delegator_email, delegator_name, delegate_email, delegate_name, stage, country, starts_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            actor.email.toLowerCase(),
            actor.name,
            delegateEmail,
            blankToNull(input.delegateName),
            r.stage,
            r.country,
            startsAt,
            expiresAt,
          ],
        );
      }
    });
    revalidatePath('/laptop-procurement/delegate');
    deferLaptopNotifications('delegation-granted', () =>
      sendLaptopDelegationNotification('granted', {
        delegatorEmail: actor.email,
        delegatorName: actor.name,
        delegateEmail,
        delegateName: input.delegateName?.trim() || null,
        roles: input.roles,
        expiresAt,
      }),
    );
    return { success: true, data: { count: input.roles.length } };
  } catch (err) {
    log.error('grantLaptopDelegation.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create delegation.',
    };
  }
}

export async function revokeLaptopDelegation(id: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureLaptopDelegationTable();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_delegations WHERE id = ? LIMIT 1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { success: false, error: 'Delegation not found.' };
    const isOwner = String(row.delegator_email).toLowerCase() === actor.email.toLowerCase();
    // This action is shared by the self-service Delegate page (isOwner) and the /admin
    // console's "All delegations" list, which shows every delegation with a Revoke button
    // regardless of who's viewing it. Revoking someone else's delegation is a write, so it
    // needs real canManagePermissions — the ADMIN_EMAILS console bypass that used to stand
    // in for it here is the same one requireAdminActor() no longer grants writes through.
    if (!isOwner && !actor.permissions.canManagePermissions) {
      return { success: false, error: 'You can only revoke delegations you created.' };
    }
    if (row.is_active) {
      await exec(
        `UPDATE laptop_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id],
      );
      deferLaptopNotifications('delegation-revoked', () =>
        sendLaptopDelegationNotification('revoked', {
          delegatorEmail: String(row.delegator_email),
          delegatorName: (row.delegator_name as string) || actor.name,
          delegateEmail: String(row.delegate_email),
          delegateName: (row.delegate_name as string | null) ?? null,
          roles:
            row.stage && row.country
              ? [{ stage: String(row.stage), country: String(row.country) }]
              : [],
          expiresAt: null,
        }),
      );
    }
    revalidatePath('/laptop-procurement/delegate');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    log.error('revokeLaptopDelegation.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to revoke delegation.',
    };
  }
}

// Admin-managed delegation: an admin sets up a delegation on behalf of any approver
// (delegator → delegate), rather than the delegator delegating their own authority
// via /laptop-procurement/delegate. Role-based: each entry in `roles` must be a slot
// the delegator actually holds in the approver matrix — validated directly against
// it, rather than checking whether they carry approval authority in general.
export async function adminGrantLaptopDelegation(input: {
  delegatorEmail: string;
  delegateEmail: string;
  delegateName?: string;
  roles: Array<{ stage: LaptopApprovalStage; country: string }>;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<ActionResult<{ count: number }>> {
  try {
    const actor = await requireAdminActor();
    // This one never carried a capability check of its own — it leaned entirely on
    // requireAdminActor's old blanket elevation, which no longer grants writes.
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopDelegationTable();
    const delegatorEmail = requireText(input.delegatorEmail, 'Approver email').toLowerCase();
    const delegateEmail = requireText(input.delegateEmail, 'Delegate email').toLowerCase();
    if (!DELEGATION_EMAIL_RE.test(delegatorEmail))
      return { success: false, error: 'Enter a valid approver email address.' };
    if (!DELEGATION_EMAIL_RE.test(delegateEmail))
      return { success: false, error: 'Enter a valid delegate email address.' };
    if (delegatorEmail === delegateEmail)
      return { success: false, error: 'Approver and delegate must be different people.' };
    if (!input.roles?.length)
      return { success: false, error: 'Select at least one role to delegate.' };

    const delegatorRow = await getPermissionRowForEmail(delegatorEmail);
    const delegatorName = delegatorRow?.name || delegatorEmail;
    const delegatorMatrixCapabilities = await getApproverMatrixCapabilities(delegatorEmail);
    for (const r of input.roles) {
      if (
        !delegatorMatrixCapabilities[r.stage]?.some(
          (c) => normaliseScopeValue(c) === normaliseScopeValue(r.country),
        )
      ) {
        return {
          success: false,
          error: `${delegatorName} doesn't hold ${r.stage} for ${r.country}.`,
        };
      }
    }
    const startsAt = input.startsAt && input.startsAt.trim() ? input.startsAt.trim() : null;
    const expiresAt = input.endsAt && input.endsAt.trim() ? input.endsAt.trim() : null;
    if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
      return { success: false, error: 'End date must be after the start date.' };
    }

    await withTransaction(laptopProcurementPool, async (client) => {
      for (const r of input.roles) {
        // Replace any existing active delegation of this exact role for this same pair.
        await execTx(
          client,
          `UPDATE laptop_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
           WHERE LOWER(delegator_email) = ? AND LOWER(delegate_email) = ? AND stage = ? AND LOWER(country) = ? AND is_active = TRUE`,
          [delegatorEmail, delegateEmail, r.stage, r.country.toLowerCase()],
        );
        await execTx(
          client,
          `INSERT INTO laptop_delegations (delegator_email, delegator_name, delegate_email, delegate_name, stage, country, starts_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            delegatorEmail,
            delegatorName,
            delegateEmail,
            blankToNull(input.delegateName),
            r.stage,
            r.country,
            startsAt,
            expiresAt,
          ],
        );
      }
    });
    revalidatePath('/admin');
    revalidatePath('/laptop-procurement/delegate');
    deferLaptopNotifications('delegation-granted', () =>
      sendLaptopDelegationNotification('granted', {
        delegatorEmail,
        delegatorName,
        delegateEmail,
        delegateName: input.delegateName?.trim() || null,
        roles: input.roles,
        expiresAt,
      }),
    );
    return { success: true, data: { count: input.roles.length } };
  } catch (err) {
    log.error('adminGrantLaptopDelegation.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create delegation.',
    };
  }
}
