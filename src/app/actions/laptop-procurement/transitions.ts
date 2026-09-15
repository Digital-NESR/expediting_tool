'use server';

/* ─── Moving a request through the approval stages, and taking it back out again. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { asSerialised } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import {
  IT_MANAGER_STATUSES,
  getLaptopApprovalStage,
  getNextApprovalStatus,
  getRequiredPermissionForStage,
  laptopHasAssignedUnit,
  laptopIsProcureNewFlow,
} from '@/lib/laptopProcurement-utils';
import type { LaptopPermissionKey } from '@/lib/laptopProcurement-utils';
import type {
  ActionResult,
  AssignExistingLaptopInput,
  LaptopRequest,
  LaptopRequestStatus,
  SubmitProcureNewDetailsInput,
} from '@/types/laptopProcurement';
import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import {
  laptopActingIdentities,
  requireAdminActor,
  requireOperationalAccess,
  resolveLaptopActing,
} from '@/lib/laptop-procurement/access';
import { getActor, stageHasCountry } from '@/lib/laptop-procurement/actor';
import { QueryParam, QueryParams, exec, execTx, sql, sqlTx } from '@/lib/laptop-procurement/db';
import {
  STAGE_APPROVED_DATE_COLUMN,
  STAGE_APPROVER_NAME_COLUMN,
  blankToNull,
  getPendingWithLabel,
  requireText,
  revalidateLaptopPaths,
  writeActivity,
} from '@/lib/laptop-procurement/internals';
import {
  deferLaptopNotifications,
  notifyLaptopFinalApproval,
  notifyLaptopNextApprover,
  notifyLaptopRequesterUpdate,
} from '@/lib/laptop-procurement/notifications';
import { ensureLaptopDecisionColumns } from '@/lib/laptop-procurement/schema';
import {
  REJECTING_STAGE_LABEL,
  STAGE_COMMENT_COLUMN,
  STAGE_DECISION_COLUMN,
} from '@/lib/laptop-procurement/write-requests';

/**
 * Every rejection bounces the request back to the IT Manager to fix and resend, rather
 * than ending it outright — the IT Manager themselves has no reject option (see
 * getRejectStatusForStage). Distinct from updateLaptopRequestStatus since the target
 * status is always the same regardless of which stage rejected, and a reason is always
 * required.
 */
export async function rejectLaptopRequest(id: number, reason: string): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureLaptopDecisionColumns();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    const stageLabel = REJECTING_STAGE_LABEL[currentStatus];
    const requiredPermission = getRequiredPermissionForStage(currentStatus);
    if (!stageLabel || !requiredPermission) {
      return { success: false, error: 'This request cannot be rejected at its current stage.' };
    }

    const acting = resolveLaptopActing(actor, requiredPermission, true, row);
    if (!acting.allowed) {
      if (acting.reason === 'reject')
        return { success: false, error: `${actor.role} cannot reject requests.` };
      if (acting.reason === 'scope')
        return {
          success: false,
          error: `${actor.role} access is limited to your assigned country / segment.`,
        };
      return { success: false, error: `${actor.role} cannot reject this request.` };
    }

    const trimmedReason = requireText(reason, 'Rejection reason');
    const nextStatus: LaptopRequestStatus = 'IT Approval';
    const stageColumn = STAGE_COMMENT_COLUMN[currentStatus];
    const stageDecisionColumn = STAGE_DECISION_COLUMN[currentStatus];

    const sets = [
      'status = ?',
      'pending_with = ?',
      'reviewed_by_name = ?',
      'reviewed_by_email = ?',
      'reviewed_at = CURRENT_TIMESTAMP',
      'rejection_reason = ?',
      'review_comments = ?',
      'updated_at = CURRENT_TIMESTAMP',
    ];
    const params: QueryParams = [
      nextStatus,
      getPendingWithLabel(nextStatus),
      actor.name,
      actor.email,
      trimmedReason,
      trimmedReason,
    ];
    if (stageColumn) {
      sets.push(`${stageColumn} = ?`);
      params.push(trimmedReason);
    }
    if (stageDecisionColumn) {
      sets.push(`${stageDecisionColumn} = ?`);
      params.push('Rejected');
    }
    params.push(id);

    const updatedRow = await withTransaction(laptopProcurementPool, async (client) => {
      const updated = await sqlTx<QueryResultRow[]>(
        client,
        `UPDATE laptop_requests SET ${sets.join(', ')} WHERE id = ? RETURNING *`,
        params,
      );
      await writeActivity({
        requestId: id,
        referenceNumber: row.reference_number,
        action: `Rejected by ${stageLabel} — returned to IT Manager`,
        actor,
        notes: trimmedReason,
        client,
      });
      return updated[0];
    });
    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    // The row as actually committed (RETURNING *), not the pre-update snapshot — patching
    // `row` by hand leaves every column the UPDATE touched stale in the email. Read inside
    // the transaction, notified only after it commits: a webhook cannot be rolled back.
    // ...and deferred past the response with after(), so the reviewer's click returns as
    // soon as the decision is durable instead of waiting on two 15s-timeout webhooks.
    const rejectedRequest = asSerialised<LaptopRequest>(
      updatedRow ?? { ...row, status: nextStatus },
    );
    deferLaptopNotifications('reject', async () => {
      await notifyLaptopNextApprover(rejectedRequest);
      await notifyLaptopRequesterUpdate(rejectedRequest, {
        kind: 'rejected',
        actorName: actor.name,
        actorEmail: actor.email,
        comment: trimmedReason,
        nextOwnerLabel: 'IT Manager',
      });
    });
    return { success: true };
  } catch (err) {
    console.error('[rejectLaptopRequest]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to reject request.',
    };
  }
}

