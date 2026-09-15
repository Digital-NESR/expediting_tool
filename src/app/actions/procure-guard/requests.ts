'use server';

/**
 * ProcureGuard request write actions: create, edit and status transitions for both request types.
 *
 * Every export here is a public POST endpoint. The validate-and-write bodies live in
 * lib/procure-guard/write-requests, which is where `spend_value_usd` is computed server-side —
 * it is never taken from the client, because it decides which approval gates apply.
 */
import type { QueryResultRow } from 'pg';
import { revalidatePath, revalidateTag } from 'next/cache';
import { logger } from '@/lib/logger';
import {
  formatProcureGuardStatusLabel,
  getNextApprovalStatus,
  getRequiredPermissionForTransition,
  isActiveApprovalStatus,
  procureGuardThreshold,
  REVIEWED_STATUSES,
} from '@/lib/procureGuard-utils';
import { actorCanAccessRequestScope } from '@/lib/procure-guard/access';
import { resolveDelegationAttribution, writeActivity } from '@/lib/procure-guard/activity';
import { getActor, getScopeRestrictionMessage, requireProcureGuardOperationalAccess } from '@/lib/procure-guard/actor';
import { PROCUREGUARD_DATA_TAG } from '@/lib/procure-guard/constants';
import { ensureProcureGuardPaymentRequestColumns, exec, sql } from '@/lib/procure-guard/internals';
import { notifyProcureGuardNextApprover } from '@/lib/procure-guard/notifications';
import { blankToNull } from '@/lib/procure-guard/validation';
import {
  insertAdhocRequest,
  insertAdvanceRequest,
  normaliseAdhocInput,
  normaliseAdvanceInput,
  resetRejectedRequest,
  updateAdhocRequest,
  updateAdvanceRequest,
} from '@/lib/procure-guard/write-requests';
import type {
  ActionResult,
  CreateAdhocPaymentInput,
  CreateAdvancePaymentInput,
  ProcureGuardStatus,
} from '@/types/procureGuard';

const log = logger('procure-guard');

