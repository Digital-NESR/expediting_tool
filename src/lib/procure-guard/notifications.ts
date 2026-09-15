/**
 * ProcureGuard notification email templates, recipient previews and the n8n webhook dispatch.
 *
 * A plain module, deliberately NOT `'use server'`: notifyProcureGuardNextApprover emails whoever the
 * recipient directory resolves to, so it must only ever be reachable behind an action's auth guard.
 */
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import {
  formatProcureGuardStatusLabel,
  getPermissionProfile,
  getProcureGuardAvailableActions,
  getWorkflowSteps,
  procureGuardThreshold,
  toUsd,
} from '@/lib/procureGuard-utils';
import type {
  ProcureGuardActor,
  ProcureGuardDelegation,
  ProcureGuardNotificationContact,
  ProcureGuardRequestType,
  ProcureGuardStatus,
} from '@/types/procureGuard';
import { requesterNotificationEmailsOf } from './access';
import {
  countryRecipientKeys,
  escapeHtml,
  formatWebhookAmount,
  getActiveDelegatesByDelegator,
  getProcureGuardNotificationRecipients,
  getProcureGuardNotificationRecipientsForStatuses,
  getRecipientApprovalStatus,
  getRequestDetailUrl,
  postProcureGuardWebhook,
  procureGuardRefRowsHtml,
  procureGuardWebhookErrorMessage,
  serialise,
  sql,
} from './internals';
import type { ProcureGuardWebhookRequest } from './internals';
import { emailTestRecipientOverridesOf, emailTestRecipientsOf } from './validation';

const log = logger('procure-guard');

export type ProcureGuardWorkflowEvent = 'request.submitted' | 'request.status_changed' | 'request.requester_status_changed';

