'use server';

/* ─── Moving a request through the approval stages, and taking it back out again. ─── */

import laptopProcurementPool from '@/lib/db-laptop';
import { asSerialised } from '@/lib/db/sql';
import { withTransaction } from '@/lib/db/tx';
import {
  IT_MANAGER_STATUSES,
  getLaptopApprovalStage,
  getNextApprovalStatus,
  getRejectStatusForStage,
  getRequiredPermissionForStage,
  laptopHasAssignedUnit,
  laptopIsProcureNewFlow,
  laptopStagesPassedByOverride,
} from '@/lib/laptopProcurement-utils';
import type { LaptopPermissionKey } from '@/lib/laptopProcurement-utils';
import { logger } from '@/lib/logger';
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
import { ensureLaptopSchema } from '@/lib/laptop-procurement/schema';
import {
  REJECTING_STAGE_LABEL,
  STAGE_COMMENT_COLUMN,
  STAGE_DECISION_COLUMN,
} from '@/lib/laptop-procurement/write-requests';

const log = logger('laptop-procurement');

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
    await ensureLaptopSchema();
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
    /* Where a rejection lands depends on who rejected. Everyone downstream bounces
       it back to the IT Manager to fix and resend; the IT Manager has nobody to
       bounce it to, so theirs ends the request at 'Rejected'. Hardcoding
       'IT Approval' here would have sent an IT Manager's own rejection straight
       back to themselves, looping forever. */
    const nextStatus = getRejectStatusForStage(currentStatus);
    if (!nextStatus) {
      return { success: false, error: 'This request cannot be rejected at its current stage.' };
    }
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
    log.error('rejectLaptopRequest.failed', err);
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
    await ensureLaptopSchema();
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
      /* The Country Manager sending a request back to IT to specify (or change) the
         device. It returns to step 1, the IT Manager's own stage, rather than to a
         waypoint of its own — the same two people were otherwise walking steps 1 and
         2 twice over. */
      isCmProcureNewMove = currentStatus === 'CM Approval' && status === 'IT Approval';
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
      (currentStatus === 'CM Approval' && status === 'IT Approval') ||
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
    // The IT Manager's device specification, whether given up front or after the
    // Country Manager sent the request back for it.
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
    log.error('updateLaptopRequestStatus.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to update request status.',
    };
  }
}

/** Statuses that mean the request was refused, for routing the requester's email. */
const REJECTED_STATUSES: readonly LaptopRequestStatus[] = [
  'Rejected',
  'Rejected by CM',
  'Rejected by ITD',
  'Rejected by SCD',
];

/**
 * An admin setting a request's status directly, outside the workflow.
 *
 * Deliberately NOT a relaxation of `updateLaptopRequestStatus`. That function is the workflow: it
 * refuses any move that is not the legal next step and checks the acting user against the stage
 * they are deciding, and both of those are the point of it. What an admin needs is the opposite —
 * a request stuck in the wrong place, or approved against the wrong row, moved to where it should
 * have been, including backwards. Putting that behind the same function would have meant weakening
 * the checks that protect every ordinary approval.
 *
 * So the rules here are different and few:
 *
 *  - Any status is reachable from any status, because an override that cannot go backwards cannot
 *    fix the mistake people actually make.
 *  - A reason is required, and goes in the activity log. An override with no explanation is
 *    indistinguishable from a bug a month later.
 *  - Stages the request has now passed are stamped with the admin's name, so a jumped-to status
 *    does not read as half-approved — but only the stages this flow really includes, and only
 *    where nobody has already signed. A real approver's name is never overwritten.
 *  - Notifications fire for the NEW status, as they would have if the request had arrived there
 *    normally, unless the admin turns them off. Correcting a data error at nine in the evening
 *    should not have to mail four approvers.
 */
