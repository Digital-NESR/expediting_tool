'use server';

/* ─── Creating and editing a request. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { lockForTransaction, withTransaction } from '@/lib/db/tx';
import { IT_MANAGER_STATUSES } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
import type {
  ActionResult,
  CreateLaptopRequestInput,
  LaptopRequestStatus,
  UpdateLaptopExistingDeviceInput,
} from '@/types/laptopProcurement';
import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { laptopActingIdentities } from '@/lib/laptop-procurement/access';
import { getActor, stageHasCountry } from '@/lib/laptop-procurement/actor';
import { execTx, sql } from '@/lib/laptop-procurement/db';
import {
  LAPTOP_REFERENCE_LOCK_KEY,
  blankToNull,
  makeReference,
  revalidateLaptopPaths,
  writeActivity,
} from '@/lib/laptop-procurement/internals';
import {
  deferLaptopNotifications,
  notifyNewLaptopRequest,
} from '@/lib/laptop-procurement/notifications';
import { ensureLaptopReferenceUniqueIndex } from '@/lib/laptop-procurement/schema';
import { insertRequest, validateCreateInput } from '@/lib/laptop-procurement/write-requests';

const log = logger('laptop-procurement');

export async function createLaptopRequest(
  input: CreateLaptopRequestInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    if (!actor.permissions.canCreateRequests)
      throw new Error('Request creation access is required.');
    const validated = validateCreateInput(input);
    await ensureLaptopReferenceUniqueIndex();
    // Reference allocation, the request row and its first log line are one unit: the
    // lock keeps two concurrent submissions off the same PLP number, and the
    // transaction means a failed insert doesn't leave a log line for a request that
    // isn't there.
    const { id, reference } = await withTransaction(laptopProcurementPool, async (client) => {
      await lockForTransaction(client, LAPTOP_REFERENCE_LOCK_KEY);
      const reference = await makeReference(client);
      const id = await insertRequest(input, {
        client,
        reference,
        status: 'Submitted',
        requestedByName: actor.name,
        requestedByEmail: actor.email,
        validated,
      });
      await writeActivity({
        requestId: id,
        referenceNumber: reference,
        action: 'Request submitted',
        actor,
        client,
      });
      return { id, reference };
    });
    revalidateLaptopPaths();
    // The request is committed; nobody should watch a webhook timeout before they are
    // told their reference number.
    deferLaptopNotifications('new-request', () => notifyNewLaptopRequest(id));
    return { success: true, data: { id }, reference_number: reference };
  } catch (err) {
    log.error('createLaptopRequest.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create laptop request.',
    };
  }
}

export async function updateLaptopRequest(
  id: number,
  input: CreateLaptopRequestInput,
): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const ownsRequest = String(row.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    if (!(ownsRequest || actor.permissions.canManageData)) {
      return { success: false, error: 'You can only edit your own requests.' };
    }
    if (
      !IT_MANAGER_STATUSES.includes(row.status as LaptopRequestStatus) &&
      !actor.permissions.canManageData
    ) {
      return {
        success: false,
        error: 'This request can no longer be edited because it has entered the approval chain.',
      };
    }

    const v = validateCreateInput(input);
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(
        client,
        `UPDATE laptop_requests SET
           employee_id = ?, priority = ?, request_type = ?, country = ?, computer_for = ?, computer_for_employee_id = ?,
           department = ?, company_code = ?, company_name = ?, cost_center = ?,
           type_of_device = ?, requested_model = ?, special_requirements = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          blankToNull(input.employee_id),
          input.priority || 'Normal',
          v.requestType,
          v.country,
          blankToNull(input.computer_for),
          blankToNull(input.computer_for_employee_id),
          blankToNull(input.department),
          v.companyCode,
          v.companyName,
          v.costCenter,
          // Requested model isn't collected on this form — preserve whatever the IT Team may
          // have already filled in via submitProcureNewDetails rather than blanking it out.
          v.typeOfDevice,
          v.requestedModel ?? row.requested_model,
          v.reason,
          id,
        ],
      );
      await writeActivity({
        requestId: id,
        referenceNumber: row.reference_number,
        action: 'Request updated',
        actor,
        client,
      });
    });
    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    return { success: true, data: { id }, reference_number: row.reference_number };
  } catch (err) {
    log.error('updateLaptopRequest.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update laptop request.',
    };
  }
}

/**
 * Existing Device details (the device being replaced/upgraded) are filled in by
 * the IT Manager once the request reaches them — never collected from the
 * requester. Restricted to whichever identity (own or delegated) owns the IT
 * Manager stage, and only while the request is actually at that stage.
 */
export async function updateLaptopExistingDevice(
  id: number,
  input: UpdateLaptopExistingDeviceInput,
): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    if (!IT_MANAGER_STATUSES.includes(currentStatus) && !actor.permissions.canManageData) {
      return {
        success: false,
        error:
          'Existing Device details can only be edited while the request is with the IT Manager.',
      };
    }
    const canEdit =
      actor.permissions.canManageData ||
      laptopActingIdentities(actor).some(
        (identity) =>
          identity.permissions.canReviewItManager &&
          (identity.role === 'Admin' ||
            stageHasCountry(identity.matrixCapabilities, 'IT Manager', row.country)),
      );
    if (!canEdit) {
      return {
        success: false,
        error: 'IT Manager access is required to edit Existing Device details.',
      };
    }

    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(
        client,
        `UPDATE laptop_requests SET
           unit_id = ?, current_brand = ?, current_model = ?, serial_no = ?, age_years = ?, sap_number = ?,
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          blankToNull(input.unit_id),
          blankToNull(input.current_brand),
          blankToNull(input.current_model),
          blankToNull(input.serial_no),
          blankToNull(input.age_years),
          blankToNull(input.sap_number),
          id,
        ],
      );
      await writeActivity({
        requestId: id,
        referenceNumber: row.reference_number,
        action: 'Existing Device details updated',
        actor,
        client,
      });
    });
    revalidatePath(`/laptop-procurement/requests/${id}`);
    return { success: true };
  } catch (err) {
    log.error('updateLaptopExistingDevice.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update existing device details.',
    };
  }
}

/* ── Status transitions ───────────────────────────────────────── */