// Expand a role-based approver list to also include each approver's active delegate(s), deduped by email.
export function withDelegateRecipients<T extends { email: string; display_name: string; notification_role: string; approval_status: string | null; country: string }>(
  recipients: T[],
  delegatesByDelegator: Record<string, ProcureGuardDelegation[]>,
): T[] {
  const delegateRecipients = recipients.flatMap(r =>
    (delegatesByDelegator[r.email.trim().toLowerCase()] ?? []).map(d => ({
      display_name: d.delegate_name || d.delegate_email,
      email: d.delegate_email,
      notification_role: `Delegate of ${r.display_name || r.email}`,
      approval_status: r.approval_status,
      country: r.country,
      source_column: 'delegation',
    } as unknown as T)),
  );
  const seen = new Set<string>();
  return [...recipients, ...delegateRecipients].filter(r => {
    const key = r.email.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getNotificationPreviewStatuses(
  requestType: ProcureGuardRequestType,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardStatus[] {
  return getWorkflowSteps(requestType, amount, currency || 'USD')
    .map(step => step.status)
    .filter((status): status is ProcureGuardStatus => status !== 'Submitted' && status !== 'Approved');
}

export async function getProcureGuardNotificationContactPreviewRows(input: {
  requestType: ProcureGuardRequestType;
  country: string | null | undefined;
  amount?: number | string | null;
  currency?: string | null;
}): Promise<ProcureGuardNotificationContact[]> {
  const statuses = getNotificationPreviewStatuses(input.requestType, input.amount, input.currency);
  if (countryRecipientKeys(input.country).length === 0 || statuses.length === 0) return [];

  // Resolve recipients through the SAME path the notifier uses at each reviewer step, so the
  // preview shows exactly who will be emailed. The previous single query matched only
  // approval_status IN (...) gated by country, which dropped role-tagged recipients (no matching
  // approval_status row) and global approvers (Supply Chain Director / Treasury Director /
  // Corporate Controller / CFO) whose recipient row is filed under another country — both of which
  // getProcureGuardNotificationRecipients now handles via its notification_role + global-role rules.
  // One query for ALL steps instead of one per step (the loop used to cost 3-5 round-trips on the
  // request detail page); the per-step matching/ordering rules are unchanged, just applied in JS.
  const profile = getPermissionProfile(null); // ownerLabel derives from the status only, not the profile
  const steps = statuses.map(status => ({
    status,
    ownerLabel: getProcureGuardAvailableActions(profile, input.requestType, status, input.amount, input.currency).ownerLabel,
  }));
  const recipientsByStatus = await getProcureGuardNotificationRecipientsForStatuses({
    requestType: input.requestType,
    country: input.country,
    steps,
  });
  // Group each recipient under THIS step's status: a role-tagged row may carry a null/other
  // stored approval_status, and the contacts panel groups + highlights the step by approval_status.
  const perStep = steps.map(step =>
    (recipientsByStatus.get(step.status) ?? []).map((row, index): ProcureGuardNotificationContact => ({
      id: index,
      country: row.country,
      request_type: input.requestType,
      notification_role: row.notification_role,
      approval_status: step.status,
      source_column: row.source_column,
      display_name: row.display_name,
      email: row.email,
    })),
  );

  const statusRank = new Map(statuses.map((status, index) => [status, index]));
  const seen = new Set<string>();
  return perStep
    .flat()
    .filter(contact => {
      const key = `${contact.approval_status || 'none'}:${contact.email.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (statusRank.get(a.approval_status as ProcureGuardStatus) ?? 99) - (statusRank.get(b.approval_status as ProcureGuardStatus) ?? 99)
      || a.notification_role.localeCompare(b.notification_role)
      || a.display_name.localeCompare(b.display_name));
}

function buildProcureGuardNotificationEmail(input: {
  event: ProcureGuardWorkflowEvent;
  requestType: ProcureGuardRequestType;
  request: ProcureGuardWebhookRequest;
  detailUrl: string;
  ownerLabel: string;
  nextStatus: ProcureGuardStatus | null;
  actor: ProcureGuardActor;
  previousStatus?: ProcureGuardStatus | null;
  comment?: string | null;
}) {
  const typeLabel = input.requestType === 'adhoc' ? 'Adhoc PO' : 'Advance Payment';
  const article = /^[aeiou]/i.test(typeLabel) ? 'An' : 'A';
  const actionLabel = input.event === 'request.submitted' ? 'New request submitted' : 'Request moved forward';
  const subject = `ProcureGuard: ${input.request.reference_number} needs ${input.ownerLabel} review`;
  const comment = input.comment || input.request.requester_comments || '';
  const statusLine = input.previousStatus
    ? `${formatProcureGuardStatusLabel(input.previousStatus)} -> ${formatProcureGuardStatusLabel(input.request.status)}`
    : formatProcureGuardStatusLabel(input.request.status);

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid #006B0C;padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:#006B0C;">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(actionLabel)}</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(input.request.reference_number)} needs your review</h2>
      <p style="margin:0 0 20px 0;color:#4b5563;">${article} ${escapeHtml(typeLabel)} request is waiting for ${escapeHtml(input.ownerLabel)} action.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        ${procureGuardRefRowsHtml(input.request)}
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;width:170px;">Vendor</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.vendor_name)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Amount</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatWebhookAmount(input.request.amount, input.request.currency))}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Country</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.country || 'Unspecified')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Status</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(statusLine)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Next action</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.nextStatus ? formatProcureGuardStatusLabel(input.nextStatus) : 'Review decision')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Requester</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.requested_by_name || input.request.requested_by_email)}</td></tr>
      </table>
      ${comment ? `<div style="background:#f9fafb;border-left:4px solid #006B0C;padding:12px 14px;margin-bottom:22px;"><div style="font-weight:600;margin-bottom:6px;">Comment</div><div style="white-space:pre-wrap;color:#374151;">${escapeHtml(comment)}</div></div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(input.detailUrl)}" style="display:inline-block;background:#006B0C;color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;">Open request</a>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">
        Triggered by ${escapeHtml(input.actor.name || input.actor.email)}. This message was generated by the ProcureGuard workflow.
      </div>
    </div>
  `;

  return { subject, bodyHtml };
}

function isRequesterAcceptedStage(status: ProcureGuardStatus): boolean {
  return status !== 'Rejected' && status !== 'Cancelled';
}

function buildProcureGuardRequesterStageEmail(input: {
  requestType: ProcureGuardRequestType;
  request: ProcureGuardWebhookRequest;
  detailUrl: string;
  actor: ProcureGuardActor;
  ownerLabel: string;
  nextStatus: ProcureGuardStatus | null;
  previousStatus?: ProcureGuardStatus | null;
  comment?: string | null;
}) {
  const typeLabel = input.requestType === 'adhoc' ? 'Adhoc PO' : 'Advance Payment';
  const isRejected = input.request.status === 'Rejected';
  const isCancelled = input.request.status === 'Cancelled';
  const isTerminalStop = isRejected || isCancelled;
  const statusLine = input.previousStatus
    ? `${formatProcureGuardStatusLabel(input.previousStatus)} -> ${formatProcureGuardStatusLabel(input.request.status)}`
    : formatProcureGuardStatusLabel(input.request.status);
  const nextLine = isTerminalStop
    ? 'It will not proceed any further.'
    : input.nextStatus
      ? `It is now waiting for ${input.ownerLabel}.`
      : 'The approval workflow is complete.';
  const comment = input.comment || '';
  const accent = isRejected ? '#b42318' : isCancelled ? '#475569' : '#006B0C';
  const eyebrow = isRejected ? 'Request rejected' : isCancelled ? 'Request cancelled' : 'Requester status update';
  const heading = isRejected
    ? `${input.request.reference_number} has been rejected`
    : isCancelled
      ? `${input.request.reference_number} has been cancelled`
      : `${input.request.reference_number} has moved forward`;
  const intro = isRejected
    ? `Your ${typeLabel} request has been rejected. ${nextLine}`
    : isCancelled
      ? `Your ${typeLabel} request has been cancelled. ${nextLine}`
      : `Your ${typeLabel} request changed stage. ${nextLine}`;
  const nextStepText = isTerminalStop ? 'No further action' : (input.nextStatus ? formatProcureGuardStatusLabel(input.nextStatus) : 'Approved');
  const commentLabel = isRejected ? 'Rejection reason' : isCancelled ? 'Cancellation note' : 'Reviewer comment';
  const subject = isRejected
    ? `ProcureGuard: ${input.request.reference_number} was rejected`
    : isCancelled
      ? `ProcureGuard: ${input.request.reference_number} was cancelled`
      : `ProcureGuard: ${input.request.reference_number} moved to ${formatProcureGuardStatusLabel(input.request.status)}`;

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:${accent};">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(eyebrow)}</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 20px 0;color:#4b5563;">${escapeHtml(intro)}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        ${procureGuardRefRowsHtml(input.request)}
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;width:170px;">Vendor</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.vendor_name)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Amount</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatWebhookAmount(input.request.amount, input.request.currency))}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Country</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.country || 'Unspecified')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Status</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(statusLine)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Next step</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(nextStepText)}</td></tr>
      </table>
      ${comment ? `<div style="background:#f9fafb;border-left:4px solid ${accent};padding:12px 14px;margin-bottom:22px;"><div style="font-weight:600;margin-bottom:6px;">${escapeHtml(commentLabel)}</div><div style="white-space:pre-wrap;color:#374151;">${escapeHtml(comment)}</div></div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(input.detailUrl)}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;">Open request</a>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">
        Updated by ${escapeHtml(input.actor.name || input.actor.email)}. This message was generated by the ProcureGuard workflow.
      </div>
    </div>
  `;

  return { subject, bodyHtml };
}

export async function notifyProcureGuardNextApprover(input: {
  event: ProcureGuardWorkflowEvent;
  requestType: ProcureGuardRequestType;
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments';
  requestId: number;
  actor: ProcureGuardActor;
  previousStatus?: ProcureGuardStatus | null;
  comment?: string | null;
}): Promise<void> {
  const webhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    log.warn('webhook.unconfigured', { reason: 'N8N_PROCUREGUARD_WEBHOOK_URL is not set', requestType: input.requestType, requestId: input.requestId });
    return;
  }

  try {
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM ${input.table} WHERE id = ? LIMIT 1`, [input.requestId]);
    const request = rows[0] ? serialise<ProcureGuardWebhookRequest>(rows[0]) : null;
    if (!request) return;

    const { amount: thresholdAmount, currency: thresholdCurrency } = procureGuardThreshold(request);
    const adminPermissions = getPermissionProfile('Admin');
    const actions = getProcureGuardAvailableActions(
      adminPermissions,
      input.requestType,
      request.status,
      thresholdAmount,
      thresholdCurrency,
    );
    const detailUrl = getRequestDetailUrl(input.requestType, request.id);
    const isEmailTestMode = request.email_test_mode === true;
    const emailTestRecipientOverrides = emailTestRecipientOverridesOf(request);
    const requestPayload = {
      id: request.id,
      reference_number: request.reference_number,
      requisition_number: request.requisition_number,
      po_number: request.po_number ?? null,
      status: request.status,
      previous_status: input.previousStatus ?? null,
      priority: request.priority,
      vendor_name: request.vendor_name,
      amount: request.amount,
      currency: request.currency,
      amount_usd: toUsd(thresholdAmount, thresholdCurrency),
      country: request.country,
      segment: request.segment,
      spend_category: request.spend_category,
      requested_by_name: request.requested_by_name,
      requested_by_email: request.requested_by_email,
      requester_notification_emails: requesterNotificationEmailsOf(request),
      email_test_mode: isEmailTestMode,
      email_test_recipients: emailTestRecipientsOf(request, input.actor.email).map(row => row.email),
      email_test_recipient_overrides: emailTestRecipientOverrides,
      requester_comments: request.requester_comments,
      created_at: request.created_at,
      updated_at: request.updated_at,
      detail_url: detailUrl,
    };
    const actorPayload = {
      name: input.actor.name,
      email: input.actor.email,
      role: input.actor.role,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-procureguard-secret'] = secret;

    if (
      (input.event === 'request.status_changed' || input.event === 'request.submitted')
      && (isRequesterAcceptedStage(request.status) || request.status === 'Rejected' || request.status === 'Cancelled')
      && request.requested_by_email?.trim()
    ) {
      const requesterEmail = buildProcureGuardRequesterStageEmail({
        requestType: input.requestType,
        request,
        detailUrl,
        ownerLabel: actions.ownerLabel,
        nextStatus: actions.nextStatus,
        actor: input.actor,
        previousStatus: input.previousStatus,
        comment: input.comment,
      });
      const requesterName = request.requested_by_name || request.requested_by_email;
      const requesterSideRecipients = [
        {
          name: requesterName,
          email: request.requested_by_email.trim().toLowerCase(),
          role: 'Requester',
          approval_status: null as ProcureGuardStatus | null,
          country: request.country,
          source_column: 'requested_by_email',
        },
        ...requesterNotificationEmailsOf(request).map(email => ({
          name: email,
          email,
          role: 'Requester notification',
          approval_status: null as ProcureGuardStatus | null,
          country: request.country,
          source_column: 'requester_notification_emails',
        })),
      ];
      const requesterTestRole = 'Requester Updates';
      const routedRequesterRecipients = isEmailTestMode ? emailTestRecipientsOf(request, input.actor.email, requesterTestRole) : requesterSideRecipients;
      const requesterPayload = {
        event: 'request.requester_status_changed' as ProcureGuardWorkflowEvent,
        source: 'procureguard-local',
        test_mode: isEmailTestMode,
        occurred_at: new Date().toISOString(),
        request_type: input.requestType,
        request: requestPayload,
        workflow: {
          owner_role: actions.ownerLabel,
          test_role: requesterTestRole,
          required_permission: actions.requiredPermission,
          decision_status: request.status,
          next_status: actions.nextStatus,
        },
        actor: actorPayload,
        comment: input.comment ?? null,
        intended_recipients: requesterSideRecipients.map(row => ({
          name: row.name,
          email: row.email,
          role: row.role,
          approval_status: null,
          country: request.country,
          source_column: row.source_column,
        })),
        recipients: routedRequesterRecipients.map(row => ({
          name: row.name,
          email: row.email,
          role: row.role,
          approval_status: row.approval_status ?? null,
          country: row.country ?? request.country,
          source_column: row.source_column,
        })),
        email: {
          subject: requesterEmail.subject,
          body_html: requesterEmail.bodyHtml,
          to: routedRequesterRecipients.map(row => row.email),
          to_recipients: routedRequesterRecipients.map(row => ({
            emailAddress: { address: row.email, name: row.name },
          })),
        },
      };

      try {
        const requesterResponse = await postProcureGuardWebhook(webhookUrl, headers, requesterPayload);
        if (!requesterResponse.ok) {
          log.error('webhook.requester.failed', null, {
            requestType: input.requestType,
            requestId: input.requestId,
            status: requesterResponse.status,
            statusText: requesterResponse.statusText,
          });
        }
        // The success case is deliberately not logged: this runs on every status change.
      } catch (err) {
        // Isolated so a requester-side failure never blocks the approver notification below.
        log.error('webhook.requester.failed', err, {
          requestType: input.requestType,
          requestId: input.requestId,
          reason: procureGuardWebhookErrorMessage(err),
        });
      }
    }

    const recipientApprovalStatus = getRecipientApprovalStatus(input.requestType, request);
    if (!recipientApprovalStatus) return;

    if (!actions.requiredPermission) return;

    const baseRecipients = await getProcureGuardNotificationRecipients({
      requestType: input.requestType,
      country: request.country,
      approvalStatus: recipientApprovalStatus,
      ownerLabel: actions.ownerLabel,
    });
    // Include each approver's active delegate(s) so a delegate also gets the approval email
    // (matches the reminder job). Deduped by email.
    const delegatesByDelegator = await getActiveDelegatesByDelegator();
    const recipients = withDelegateRecipients(baseRecipients, delegatesByDelegator);
    const approverTestRecipients = emailTestRecipientsOf(request, input.actor.email, actions.ownerLabel);
    const routedRecipients = isEmailTestMode
      ? approverTestRecipients.map(row => ({
          display_name: row.name,
          email: row.email,
          notification_role: row.role,
          approval_status: row.approval_status,
          country: request.country || '',
          source_column: row.source_column,
        }))
      : recipients;

    if (recipients.length === 0) {
      log.warn('webhook.noRecipients', {
        requestType: input.requestType,
        requestId: input.requestId,
        country: request.country,
        approvalStatus: recipientApprovalStatus,
        ownerLabel: actions.ownerLabel,
      });
    }

    const email = buildProcureGuardNotificationEmail({
      event: input.event,
      requestType: input.requestType,
      request,
      detailUrl,
      ownerLabel: actions.ownerLabel,
      nextStatus: actions.nextStatus,
      actor: input.actor,
      previousStatus: input.previousStatus,
      comment: input.comment,
    });

    const payload = {
      event: input.event,
      source: 'procureguard-local',
      test_mode: isEmailTestMode,
      occurred_at: new Date().toISOString(),
      request_type: input.requestType,
      request: requestPayload,
      workflow: {
        owner_role: actions.ownerLabel,
        test_role: actions.ownerLabel,
        required_permission: actions.requiredPermission,
        decision_status: recipientApprovalStatus,
        next_status: actions.nextStatus,
      },
      actor: actorPayload,
      comment: input.comment ?? null,
      intended_recipients: recipients.map(row => ({
        name: row.display_name,
        email: row.email,
        role: row.notification_role,
        approval_status: row.approval_status,
        country: row.country,
        source_column: row.source_column,
      })),
      recipients: routedRecipients.map(row => ({
        name: row.display_name,
        email: row.email,
        role: row.notification_role,
        approval_status: row.approval_status,
        country: row.country,
        source_column: row.source_column,
      })),
      email: {
        subject: email.subject,
        body_html: email.bodyHtml,
        to: routedRecipients.map(row => row.email),
        to_recipients: routedRecipients.map(row => ({
          emailAddress: { address: row.email, name: row.display_name },
        })),
      },
    };

    const response = await postProcureGuardWebhook(webhookUrl, headers, payload);

    if (!response.ok) {
      log.error('webhook.failed', null, {
        requestType: input.requestType,
        requestId: input.requestId,
        recipientCount: recipients.length,
        status: response.status,
        statusText: response.statusText,
      });
    }
    // The success case is deliberately not logged: this is the hot path of every status change.
  } catch (err) {
    log.error('webhook.failed', err, {
      requestType: input.requestType,
      requestId: input.requestId,
      reason: procureGuardWebhookErrorMessage(err),
    });
  }
}
