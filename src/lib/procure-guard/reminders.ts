/**
 * ProcureGuard 7-day / 2-week "still awaiting your approval" reminder job.
 *
 * Deliberately a plain module, NOT a server action: every export of a `'use server'` file is a
 * public POST endpoint, so exporting this from `src/app/actions/procureGuard.ts` let any signed-in
 * user trigger a mass email send, bypassing the CRON_SECRET check on the route. Only
 * `src/app/api/procure-guard/reminders/route.ts` (which enforces that secret) calls it.
 */

import type { QueryResultRow } from 'pg';
import {
  formatProcureGuardStatusLabel,
  getPermissionProfile,
  getProcureGuardAvailableActions,
  isActiveApprovalStatus,
  procureGuardThreshold,
  toUsd,
} from '@/lib/procureGuard-utils';
import type { ProcureGuardRequestType } from '@/types/procureGuard';
import {
  ensureProcureGuardPaymentRequestColumns,
  escapeHtml,
  exec,
  formatWebhookAmount,
  getActiveDelegatesByDelegator,
  getProcureGuardNotificationRecipients,
  getRecipientApprovalStatus,
  getRequestDetailUrl,
  postProcureGuardWebhook,
  procureGuardRefRowsHtml,
  procureGuardWebhookErrorMessage,
  serialise,
  sql,
  type ProcureGuardWebhookRequest,
} from './internals';