export async function updateLaptopRequestStatus(
  id: number,
  status: LaptopRequestStatus,
  notes?: string,
  assignedLaptop?: AssignExistingLaptopInput,
  procureNew?: SubmitProcureNewDetailsInput,
): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureLaptopDecisionColumns();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    const ownsRequest = String(row.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    const comment = typeof notes === 'string' ? notes.trim() : '';

    const userCancellingOwnRequest = ownsRequest && status === 'Cancelled';
    let requiredPermission: LaptopPermissionKey | null = null;
    let onBehalfOf: string | null = null;
    const hasAssignedUnit = laptopHasAssignedUnit(row);
    const isProcureNewFlow = laptopIsProcureNewFlow(row);
    let procureNewTypeOfDevice = '';
    let procureNewModel = '';
    let isCmProcureNewMove = false;
    let isRepairMove = false;

    if (userCancellingOwnRequest && actor.permissions.canCreateRequests) {
      if (!IT_MANAGER_STATUSES.includes(currentStatus)) {
        return {
          success: false,
          error: 'This request can only be cancelled before approvals begin.',
        };
      }
    } else {
      // "Assign existing laptop" isn't a distinct transition anymore — it's the IT
      // Manager's normal approve-forward move, just with a specific unit attached (see
      // assignedLaptopAssignment below). Rejections are handled by rejectLaptopRequest,
      // never here.
      const isApproveMove =
        getNextApprovalStatus(currentStatus, hasAssignedUnit, isProcureNewFlow) === status;
      // Country Manager can flag a request as needing a brand new device procured instead
      // of approving it outright — routes to the IT Team for device details. Also how a CM
      // overrides an IT Manager's "Assign existing laptop" pick (see clearsAssignedUnit below).
      isCmProcureNewMove = currentStatus === 'CM Approval' && status === 'Procure New Details';
      // Repair & Closed stays an IT-Manager-only outcome (only they assess the physical device).
      isRepairMove = IT_MANAGER_STATUSES.includes(currentStatus) && status === 'Repaired & Closed';

      if (!isApproveMove && !isCmProcureNewMove && !isRepairMove) {
        return {
          success: false,
          error: `Cannot move ${row.reference_number} from ${currentStatus} to ${status}.`,
        };
      }

      requiredPermission = getRequiredPermissionForStage(currentStatus);
      if (!requiredPermission) {
        return {
          success: false,
          error: `${actor.role} cannot move this request from ${currentStatus} to ${status}. Change your role in the admin panel.`,
        };
      }

      const acting = resolveLaptopActing(actor, requiredPermission, false, row);
      if (!acting.allowed) {
        if (acting.reason === 'scope') {
          return {
            success: false,
            error: `${actor.role} access is limited to your assigned country / segment.`,
          };
        }
        return {
          success: false,
          error: `${actor.role} cannot move this request from ${currentStatus} to ${status}. Change your role in the admin panel.`,
        };
      }
      onBehalfOf = acting.onBehalfOf;

      // IT Manager's forward move can specify the device to procure up front instead of
      // assigning existing inventory — this skips the separate CM "Procure New" round-trip
      // entirely, since there's nothing left for the CM to decide once the device is
      // already specified (see canProcureNew's !isProcureNewFlow gate).
      if (procureNew && isApproveMove && IT_MANAGER_STATUSES.includes(currentStatus)) {
        procureNewTypeOfDevice = requireText(procureNew.type_of_device, 'Type of device');
        procureNewModel = requireText(procureNew.model, 'Model');
      }
    }

    const stageColumn = STAGE_COMMENT_COLUMN[currentStatus];
    const setsReviewer = !userCancellingOwnRequest;

    // Stamp the stage approval timestamp when the current stage is signed off (not on cancellation).
    const stageDateColumn = !userCancellingOwnRequest
      ? STAGE_APPROVED_DATE_COLUMN[currentStatus]
      : undefined;
    const stageDateAssignment = stageDateColumn ? `, ${stageDateColumn} = CURRENT_TIMESTAMP` : '';
    // Build dynamic SET for the stage comment column when applicable.
    const stageCommentAssignment = stageColumn && comment ? `, ${stageColumn} = ?` : '';
    // Record who actually acted on this stage (approve, reject, or an alternate outcome) —
    // not just the timestamp, so "Assigned Approvers" shows a name instead of staying blank.
    const stageApproverColumn = setsReviewer
      ? STAGE_APPROVER_NAME_COLUMN[currentStatus]
      : undefined;
    const stageApproverAssignment = stageApproverColumn ? `, ${stageApproverColumn} = ?` : '';
    // What this stage actually decided (as opposed to just that it commented) — shown
    // alongside the comment in the "Decisions" section. Never recorded for the
    // requester cancelling their own request, since that's not a reviewer decision.
    const decisionLabel = userCancellingOwnRequest
      ? null
      : isRepairMove
        ? 'Repaired & Closed'
        : assignedLaptop
          ? 'Assigned Existing Laptop'
          : procureNewTypeOfDevice
            ? 'Procure New (specified by IT Manager)'
            : isCmProcureNewMove
              ? 'Procure New (flagged by Country Manager)'
              : 'Approved';
    const stageDecisionColumn = decisionLabel ? STAGE_DECISION_COLUMN[currentStatus] : undefined;
    const stageDecisionAssignment = stageDecisionColumn ? `, ${stageDecisionColumn} = ?` : '';
    // "Assign existing laptop" hands over a specific second-hand unit — record which one,
    // separate from the current_brand/current_model/serial_no/age_years columns above,
    // which describe the OLD device being replaced. Also updates type_of_device, since
    // the IT Manager can assign a different device type than what was first
    // requested (e.g. a desktop instead of a laptop).
    const assignedLaptopAssignment = assignedLaptop
      ? `, assigned_serial_no = ?, assigned_model = ?, assigned_age = ?, type_of_device = ?`
      : '';
    // A CM choosing "Procure New" on a request that already has an assigned unit is
    // overriding the IT Manager's pick — but the assigned unit's details are left in
    // place (not cleared) so the IT Manager can still see which device they'd
    // originally picked once the request comes back around to procure something new.
    // laptopIsProcureNewFlow / getNextApprovalStatus already prioritise the sticky
    // procure_new_requested flag over hasAssignedUnit, so this doesn't get mistaken
    // for a still-active assign-from-inventory pick.
    // Sticky flag: once a request is flagged for a brand new device — whether the CM
    // flags it later, or the IT Manager specifies it up front via procureNew — it stays
    // flagged through the rest of the chain (see laptopIsProcureNewFlow) — even after
    // resends — so Supply Chain Director's final sign-off still lands on 'Procure New',
    // not 'Approved'.
    const flagsProcureNew =
      (currentStatus === 'CM Approval' && status === 'Procure New Details') ||
      Boolean(procureNewTypeOfDevice);
    // IT Manager assigning an existing unit is a fresh, definitive "no new device
    // needed" decision — it has to clear any procure_new_requested left over from an
    // earlier pass through this same stage (e.g. they originally specified a new
    // device up front, Country Manager rejected it, and now they're assigning
    // existing stock instead). Without this, the stale flag keeps Country Manager's
    // own "Procure New" option hidden even though nothing is actually locked in for
    // procurement anymore.
    const clearsProcureNewFlag =
      Boolean(assignedLaptop) && IT_MANAGER_STATUSES.includes(currentStatus);
    const procureNewFlagAssignment = flagsProcureNew
      ? `, procure_new_requested = TRUE`
      : clearsProcureNewFlag
        ? `, procure_new_requested = FALSE`
        : '';
    // The IT Manager's up-front device specification — same columns the CM-triggered
    // "Procure New Details" step fills in later, just set immediately here instead.
    const procureNewDetailsAssignment = procureNewTypeOfDevice
      ? `, type_of_device = ?, requested_model = ?`
      : '';

    const params: QueryParam[] = [
      status,
      getPendingWithLabel(status),
      setsReviewer ? actor.name : row.reviewed_by_name,
      setsReviewer ? actor.email : row.reviewed_by_email,
      setsReviewer,
      null,
      comment ? comment : row.review_comments,
    ];
    if (stageCommentAssignment) params.push(comment);
    if (stageApproverAssignment) params.push(actor.name);
    if (stageDecisionAssignment) params.push(decisionLabel);
    if (assignedLaptop) {
      params.push(
        blankToNull(assignedLaptop.serial_no),
        blankToNull(assignedLaptop.model),
        blankToNull(assignedLaptop.age),
        blankToNull(assignedLaptop.type_of_device),
      );
    }
    if (procureNewDetailsAssignment) params.push(procureNewTypeOfDevice, procureNewModel);
    params.push(id);

    const activityNotes =
      [comment || null, onBehalfOf ? `On behalf of ${onBehalfOf}` : null]
        .filter(Boolean)
        .join(' — ') || null;

    const updatedRow = await withTransaction(laptopProcurementPool, async (client) => {
      const updated = await sqlTx<QueryResultRow[]>(
        client,
        `UPDATE laptop_requests SET
           status = ?,
           pending_with = ?,
           reviewed_by_name = ?,
           reviewed_by_email = ?,
           reviewed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
           rejection_reason = ?,
           review_comments = ?${stageDateAssignment}${stageCommentAssignment}${stageApproverAssignment}${stageDecisionAssignment}${assignedLaptopAssignment}${procureNewFlagAssignment}${procureNewDetailsAssignment},
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING *`,
        params,
      );

      await writeActivity({
        requestId: id,
        referenceNumber: row.reference_number,
        action: `Status updated to ${status}`,
        actor,
        notes: activityNotes,
        client,
      });
      return updated[0];
    });

    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    // The row as actually committed (RETURNING *), not the pre-update snapshot: an IT
    // Manager's up-front procure-new and an assigned unit's device-type change both rewrite
    // type_of_device / requested_model in this very statement, so patching `row` by hand
    // mailed the approver a description of the wrong device. Read inside the transaction,
    // notified only after it commits: a webhook cannot be rolled back.
    // ...and deferred past the response with after(). This is the path the finding was
    // really about: three webhooks at 15s apiece, plus their matrix/delegation lookups,
    // all of it after the decision was already committed.
    const updatedRequest = asSerialised<LaptopRequest>(updatedRow ?? { ...row, status });
    deferLaptopNotifications('status-update', async () => {
      await notifyLaptopNextApprover(updatedRequest);
      await notifyLaptopFinalApproval(updatedRequest);
      // The requester already knows about their own cancellation — everyone else's
      // decision (approve/assign/procure-new/repair) gets reported back to them.
      if (!userCancellingOwnRequest) {
        const nextStage = getLaptopApprovalStage(status);
        await notifyLaptopRequesterUpdate(updatedRequest, {
          kind: nextStage ? 'forwarded' : 'final_approved',
          actorName: actor.name,
          actorEmail: actor.email,
          comment: comment || null,
          nextOwnerLabel: nextStage,
        });
      }
    });
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopRequestStatus]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update request status.',
    };
  }
}