export async function overrideLaptopRequestStatus(
  id: number,
  status: LaptopRequestStatus,
  options: { reason: string; notify: boolean },
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    /* The same flag that governs editing laptop data, not the delete flag: this changes a record
       rather than destroying one, and an admin who may not delete may still need to unstick. */
    if (!actor.permissions.canManageData) {
      return { success: false, error: 'Manage data access is required to override a status.' };
    }

    const reason = typeof options.reason === 'string' ? options.reason.trim() : '';
    if (!reason) return { success: false, error: 'A reason is required to override a status.' };

    await ensureLaptopSchema();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    if (currentStatus === status) {
      return { success: false, error: `${row.reference_number} is already ${status}.` };
    }

    const passed = laptopStagesPassedByOverride(
      currentStatus,
      status,
      laptopHasAssignedUnit(row),
      laptopIsProcureNewFlow(row),
    );

    /* One assignment per stage the jump signed off. COALESCE on the date and NULLIF on the name
       mean an approver who really did approve keeps their record; only the blanks are filled. */
    const stageAssignments: string[] = [];
    const stageParams: QueryParam[] = [];
    for (const stage of passed) {
      const dateColumn = STAGE_APPROVED_DATE_COLUMN[stage];
      if (dateColumn) stageAssignments.push(`, ${dateColumn} = COALESCE(${dateColumn}, CURRENT_TIMESTAMP)`);
      const nameColumn = STAGE_APPROVER_NAME_COLUMN[stage];
      if (nameColumn) {
        stageAssignments.push(`, ${nameColumn} = COALESCE(NULLIF(${nameColumn}, ''), ?)`);
        stageParams.push(actor.name);
      }
    }

    const isRejection = REJECTED_STATUSES.includes(status);

    const params: QueryParams = [
      status,
      getPendingWithLabel(status),
      actor.name,
      actor.email,
      // The reason belongs in rejection_reason only when the new status is a refusal; anywhere
      // else it is an administrative note and goes to review_comments, where the UI reads it.
      isRejection ? reason : blankToNull(row.rejection_reason as string | null),
      reason,
      ...stageParams,
      id,
    ];

    const updatedRow = await withTransaction(laptopProcurementPool, async (client) => {
      const updated = await sqlTx<QueryResultRow[]>(
        client,
        `UPDATE laptop_requests SET
           status = ?,
           pending_with = ?,
           reviewed_by_name = ?,
           reviewed_by_email = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = ?,
           review_comments = ?${stageAssignments.join('')},
           updated_at = CURRENT_TIMESTAMP
         WHERE id = ?
         RETURNING *`,
        params,
      );

      /* "Status updated to X" is what the ordinary transition writes, and the request timeline is
         replayed from these rows elsewhere in the hub. Keeping that prefix means an override still
         reads as a status change to anything parsing the log, while the word "overridden" and the
         from-status make it obvious to a human that nobody walked the chain. */
      await writeActivity({
        requestId: id,
        referenceNumber: row.reference_number,
        action: `Status updated to ${status}`,
        actor,
        notes:
          `Overridden from ${currentStatus} by ${actor.name} (admin). Reason: ${reason}` +
          (passed.length ? ` Stages stamped: ${passed.join(', ')}.` : '') +
          (options.notify ? '' : ' Notifications suppressed.'),
        client,
      });
      return updated[0];
    });

    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);

    if (options.notify) {
      // The committed row, not the pre-update snapshot — same reasoning as the ordinary
      // transition: a webhook cannot be rolled back, and it must describe what is actually true.
      const updatedRequest = asSerialised<LaptopRequest>(updatedRow ?? { ...row, status });
      deferLaptopNotifications('status-override', async () => {
        // Each of these self-guards on the status, so the new status alone decides which fire.
        await notifyLaptopNextApprover(updatedRequest);
        await notifyLaptopFinalApproval(updatedRequest);
        const nextStage = getLaptopApprovalStage(status);
        await notifyLaptopRequesterUpdate(updatedRequest, {
          kind: isRejection ? 'rejected' : nextStage ? 'forwarded' : 'final_approved',
          actorName: actor.name,
          actorEmail: actor.email,
          comment: reason,
          nextOwnerLabel: nextStage,
        });
      });
    }

    return { success: true };
  } catch (err) {
    log.error('overrideLaptopRequestStatus.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to override request status.',
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
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [
      id,
    ]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    if (!IT_MANAGER_STATUSES.includes(row.status) && !actor.permissions.canManageData) {
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
    /* Forward to the Country Manager, step 2 — not to a confirmation waypoint of
       their own. The CM reviews the device as part of their normal approval. */
    const nextStatus: LaptopRequestStatus = 'CM Approval';

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
    log.error('submitProcureNewDetails.failed', err);
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
    log.error('deleteLaptopRecord.failed', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to delete record.',
    };
  }
}

/* ── Documents ────────────────────────────────────────────────── */