export async function createAdhocPayment(input: CreateAdhocPaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    if (!actor.permissions.canCreateRequests) throw new Error('Request creation access is required.');
    await ensureProcureGuardPaymentRequestColumns();
    const normalised = normaliseAdhocInput(input, { requesterEmail: actor.email, requireAcknowledgement: true });

    const result = await insertAdhocRequest({
      input,
      normalised,
      department: input.department ?? actor.department,
      status: null,
      requestedByName: actor.name,
      requestedByEmail: actor.email,
    });
    const reference = result.reference;

    await writeActivity({
      requestType: 'adhoc',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Adhoc PO submitted',
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

    revalidatePath('/procure-guard');
    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath('/procure-guard/adhoc-payments');
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    log.error('createAdhocPayment.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create adhoc PO request.' };
  }
}

export async function createAdvancePayment(input: CreateAdvancePaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    if (!actor.permissions.canCreateRequests) throw new Error('Request creation access is required.');
    await ensureProcureGuardPaymentRequestColumns();
    const normalised = normaliseAdvanceInput(input, { requesterEmail: actor.email });

    const result = await insertAdvanceRequest({
      input,
      normalised,
      department: input.department ?? actor.department,
      status: null,
      requestedByName: actor.name,
      requestedByEmail: actor.email,
    });
    const reference = result.reference;

    await writeActivity({
      requestType: 'advance',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Advance payment submitted',
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

    revalidatePath('/procure-guard');
    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath('/procure-guard/advance-payments');
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    log.error('createAdvancePayment.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create advance payment request.' };
  }
}

export async function updateAdhocPaymentRequest(id: number, input: CreateAdhocPaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments WHERE id = ? LIMIT 1`, [id]);
    const existing = rows[0];
    if (!existing) return { success: false, error: 'Request not found.' };
    if (existing.status !== 'Submitted' && existing.status !== 'Rejected') {
      return { success: false, error: 'This request can only be edited before review starts or after it is rejected.' };
    }
    const wasRejected = existing.status === 'Rejected';

    const ownsRequest = String(existing.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    if (!ownsRequest && !actor.permissions.canManageData) {
      return { success: false, error: 'Only the requester can edit this request.' };
    }

    const normalised = normaliseAdhocInput(input, { requesterEmail: existing.requested_by_email, requireAcknowledgement: true });

    await updateAdhocRequest(id, input, normalised);

    if (wasRejected) {
      await resetRejectedRequest('procure_guard_adhoc_payments', id);
    }

    await writeActivity({
      requestType: 'adhoc',
      requestId: id,
      referenceNumber: existing.reference_number,
      action: wasRejected ? 'Adhoc PO resubmitted after rejection' : 'Adhoc PO edited before review',
      actor,
    });

    if (wasRejected) {
      await notifyProcureGuardNextApprover({
        event: 'request.submitted',
        requestType: 'adhoc',
        table: 'procure_guard_adhoc_payments',
        requestId: id,
        actor,
        comment: input.requester_comments ?? input.notes ?? null,
      });
    }

    revalidatePath('/procure-guard');
    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath('/procure-guard/adhoc-payments');
    revalidatePath(`/procure-guard/adhoc-payments/${id}`);
    return { success: true, data: { id }, reference_number: existing.reference_number };
  } catch (err) {
    log.error('updateAdhocPaymentRequest.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update adhoc PO request.' };
  }
}

export async function updateAdvancePaymentRequest(id: number, input: CreateAdvancePaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments WHERE id = ? LIMIT 1`, [id]);
    const existing = rows[0];
    if (!existing) return { success: false, error: 'Request not found.' };
    if (existing.status !== 'Submitted' && existing.status !== 'Rejected') {
      return { success: false, error: 'This request can only be edited before review starts or after it is rejected.' };
    }
    const wasRejected = existing.status === 'Rejected';

    const ownsRequest = String(existing.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    if (!ownsRequest && !actor.permissions.canManageData) {
      return { success: false, error: 'Only the requester can edit this request.' };
    }

    const normalised = normaliseAdvanceInput(input, { requesterEmail: existing.requested_by_email });

    await updateAdvanceRequest(id, input, normalised);

    if (wasRejected) {
      await resetRejectedRequest('procure_guard_advance_payments', id);
    }

    await writeActivity({
      requestType: 'advance',
      requestId: id,
      referenceNumber: existing.reference_number,
      action: wasRejected ? 'Advance payment resubmitted after rejection' : 'Advance payment edited before review',
      actor,
    });

    if (wasRejected) {
      await notifyProcureGuardNextApprover({
        event: 'request.submitted',
        requestType: 'advance',
        table: 'procure_guard_advance_payments',
        requestId: id,
        actor,
        comment: input.requester_comments ?? input.notes ?? null,
      });
    }

    revalidatePath('/procure-guard');
    revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
    revalidatePath('/procure-guard/advance-payments');
    revalidatePath(`/procure-guard/advance-payments/${id}`);
    return { success: true, data: { id }, reference_number: existing.reference_number };
  } catch (err) {
    log.error('updateAdvancePaymentRequest.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update advance payment request.' };
  }
}

async function updateStatusCommon(input: {
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments';
  requestType: 'adhoc' | 'advance';
  id: number;
  status: ProcureGuardStatus;
  notes?: string;
}): Promise<ActionResult> {
  const actor = await getActor();

  const rows = await sql<QueryResultRow[]>(`SELECT * FROM ${input.table} WHERE id = ? LIMIT 1`, [input.id]);
  const row = rows[0];
  if (!row) return { success: false, error: 'Request not found.' };

  const ownsRequest = String(row.requested_by_email).toLowerCase() === actor.email.toLowerCase();
  const userCancellingOwnRequest = ownsRequest && input.status === 'Cancelled';

  // When the actor acts via a delegation (not their own authority), capture the delegator so the
  // activity trail can show "<delegate> on behalf of <delegator>".
  let onBehalfOf: { name: string; email: string } | null = null;

  if (userCancellingOwnRequest && actor.permissions.canCreateRequests) {
    if (row.status !== 'Submitted') {
      return { success: false, error: 'This request can only be cancelled before review starts.' };
    }
  } else {
    const { amount: thresholdAmount, currency: thresholdCurrency } = procureGuardThreshold(row);
    const expectedNextStatus = getNextApprovalStatus(input.requestType, row.status, thresholdAmount, thresholdCurrency);
    const requiredPermission = getRequiredPermissionForTransition(
      input.requestType,
      row.status,
      input.status,
      thresholdAmount,
      thresholdCurrency,
    );
    const validApprovalMove = expectedNextStatus === input.status;
    const validRejectMove = input.status === 'Rejected' && isActiveApprovalStatus(row.status);

    if (!validApprovalMove && !validRejectMove) {
      return { success: false, error: `Cannot move ${row.reference_number} from ${formatProcureGuardStatusLabel(row.status)} to ${formatProcureGuardStatusLabel(input.status)}.` };
    }

    if (!requiredPermission || !actor.permissions[requiredPermission]) {
      return {
        success: false,
        error: `${actor.role} cannot move this request from ${formatProcureGuardStatusLabel(row.status)} to ${formatProcureGuardStatusLabel(input.status)}. Contact a ProcureGuard admin if your access needs to change.`,
      };
    }

    if (!actorCanAccessRequestScope(actor, row)) {
      return {
        success: false,
        error: getScopeRestrictionMessage(actor, row),
      };
    }

    onBehalfOf = resolveDelegationAttribution(actor, input.requestType, row.status, input.status, row);
  }

  const comment = typeof input.notes === 'string' ? input.notes.trim() : '';
  const requiresComment = input.status === 'Rejected';
  if (requiresComment && !comment) {
    return { success: false, error: 'Add a comment before rejecting this request.' };
  }

  const setReviewed = REVIEWED_STATUSES.includes(input.status);
  const setCancelled = input.status === 'Cancelled';
  const shouldSetReviewer = setReviewed || setCancelled;
  const rejectionReason = input.status === 'Rejected' ? blankToNull(comment) : null;
  const reviewComments = shouldSetReviewer ? blankToNull(comment) : row.review_comments;

  // Optimistic lock: the transition above was validated against `row.status`, so only write if the
  // row is still in that status. Without this, two concurrent approvals (or a cancel racing an
  // approval) both pass validation and both write — duplicate activity rows, duplicate n8n webhooks
  // and emails, and a last-write-wins status. A lost race must produce NO side effects, so the
  // activity log and the webhook below only run when this UPDATE actually matched a row.
  const updateResult = await exec(
    `UPDATE ${input.table}
     SET status = ?,
         reviewed_by_name = ?,
         reviewed_by_email = ?,
         reviewed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
         rejection_reason = ?,
         review_comments = ?,
         reminder_7d_sent_at = NULL,
         reminder_14d_sent_at = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = ?`,
    [
      input.status,
      shouldSetReviewer ? actor.name : row.reviewed_by_name,
      shouldSetReviewer ? actor.email : row.reviewed_by_email,
      setReviewed || setCancelled,
      rejectionReason,
      reviewComments,
      input.id,
      row.status,
    ],
  );

  if (updateResult.rowCount === 0) {
    return { success: false, error: 'This request was updated by someone else. Refresh and try again.' };
  }

  await writeActivity({
    requestType: input.requestType,
    requestId: input.id,
    referenceNumber: row.reference_number,
    action: `Status updated to ${formatProcureGuardStatusLabel(input.status)}`,
    actor,
    notes: comment || null,
    onBehalfOfName: onBehalfOf?.name ?? null,
    onBehalfOfEmail: onBehalfOf?.email ?? null,
  });

  await notifyProcureGuardNextApprover({
    event: 'request.status_changed',
    requestType: input.requestType,
    table: input.table,
    requestId: input.id,
    actor,
    previousStatus: row.status,
    comment: comment || null,
  });

  revalidatePath('/procure-guard');
  revalidateTag(PROCUREGUARD_DATA_TAG, 'max');
  revalidatePath('/procure-guard/my-work');
  revalidatePath('/procure-guard/adhoc-payments');
  revalidatePath(`/procure-guard/adhoc-payments/${input.id}`);
  revalidatePath('/procure-guard/advance-payments');
  revalidatePath(`/procure-guard/advance-payments/${input.id}`);
  return { success: true };
}

export async function updateAdhocPaymentStatus(
  id: number,
  status: ProcureGuardStatus,
  notes?: string,
): Promise<ActionResult> {
  try {
    return await updateStatusCommon({
      table: 'procure_guard_adhoc_payments',
      requestType: 'adhoc',
      id,
      status,
      notes,
    });
  } catch (err) {
    log.error('updateAdhocPaymentStatus.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update adhoc PO status.' };
  }
}

export async function updateAdvancePaymentStatus(
  id: number,
  status: ProcureGuardStatus,
  notes?: string,
): Promise<ActionResult> {
  try {
    return await updateStatusCommon({
      table: 'procure_guard_advance_payments',
      requestType: 'advance',
      id,
      status,
      notes,
    });
  } catch (err) {
    log.error('updateAdvancePaymentStatus.failed', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update advance payment status.' };
  }
}