/**
 * Country Manager flags a request as needing a brand new device instead of approving
 * it outright — it comes back here so the IT Team can specify exactly what to procure
 * (the requester never picks a model upfront). Submitting sends it back to the Country
 * Manager to confirm the specific device before it continues to IT Director.
 */
export async function submitProcureNewDetails(
  id: number,
  input: SubmitProcureNewDetailsInput,
): Promise<ActionResult> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    if (row.status !== 'Procure New Details' && !actor.permissions.canManageData) {
      return {
        success: false,
        error: 'Device details can only be submitted while the request is with the IT Team.',
      };
    }
    const canSubmit =
      actor.permissions.canManageData ||
      laptopActingIdentities(actor).some(
        (identity) =>
          identity.permissions.canReviewItManager &&
          (identity.role === 'Admin' ||
            stageHasCountry(identity.matrixCapabilities, 'IT Manager', row.country)),
      );
    if (!canSubmit) {
      return { success: false, error: 'IT Manager access is required to submit device details.' };
    }

    const typeOfDevice = requireText(input.type_of_device, 'Type of device');
    const model = requireText(input.model, 'Model');
    const nextStatus: LaptopRequestStatus = 'CM Confirm Device';

    const updatedRow = await withTransaction(laptopProcurementPool, async (client) => {
      const updated = await sqlTx<QueryResultRow[]>(
        client,
        `UPDATE laptop_requests SET
           type_of_device = ?, requested_model = ?, status = ?, pending_with = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING *`,
        [typeOfDevice, model, nextStatus, getPendingWithLabel(nextStatus), id],
      );
      await writeActivity({
        requestId: id,
        referenceNumber: row.reference_number,
        action: 'Device details submitted, sent to Country Manager for confirmation',
        actor,
        client,
      });
      return updated[0];
    });
    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    // The row as actually committed (RETURNING *), not the pre-update snapshot patched by
    // hand. Read inside the transaction, notified only after it commits: a webhook cannot
    // be rolled back.
    // ...and deferred past the response with after().
    const confirmedRequest = asSerialised<LaptopRequest>(
      updatedRow ?? {
        ...row,
        status: nextStatus,
        type_of_device: typeOfDevice,
        requested_model: model,
      },
    );
    deferLaptopNotifications('procure-new-details', async () => {
      await notifyLaptopNextApprover(confirmedRequest);
      await notifyLaptopRequesterUpdate(confirmedRequest, {
        kind: 'forwarded',
        actorName: actor.name,
        actorEmail: actor.email,
        comment: null,
        nextOwnerLabel: 'Country Manager',
      });
    });
    return { success: true };
  } catch (err) {
    console.error('[submitProcureNewDetails]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to submit device details.',
    };
  }
}

export async function deleteLaptopRecord(
  recordType: 'request' | 'activity',
  id: number,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canDeleteRecords)
      return { success: false, error: 'Delete access is required.' };

    if (recordType === 'activity') {
      await exec(`DELETE FROM laptop_activity_log WHERE id = ?`, [id]);
      revalidateLaptopPaths();
      return { success: true };
    }

    const rows = await sql<QueryResultRow[]>(
      `SELECT reference_number FROM laptop_requests WHERE id = ? LIMIT 1`,
      [id],
    );
    if (!rows[0]) return { success: false, error: 'Record not found.' };
    // There are no FKs between these tables, so the three deletes have to succeed or
    // fail together — otherwise a failure after the first one leaves attachments and
    // log rows pointing at a request that no longer exists.
    await withTransaction(laptopProcurementPool, async (client) => {
      await execTx(client, `DELETE FROM laptop_requests WHERE id = ?`, [id]);
      await execTx(client, `DELETE FROM laptop_documents WHERE request_id = ?`, [id]);
      await execTx(client, `DELETE FROM laptop_activity_log WHERE request_id = ?`, [id]);
    });
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopRecord]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete record.',
    };
  }
}

/* ── Documents ────────────────────────────────────────────────── */
