'use server';

/**
 * ProcureGuard admin actions: the admin panel read, admin-created requests, record deletion, the
 * notification-recipient and approver-matrix editors, permissions and the n8n connectivity test.
 *
 * Every export is a public POST endpoint, so each one resolves an admin / permission-manager actor
 * as its FIRST statement. The recipient->access sync itself lives in lib/procure-guard/recipient-sync
 * precisely so it is NOT one of these endpoints.
 */
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import {
  canUseProcureGuardAdmin,
  getProcureGuardAccessView,
  getProcureGuardCountryScopeCountries,
  PERMISSION_ROLE_OPTIONS,
} from '@/lib/procureGuard-utils';
import { revalidateProcureGuardPaths, writeActivity } from '@/lib/procure-guard/activity';
import { getActor, requireAdminActor, requirePermissionManager } from '@/lib/procure-guard/actor';
import { APPROVER_MATRIX_COLUMNS, upsertProcureGuardRecipientRow } from '@/lib/procure-guard/approver-matrix';
import type { ApproverCell, ProcureGuardApproverMatrix, ProcureGuardViewerGrant } from '@/lib/procure-guard/approver-matrix';
import { isValidEmail, MEANINGFUL_ACTIVITY_WHERE } from '@/lib/procure-guard/constants';
import {
  ensureProcureGuardDelegationTable,
  ensureProcureGuardPaymentRequestColumns,
  exec,
  postProcureGuardWebhook,
  procureGuardWebhookErrorMessage,
  serialise,
  sql,
  stripEnvQuotes,
} from '@/lib/procure-guard/internals';
import { buildStats } from '@/lib/procure-guard/analytics';
import { notifyProcureGuardNextApprover } from '@/lib/procure-guard/notifications';
import { syncProcureGuardRecipientAccessApprovals } from '@/lib/procure-guard/recipient-sync';
import { ensureProcureGuardAccessRequestTable, ensureProcureGuardPermissionRoleValues } from '@/lib/procure-guard/schema';
import {
  blankToNull,
  isProcureGuardAdminEmail,
  normalisePaymentCountries,
  normalisePermissionCountryForRole,
  requireText,
} from '@/lib/procure-guard/validation';
import {
  insertAdhocRequest,
  insertAdvanceRequest,
  normaliseAdhocInput,
  normaliseAdvanceInput,
} from '@/lib/procure-guard/write-requests';
import type {
  ActionResult,
  AdhocPaymentRequest,
  AdminCreateAdhocPaymentInput,
  AdminCreateAdvancePaymentInput,
  AdvancePaymentRequest,
  ProcureGuardActivityRow,
  ProcureGuardAdminData,
  ProcureGuardDelegation,
  ProcureGuardNotificationContact,
  ProcureGuardPermissionRow,
  ProcureGuardRequestType,
  UpdateProcureGuardPermissionInput,
} from '@/types/procureGuard';

const log = logger('procure-guard');

