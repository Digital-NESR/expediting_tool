'use server';

/* ─── The access-request queue. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { withTransaction } from '@/lib/db/tx';
import { logger } from '@/lib/logger';
import type {
  ActionResult,
  LaptopAccessRequestRow,
  LaptopAccessRequestStatus,
  LaptopPermissionRole,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import { requireAdminActor } from '@/lib/laptop-procurement/access';
import { serialiseLaptopAccessRequest } from '@/lib/laptop-procurement/access-requests';
import { isLaptopConsoleAdminEmail } from '@/lib/laptop-procurement/actor';
import { execTx, sql } from '@/lib/laptop-procurement/db';
import {
  blankToNull,
  requireText,
  revalidateLaptopAdminPath,
} from '@/lib/laptop-procurement/internals';
import {
  ensureLaptopAccessRequestTable,
  ensureLaptopPermissionsRoleConstraint,
} from '@/lib/laptop-procurement/schema';

const log = logger('laptop-procurement');

export async function getLaptopAccessRequests(): Promise<LaptopAccessRequestRow[]> {
  try {
    await requireAdminActor();
    await ensureLaptopAccessRequestTable();
    const [requestRows, permissionRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_access_requests
         ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, requested_at DESC`,
      ),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_permissions ORDER BY updated_at DESC, email`),
    ]);

    const byEmail = new Map<string, LaptopAccessRequestRow>();
    for (const row of requestRows) {
      byEmail.set(String(row.user_email).toLowerCase(), serialiseLaptopAccessRequest(row));
    }
    for (const row of permissionRows) {
      const email = String(row.email).toLowerCase();
      if (byEmail.has(email)) continue;
      const role = row.role as LaptopPermissionRole;
      byEmail.set(email, {
        user_email: email,
        display_name: row.name ? String(row.name) : null,
        job_title: null,
        department: null,
        status: 'Approved',
        requested_role: role,
        approved_role: role,
        country: row.country ? String(row.country) : null,
        segment: row.segment ? String(row.segment) : null,
        requested_at:
          row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        reviewed_at:
          row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        reviewed_by: 'Laptop Procurement permissions',
        notes: null,
      });
    }

    return [...byEmail.values()].sort((a, b) => {
      const rank = (status: LaptopAccessRequestStatus) =>
        status === 'Pending' ? 0 : status === 'Approved' ? 1 : 2;
      return (
        rank(a.status) - rank(b.status) || Date.parse(b.requested_at) - Date.parse(a.requested_at)
      );
    });
  } catch (err) {
    log.error('getLaptopAccessRequests.failed', err);
    return [];
  }
}

export async function getLaptopPendingAccessCount(): Promise<number> {
  try {
    await requireAdminActor();
    await ensureLaptopAccessRequestTable();
    const rows = await sql<QueryResultRow[]>(
      `SELECT COUNT(*) AS cnt FROM laptop_access_requests WHERE status = 'Pending'`,
    );
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    log.error('getLaptopPendingAccessCount.failed', err);
    return 0;
  }
}

// reviewed_by is an audit field: it records who made the decision, so it comes from
// the authenticated actor, never from the caller's payload.
export async function approveLaptopAccess(input: {
  userEmail: string;
  approvedRole: LaptopPermissionRole;
  country?: string | null;
  segment?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(input.userEmail, 'Email').toLowerCase();
    const role = requireText(input.approvedRole, 'Role') as LaptopPermissionRole;

    // DDL, so it stays outside the transaction below.
    await ensureLaptopPermissionsRoleConstraint();

    // The access record and the permission row that actually grants access have to
    // land together — a failure between them either logs an approval that grants
    // nothing, or grants access with no record of who approved it.
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(
        client,
        `INSERT INTO laptop_access_requests
           (user_email, display_name, status, requested_role, approved_role, country, segment, requested_at, reviewed_at, reviewed_by, notes)
         VALUES (?, ?, 'Approved', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
         ON CONFLICT (user_email) DO UPDATE SET
           status = 'Approved',
           approved_role = EXCLUDED.approved_role,
           country = EXCLUDED.country,
           segment = EXCLUDED.segment,
           reviewed_at = CURRENT_TIMESTAMP,
           reviewed_by = EXCLUDED.reviewed_by,
           notes = EXCLUDED.notes`,
        [
          email,
          email,
          role,
          role,
          blankToNull(input.country),
          blankToNull(input.segment),
          actor.email,
          blankToNull(input.notes),
        ],
      );

      await execTx(
        client,
        `INSERT INTO laptop_permissions (email, name, role, country, segment)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (email) DO UPDATE SET
           role = EXCLUDED.role, country = EXCLUDED.country, segment = EXCLUDED.segment, updated_at = CURRENT_TIMESTAMP`,
        [email, null, role, blankToNull(input.country), blankToNull(input.segment)],
      );
    });

    revalidateLaptopAdminPath();
    return { success: true };
  } catch (err) {
    log.error('approveLaptopAccess.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to approve Laptop Procurement access.',
    };
  }
}

export async function editLaptopAccess(input: {
  userEmail: string;
  approvedRole: LaptopPermissionRole;
  country?: string | null;
  segment?: string | null;
}): Promise<ActionResult> {
  return approveLaptopAccess({ ...input, notes: 'Access edited by admin' });
}

export async function rejectLaptopAccess(userEmail: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(
        client,
        `UPDATE laptop_access_requests
         SET status = 'Rejected', approved_role = NULL, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
         WHERE user_email = ?`,
        [actor.email, email],
      );
      if (!isLaptopConsoleAdminEmail(email)) {
        await execTx(client, `DELETE FROM laptop_permissions WHERE email = ?`, [email]);
      }
    });
    revalidateLaptopAdminPath();
    return { success: true };
  } catch (err) {
    log.error('rejectLaptopAccess.failed', err);
    return { success: false, error: 'Failed to reject Laptop Procurement access.' };
  }
}

export async function revokeLaptopAccess(userEmail: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(
        client,
        `INSERT INTO laptop_access_requests
           (user_email, display_name, status, requested_role, requested_at, reviewed_at, reviewed_by)
         VALUES (?, ?, 'Revoked', 'Requester', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
         ON CONFLICT (user_email) DO UPDATE SET
           status = 'Revoked', approved_role = NULL, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = EXCLUDED.reviewed_by`,
        [email, email, actor.email],
      );
      if (!isLaptopConsoleAdminEmail(email)) {
        await execTx(client, `DELETE FROM laptop_permissions WHERE email = ?`, [email]);
      }
    });
    revalidateLaptopAdminPath();
    return { success: true };
  } catch (err) {
    log.error('revokeLaptopAccess.failed', err);
    return { success: false, error: 'Failed to revoke Laptop Procurement access.' };
  }
}

export async function deleteLaptopAccessRequest(userEmail: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions)
      return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(client, `DELETE FROM laptop_access_requests WHERE user_email = ?`, [email]);
      if (!isLaptopConsoleAdminEmail(email)) {
        await execTx(client, `DELETE FROM laptop_permissions WHERE email = ?`, [email]);
      }
    });
    revalidateLaptopAdminPath();
    return { success: true };
  } catch (err) {
    log.error('deleteLaptopAccessRequest.failed', err);
    return { success: false, error: 'Failed to delete Laptop Procurement access record.' };
  }
}

/* ── Delegation (own table in laptop_procurement_db) ──────────────────────── */