function buildProcureGuardReminderEmail(input: {
  requestType: ProcureGuardRequestType;
  request: ProcureGuardWebhookRequest;
  detailUrl: string;
  ownerLabel: string;
  ageLabel: string;
  ageDays: number;
}) {
  const typeLabel = input.requestType === 'adhoc' ? 'Adhoc PO' : 'Advance Payment';
  const accent = '#b45309';
  const subject = `ProcureGuard reminder: ${input.request.reference_number} has been awaiting ${input.ownerLabel} for ${input.ageLabel}`;
  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:${accent};">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Pending approval reminder</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(input.request.reference_number)} is still waiting for your review</h2>
      <p style="margin:0 0 22px 0;color:#4b5563;">This ${escapeHtml(typeLabel)} request has been awaiting <strong>${escapeHtml(input.ownerLabel)}</strong> action for <strong>${escapeHtml(input.ageLabel)}</strong> (${Math.floor(input.ageDays)} days). Please review it or delegate your approval.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        ${procureGuardRefRowsHtml(input.request)}
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;width:170px;">Vendor</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.vendor_name)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Amount</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatWebhookAmount(input.request.amount, input.request.currency))}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Country</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.country || 'Unspecified')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Current stage</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatProcureGuardStatusLabel(input.request.status))}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Requester</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.requested_by_name || input.request.requested_by_email)}</td></tr>
      </table>
      <div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(input.detailUrl)}" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;">Review request</a>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">Automated reminder from the ProcureGuard workflow. You are receiving this because this request is awaiting your approval step.</div>
    </div>
  `;
  return { subject, bodyHtml };
}

const REMINDER_MILESTONES = [
  { days: 14, column: 'reminder_14d_sent_at', label: '2 weeks' },
  { days: 7, column: 'reminder_7d_sent_at', label: '7 days' },
] as const;

// Emails the current approver(s) (and their active delegates) for requests that have been sitting
// in the same stage for 7 days and again at 2 weeks. Idempotent per milestone via the
// reminder_*_sent_at columns (which reset whenever the request moves to a new stage), so it is safe
// to run daily. Intended to be triggered by a scheduled job (see /api/procure-guard/reminders).
export async function sendProcureGuardOpenRequestReminders(): Promise<{ checked: number; sent: number; skipped: number; errors: number }> {
  const summary = { checked: 0, sent: 0, skipped: 0, errors: 0 };
  const webhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn('[ProcureGuard reminders] N8N_PROCUREGUARD_WEBHOOK_URL not configured; skipping.');
    return summary;
  }
  await ensureProcureGuardPaymentRequestColumns();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
  if (secret) headers['x-procureguard-secret'] = secret;

  // Active delegates keyed by delegator email, so a delegate also gets nudged.
  const delegatesByDelegator = await getActiveDelegatesByDelegator();

  const adminPermissions = getPermissionProfile('Admin');
  const tables: Array<{ table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments'; requestType: ProcureGuardRequestType }> = [
    { table: 'procure_guard_adhoc_payments', requestType: 'adhoc' },
    { table: 'procure_guard_advance_payments', requestType: 'advance' },
  ];

  for (const { table, requestType } of tables) {
    let rows: QueryResultRow[] = [];
    try {
      // "Open since" the current stage began: last approval (reviewed_at) or, for never-actioned
      // submissions, creation. Immune to unrelated row updates (viewer/attachment changes).
      rows = await sql<QueryResultRow[]>(`SELECT * FROM ${table} WHERE COALESCE(reviewed_at, created_at) <= NOW() - INTERVAL '7 days' ORDER BY COALESCE(reviewed_at, created_at) ASC`);
    } catch (err) {
      console.error('[ProcureGuard reminders] query failed', table, err);
      summary.errors += 1;
      continue;
    }

    for (const raw of rows) {
      const request = serialise<ProcureGuardWebhookRequest>(raw);
      if (!isActiveApprovalStatus(request.status)) continue;
      summary.checked += 1;

      const openedAt = new Date((raw.reviewed_at as string) ?? (raw.created_at as string));
      const ageDays = (Date.now() - openedAt.getTime()) / 86_400_000;
      const milestone = REMINDER_MILESTONES.find(m => ageDays >= m.days && !raw[m.column]);
      if (!milestone) continue;

      const { amount: thresholdAmount, currency: thresholdCurrency } = procureGuardThreshold(request);
      const approvalStatus = getRecipientApprovalStatus(requestType, request);
      const actions = getProcureGuardAvailableActions(adminPermissions, requestType, request.status, thresholdAmount, thresholdCurrency);
      if (!approvalStatus || !actions.requiredPermission) { summary.skipped += 1; continue; }

      const recipients = await getProcureGuardNotificationRecipients({
        requestType,
        country: request.country,
        approvalStatus,
        ownerLabel: actions.ownerLabel,
      });
      const delegateRecipients = recipients.flatMap(r =>
        (delegatesByDelegator[r.email.trim().toLowerCase()] ?? []).map(d => ({
          display_name: d.delegate_name || d.delegate_email,
          email: d.delegate_email,
          notification_role: `Delegate of ${r.display_name || r.email}`,
          approval_status: r.approval_status,
          country: r.country,
          source_column: 'delegation',
        })),
      );
      const seen = new Set<string>();
      const allRecipients = [...recipients, ...delegateRecipients].filter(r => {
        const key = r.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (allRecipients.length === 0) { summary.skipped += 1; continue; }

      const detailUrl = getRequestDetailUrl(requestType, request.id);
      const email = buildProcureGuardReminderEmail({ requestType, request, detailUrl, ownerLabel: actions.ownerLabel, ageLabel: milestone.label, ageDays });
      const payload = {
        event: 'request.reminder',
        source: 'procureguard-local',
        occurred_at: new Date().toISOString(),
        request_type: requestType,
        reminder: { milestone_days: milestone.days, milestone_label: milestone.label, days_open: Math.floor(ageDays) },
        request: {
          id: request.id,
          reference_number: request.reference_number,
          status: request.status,
          vendor_name: request.vendor_name,
          amount: request.amount,
          currency: request.currency,
          amount_usd: toUsd(thresholdAmount, thresholdCurrency),
          country: request.country,
          requested_by_name: request.requested_by_name,
          requested_by_email: request.requested_by_email,
          created_at: request.created_at,
          updated_at: request.updated_at,
          detail_url: detailUrl,
        },
        workflow: { owner_role: actions.ownerLabel, required_permission: actions.requiredPermission, decision_status: approvalStatus, next_status: actions.nextStatus },
        recipients: allRecipients.map(r => ({ name: r.display_name, email: r.email, role: r.notification_role, approval_status: r.approval_status, country: r.country, source_column: r.source_column })),
        email: {
          subject: email.subject,
          body_html: email.bodyHtml,
          to: allRecipients.map(r => r.email),
          to_recipients: allRecipients.map(r => ({ emailAddress: { address: r.email, name: r.display_name } })),
        },
      };

      try {
        const response = await postProcureGuardWebhook(webhookUrl, headers, payload);
        if (!response.ok) { console.error('[ProcureGuard reminders] webhook failed', response.status, response.statusText); summary.errors += 1; continue; }
        summary.sent += 1;
      } catch (err) {
        console.error('[ProcureGuard reminders] webhook failed', procureGuardWebhookErrorMessage(err), err);
        summary.errors += 1;
        continue;
      }

      // Mark this milestone sent. When firing the 14-day one, also stamp the 7-day column so a
      // late 7-day reminder can never fire afterwards.
      const setCols = milestone.days >= 14
        ? 'reminder_14d_sent_at = CURRENT_TIMESTAMP, reminder_7d_sent_at = COALESCE(reminder_7d_sent_at, CURRENT_TIMESTAMP)'
        : 'reminder_7d_sent_at = CURRENT_TIMESTAMP';
      try {
        await exec(`UPDATE ${table} SET ${setCols} WHERE id = ?`, [request.id]);
      } catch (err) {
        console.error('[ProcureGuard reminders] failed to mark reminder sent', table, request.id, err);
      }
    }
  }

  return summary;
}