export async function getProcureGuardAdminData(): Promise<ProcureGuardAdminData | null> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardPaymentRequestColumns();
    await ensureProcureGuardDelegationTable();
    // No recipient sync here: this is a READ path. Rendering the admin panel used to rewrite every
    // approver permission row (and prune the ones the manual editor had granted). The sync now runs
    // from the recipient mutators and from resyncProcureGuardRecipientAccess() only.
    const [adhocRows, advanceRows, activityRows, permissionRows, notificationRecipientRows, delegationRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments ORDER BY created_at DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments ORDER BY created_at DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 100`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_permissions ORDER BY role, email`),
      sql<QueryResultRow[]>(
        `SELECT id, country, request_type, notification_role, approval_status, source_column, display_name,
                COALESCE(email, '') AS email
         FROM procure_guard_notification_recipients
         ORDER BY country, request_type, approval_status NULLS LAST, notification_role, display_name`,
      ),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_delegations ORDER BY is_active DESC, created_at DESC`),
    ]);

    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    const permissions = normalisePaymentCountries(serialise<ProcureGuardPermissionRow[]>(permissionRows));
    return {
      actor,
      adhoc,
      advance,
      activity: serialise<ProcureGuardActivityRow[]>(activityRows),
      permissions,
      notification_recipients: serialise<ProcureGuardNotificationContact[]>(notificationRecipientRows),
      delegations: serialise<ProcureGuardDelegation[]>(delegationRows),
      stats: buildStats(adhoc, advance),
    };
  } catch (err) {
    log.error('getProcureGuardAdminData.failed', err);
    return null;
  }
}

export async function createAdminAdhocPayment(input: AdminCreateAdhocPaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardPaymentRequestColumns();
    const requestedByEmail = input.requested_by_email?.trim() || actor.email;
    const requestedByName = input.requested_by_name?.trim() || actor.name;
    // Admin-create never had the acknowledgement check the requester forms carry.
    const normalised = normaliseAdhocInput(input, { requesterEmail: requestedByEmail, requireAcknowledgement: false });
    const status = input.status || 'Submitted';

    const result = await insertAdhocRequest({
      input,
      normalised,
      department: input.department ?? actor.department,
      status,
      requestedByName,
      requestedByEmail,
    });
    const reference = result.reference;

    await writeActivity({
      requestType: 'adhoc',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Admin created adhoc PO',
      actor,
    });

    await notifyProcureGuardNextApprover({
      event: 'request.submitted',
      requestType: 'adhoc',
      table: 'procure_guard_adhoc_payments',
      requestId: result.insertId,
      actor,
      comment: input.requester_comments ?? input.notes ?? null,
    });

    revalidateProcureGuardPaths();
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    log.error('createAdminAdhocPayment.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create adhoc PO.' };
  }
}

export async function createAdminAdvancePayment(input: AdminCreateAdvancePaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardPaymentRequestColumns();
    const requestedByEmail = input.requested_by_email?.trim() || actor.email;
    const requestedByName = input.requested_by_name?.trim() || actor.name;
    const normalised = normaliseAdvanceInput(input, { requesterEmail: requestedByEmail });
    const status = input.status || 'Submitted';

    const result = await insertAdvanceRequest({
      input,
      normalised,
      department: input.department ?? actor.department,
      status,
      requestedByName,
      requestedByEmail,
    });
    const reference = result.reference;

    await writeActivity({
      requestType: 'advance',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Admin created advance payment',
      actor,
    });

    await notifyProcureGuardNextApprover({
      event: 'request.submitted',
      requestType: 'advance',
      table: 'procure_guard_advance_payments',
      requestId: result.insertId,
      actor,
      comment: input.requester_comments ?? input.notes ?? null,
    });

    revalidateProcureGuardPaths();
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    log.error('createAdminAdvancePayment.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create advance payment.' };
  }
}

export async function deleteProcureGuardRecord(
  recordType: ProcureGuardRequestType | 'activity',
  id: number,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();

    if (!actor.permissions.canDeleteRecords) {
      return { success: false, error: 'Delete access is required for this action.' };
    }

    if (recordType === 'activity') {
      await exec(`DELETE FROM procure_guard_activity_log WHERE id = ?`, [id]);
      revalidateProcureGuardPaths();
      return { success: true };
    }

    const table = recordType === 'adhoc' ? 'procure_guard_adhoc_payments' : 'procure_guard_advance_payments';
    const rows = await sql<QueryResultRow[]>(`SELECT reference_number FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Record not found.' };

    await exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await exec(`DELETE FROM procure_guard_activity_log WHERE request_type = ? AND request_id = ?`, [recordType, id]);
    await writeActivity({
      requestType: recordType,
      requestId: id,
      referenceNumber: row.reference_number,
      action: `Admin deleted ${recordType} payment`,
      actor,
    });

    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('deleteProcureGuardRecord.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete record.' };
  }
}

export async function updateProcureGuardNotificationRecipient(input: {
  id: number;
  display_name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }

    const id = Number(input.id);
    const displayName = requireText(input.display_name, 'Display name');
    const email = requireText(input.email, 'Email').toLowerCase();
    if (!isValidEmail(email)) {
      return { success: false, error: 'Enter a valid email address.' };
    }

    const result = await exec(
      `UPDATE procure_guard_notification_recipients
       SET display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [displayName, email, id],
    );

    if (result.rowCount === 0) return { success: false, error: 'Notification recipient not found.' };

    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('updateProcureGuardNotificationRecipient.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update notification recipient.' };
  }
}

export async function updateProcureGuardNotificationRecipientGroup(input: {
  ids: number[];
  display_name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }

    const ids = [...new Set(input.ids.map(Number).filter(Number.isFinite))];
    if (ids.length === 0) return { success: false, error: 'Choose at least one notification recipient row.' };

    const displayName = requireText(input.display_name, 'Display name');
    const email = requireText(input.email, 'Email').toLowerCase();
    if (!isValidEmail(email)) {
      return { success: false, error: 'Enter a valid email address.' };
    }

    const result = await exec(
      `UPDATE procure_guard_notification_recipients
       SET display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY(?::int[])`,
      [displayName, email, ids],
    );

    if (result.rowCount === 0) return { success: false, error: 'Notification recipients not found.' };

    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('updateProcureGuardNotificationRecipientGroup.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update notification recipient group.' };
  }
}

export async function getProcureGuardApproverMatrix(): Promise<ProcureGuardApproverMatrix> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { countries: [], columns: APPROVER_MATRIX_COLUMNS, cells: {} };
    }
    const roles = [...new Set(APPROVER_MATRIX_COLUMNS.map((c) => c.notificationRole))];
    const rows = await sql<QueryResultRow[]>(
      `SELECT id, country, notification_role, request_type, display_name, email
       FROM procure_guard_notification_recipients
       WHERE is_active = TRUE AND notification_role = ANY(?)
       ORDER BY country ASC, id ASC`,
      [roles],
    );
    const colFor = (role: string, rt: string) =>
      APPROVER_MATRIX_COLUMNS.find((c) => c.notificationRole === role && c.requestType === rt);

    const cells: Record<string, Record<string, ApproverCell | null>> = {};
    const countrySet = new Set<string>();
    for (const r of rows) {
      const country = String(r.country ?? '').trim();
      if (!country) continue;
      const col = colFor(String(r.notification_role), String(r.request_type));
      if (!col) continue;
      countrySet.add(country);
      cells[country] = cells[country] ?? {};
      if (!cells[country][col.key]) {
        const name = String(r.display_name ?? '').trim() || String(r.email ?? '');
        cells[country][col.key] = { name, email: String(r.email ?? '') };
      }
    }
    const countries = [...countrySet].sort((a, b) => a.localeCompare(b));
    for (const country of countries) {
      cells[country] = cells[country] ?? {};
      for (const col of APPROVER_MATRIX_COLUMNS) if (!(col.key in cells[country])) cells[country][col.key] = null;
    }
    return { countries, columns: APPROVER_MATRIX_COLUMNS, cells };
  } catch (err) {
    log.error('getProcureGuardApproverMatrix.failed', err);
    return { countries: [], columns: APPROVER_MATRIX_COLUMNS, cells: {} };
  }
}

// Assign the approver for one (country, role, request_type). Updates the matching recipient
// row(s) or inserts one, then re-syncs recipients -> access/permissions so the person can approve.
export async function setProcureGuardApprover(input: {
  country: string;
  notificationRole: string;
  requestType: 'adhoc' | 'advance';
  email: string;
  displayName: string;
}): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }
    const email = requireText(input.email, 'Email').toLowerCase();
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    const displayName = requireText(input.displayName, 'Name');
    const country = requireText(input.country, 'Country');
    const role = requireText(input.notificationRole, 'Role');
    const rt = input.requestType === 'adhoc' ? 'adhoc' : 'advance';

    await upsertProcureGuardRecipientRow(country, role, rt, email, displayName);

    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('setProcureGuardApprover.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to set approver.' };
  }
}

// Assign one person to an ENTIRE column (a role/request_type across every country). Bulk overwrite,
// then re-sync recipients -> access/permissions so the person can approve everywhere.
export async function setProcureGuardApproverForColumn(input: {
  notificationRole: string;
  requestType: 'adhoc' | 'advance';
  email: string;
  displayName: string;
}): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }
    const email = requireText(input.email, 'Email').toLowerCase();
    if (!isValidEmail(email)) return { success: false, error: 'Enter a valid email address.' };
    const displayName = requireText(input.displayName, 'Name');
    const role = requireText(input.notificationRole, 'Role');
    const rt = input.requestType === 'adhoc' ? 'adhoc' : 'advance';

    // Cover every country the matrix shows: update existing rows and insert where a country has none,
    // so a header assignment truly sets the whole column (not just countries that already had a row).
    const countryRows = await sql<QueryResultRow[]>(
      `SELECT DISTINCT country FROM procure_guard_notification_recipients
       WHERE is_active = TRUE AND notification_role = ANY(?) AND country IS NOT NULL AND TRIM(country) <> ''`,
      [[...new Set(APPROVER_MATRIX_COLUMNS.map((c) => c.notificationRole))]],
    );
    const countries = countryRows.map((r) => String(r.country).trim()).filter(Boolean);
    if (countries.length === 0) return { success: false, error: 'No countries found to assign.' };
    for (const country of countries) {
      await upsertProcureGuardRecipientRow(country, role, rt, email, displayName);
    }

    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('setProcureGuardApproverForColumn.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to set column approver.' };
  }
}

// Everyone currently holding the Viewer role, with their country scope (empty array = all countries).
export async function getProcureGuardViewerGrants(): Promise<ProcureGuardViewerGrant[]> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) return [];
    const rows = await sql<QueryResultRow[]>(
      `SELECT email, name, country FROM procure_guard_permissions WHERE role = 'Viewer' ORDER BY LOWER(COALESCE(name, email))`,
    );
    return rows.map((r) => ({
      email: String(r.email),
      name: String(r.name ?? '').trim() || String(r.email),
      countries: getProcureGuardCountryScopeCountries(r.country ? String(r.country) : null),
    }));
  } catch (err) {
    log.error('getProcureGuardViewerGrants.failed', err);
    return [];
  }
}

export async function testProcureGuardN8nWebhook(): Promise<ActionResult<{
  status: number;
  statusText: string;
  webhookHost: string;
  webhookPath: string;
}>> {
  try {
    await requirePermissionManager();
    const rawWebhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
    if (!rawWebhookUrl) {
      return {
        success: false,
        error: 'N8N_PROCUREGUARD_WEBHOOK_URL is not configured in the running app environment.',
      };
    }

    const webhookUrl = stripEnvQuotes(rawWebhookUrl);
    const parsedUrl = new URL(webhookUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-procureguard-secret'] = secret;

    const response = await postProcureGuardWebhook(webhookUrl, headers, {
      event: 'procureguard.webhook_test',
      source: 'procureguard-admin-test',
      occurred_at: new Date().toISOString(),
      message: 'ProcureGuard n8n webhook connectivity test',
    });

    return {
      success: response.ok,
      data: {
        status: response.status,
        statusText: response.statusText,
        webhookHost: parsedUrl.hostname,
        webhookPath: parsedUrl.pathname,
      },
      error: response.ok ? undefined : `n8n responded with ${response.status} ${response.statusText || ''}`.trim(),
    };
  } catch (err) {
    log.error('testProcureGuardN8nWebhook.failed', err);
    return {
      success: false,
      error: procureGuardWebhookErrorMessage(err),
    };
  }
}

/**
 * The explicit admin "Re-sync approver access" action. The sync is a WRITE, so it needs a deliberate
 * click behind a permission-manager guard — it must never ride along on a page render.
 */
export async function resyncProcureGuardRecipientAccess(): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }
    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('resyncProcureGuardRecipientAccess.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to re-sync approver access.' };
  }
}

export async function deleteProcureGuardAccessRequest(userEmail: string): Promise<ActionResult> {
  try {
    await requirePermissionManager();
    await ensureProcureGuardAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(`DELETE FROM procure_guard_access_requests WHERE user_email = ?`, [email]);
    if (!isProcureGuardAdminEmail(email)) {
      await exec(`DELETE FROM procure_guard_permissions WHERE email = ?`, [email]);
    }
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('deleteProcureGuardAccessRequest.failed', err);
    return { success: false, error: 'Failed to delete ProcureGuard access record.' };
  }
}

export async function updateProcureGuardPermission(input: UpdateProcureGuardPermissionInput): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureProcureGuardPermissionRoleValues();
    const email = requireText(input.email, 'Email').toLowerCase();
    const role = input.role;
    const country = normalisePermissionCountryForRole(role, input.country);
    const canManageAll = canUseProcureGuardAdmin(getProcureGuardAccessView(actor.role));
    const canManageOwnConfiguredAdmin = actor.email.toLowerCase() === email && isProcureGuardAdminEmail(email);

    if (!canManageAll && !canManageOwnConfiguredAdmin) {
      return { success: false, error: 'Permission management access is required.' };
    }

    if (!PERMISSION_ROLE_OPTIONS.includes(role)) {
      return { success: false, error: 'Choose a valid permission level.' };
    }

    await exec(
      `INSERT INTO procure_guard_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         country = EXCLUDED.country,
         segment = EXCLUDED.segment,
         updated_at = CURRENT_TIMESTAMP`,
      [
        email,
        blankToNull(input.name),
        role,
        blankToNull(country),
        blankToNull(input.segment),
      ],
    );

    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    log.error('updateProcureGuardPermission.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update permission.' };
  }
}
