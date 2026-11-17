/**
 * ProcureGuard 7-day / 2-week "still awaiting your approval" reminder job.
 *
 * Deliberately a plain module, NOT a server action: every export of a `'use server'` file is a
 * public POST endpoint, so exporting this from `src/app/actions/procureGuard.ts` let any signed-in
 * user trigger a mass email send, bypassing the CRON_SECRET check on the route. Only
 * `src/app/api/procure-guard/reminders/route.ts` (which enforces that secret) calls it.
 */

import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import {
  APPROVAL_ACTIVE_STATUSES,
  formatProcureGuardStatusLabel,
  getPermissionProfile,
  getProcureGuardAvailableActions,
  isActiveApprovalStatus,
  procureGuardThreshold,
  toUsd,
} from '@/lib/procureGuard-utils';
import type { ProcureGuardRequestType } from '@/types/procureGuard';
import {
  ensureProcureGuardSchema,
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

const log = logger('procure-guard');

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

/**
 * One email listing everything a single approver is holding up.
 *
 * The reminder used to be built per request, so an approver with ten overdue requests received
 * ten separate emails in the same minute. Measured against the live backlog before this changed:
 * 25 emails to 5 people, 10 of them to one person and 9 to another, every seven days. That is
 * the kind of notification people build an inbox rule to silence, which would have made the
 * feature worse than useless -- it would have buried the genuine ones too.
 *
 * The single-request layout is kept for the common case of one overdue request, because a focused
 * email about one decision reads better than a table with a single row in it.
 */
function buildProcureGuardReminderDigestEmail(input: {
  recipientName: string;
  items: ReminderItem[];
}) {
  const accent = '#b45309';
  const count = input.items.length;
  const oldest = Math.max(...input.items.map((i) => Math.floor(i.ageDays)));
  const subject = `ProcureGuard reminder: ${count} requests awaiting your approval`;

  /* Oldest first: the point of the email is to surface what has been waiting longest, and a
     reader who stops after the first row should have seen the worst one. */
  const rows = [...input.items]
    .sort((a, b) => b.ageDays - a.ageDays)
    .map((item) => {
      const typeLabel = item.requestType === 'adhoc' ? 'Adhoc PO' : 'Advance';
      return `
        <tr>
          <td style="padding:10px 9px;border-bottom:1px solid #e5e7eb;">
            <a href="${escapeHtml(item.detailUrl)}" style="color:#006B0C;font-weight:700;text-decoration:none;">${escapeHtml(item.request.reference_number)}</a>
            <div style="font-size:11px;color:#6b7280;margin-top:2px;">${escapeHtml(typeLabel)} &middot; ${escapeHtml(item.request.country || 'Unspecified')}</div>
          </td>
          <td style="padding:10px 9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.request.vendor_name)}</td>
          <td style="padding:10px 9px;border-bottom:1px solid #e5e7eb;white-space:nowrap;">${escapeHtml(formatWebhookAmount(item.request.amount, item.request.currency))}</td>
          <td style="padding:10px 9px;border-bottom:1px solid #e5e7eb;white-space:nowrap;"><strong>${Math.floor(item.ageDays)}</strong> days</td>
        </tr>`;
    })
    .join('');

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:760px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:${accent};">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Pending approval reminder</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${count} requests are waiting for your review</h2>
      <p style="margin:0 0 22px 0;color:#4b5563;">These are the requests currently sitting at your approval step. The oldest has been waiting <strong>${oldest} days</strong>. Please review them or delegate your approval.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;font-size:14px;">
        <tr style="background:#f9fafb;">
          <th style="padding:9px;text-align:left;border-bottom:2px solid #e5e7eb;">Reference</th>
          <th style="padding:9px;text-align:left;border-bottom:2px solid #e5e7eb;">Vendor</th>
          <th style="padding:9px;text-align:left;border-bottom:2px solid #e5e7eb;">Amount</th>
          <th style="padding:9px;text-align:left;border-bottom:2px solid #e5e7eb;">Waiting</th>
        </tr>
        ${rows}
      </table>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">Automated reminder from the ProcureGuard workflow. You are receiving this because these requests are awaiting your approval step.</div>
    </div>
  `;
  return { subject, bodyHtml };
}

/** A person a reminder is addressed to: a named approver, or someone's active delegate. */
interface ReminderAddressee {
  display_name: string;
  email: string;
  notification_role: string;
  approval_status: string;
  country: string;
  source_column: string;
}

/** One overdue request, with everything needed to render it and to mark it reminded. */
interface ReminderItem {
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments';
  requestType: ProcureGuardRequestType;
  request: ProcureGuardWebhookRequest;
  milestoneDays: number;
  milestoneLabel: string;
  ageDays: number;
  detailUrl: string;
  ownerLabel: string;
  /* As `procureGuardThreshold` returns it, not narrowed: `toUsd` accepts the same union, and
     coercing here would invent a zero for a row whose amount is genuinely absent. */
  thresholdAmount: number | string | null;
  thresholdCurrency: string;
}

const REMINDER_MILESTONES = [
  { days: 14, column: 'reminder_14d_sent_at', label: '2 weeks' },
  { days: 7, column: 'reminder_7d_sent_at', label: '7 days' },
] as const;

// Emails the current approver(s) (and their active delegates) for requests that have been sitting
// in the same stage for 7 days and again at 2 weeks. Idempotent per milestone via the
// reminder_*_sent_at columns (which reset whenever the request moves to a new stage), so it is safe
// to run daily. Intended to be triggered by a scheduled job (see /api/procure-guard/reminders).
export async function sendProcureGuardOpenRequestReminders(): Promise<{
  checked: number;
  sent: number;
  skipped: number;
  errors: number;
  recipients: number;
}> {
  const summary = { checked: 0, sent: 0, skipped: 0, errors: 0, recipients: 0 };
  const webhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    log.warn('reminders.unconfigured', { reason: 'N8N_PROCUREGUARD_WEBHOOK_URL is not set' });
    return summary;
  }
  await ensureProcureGuardSchema();

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
  if (secret) headers['x-procureguard-secret'] = secret;

  // Active delegates keyed by delegator email, so a delegate also gets nudged.
  const delegatesByDelegator = await getActiveDelegatesByDelegator();

  const adminPermissions = getPermissionProfile('Admin');
  const tables: Array<{
    table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments';
    requestType: ProcureGuardRequestType;
  }> = [
    { table: 'procure_guard_adhoc_payments', requestType: 'adhoc' },
    { table: 'procure_guard_advance_payments', requestType: 'advance' },
  ];

  const activeStatusPlaceholders = APPROVAL_ACTIVE_STATUSES.map(() => '?').join(', ');

  /* -- pass one: what is overdue, and who owes each one -----------------------
     Nothing is sent here. Collecting first is what makes one email per person
     possible: an approver's requests are spread across both tables and many
     countries, so they are only knowable once every row has been read. */
  const byRecipient = new Map<string, { recipient: ReminderAddressee; items: ReminderItem[] }>();

  for (const { table, requestType } of tables) {
    let rows: QueryResultRow[] = [];
    try {
      // "Open since" the current stage began: last approval (reviewed_at) or, for never-actioned
      // submissions, creation. Immune to unrelated row updates (viewer/attachment changes).
      // Terminal rows (Approved/Rejected/Cancelled) are filtered in SQL rather than pulled back and
      // dropped by the isActiveApprovalStatus() check below, which used to read the whole table.
      rows = await sql<QueryResultRow[]>(
        `SELECT * FROM ${table}
          WHERE COALESCE(reviewed_at, created_at) <= NOW() - INTERVAL '7 days'
            AND status IN (${activeStatusPlaceholders})
          ORDER BY COALESCE(reviewed_at, created_at) ASC`,
        [...APPROVAL_ACTIVE_STATUSES],
      );
    } catch (err) {
      log.error('reminders.queryFailed', err, { table });
      summary.errors += 1;
      continue;
    }

    for (const raw of rows) {
      const request = serialise<ProcureGuardWebhookRequest>(raw);
      if (!isActiveApprovalStatus(request.status)) continue;
      summary.checked += 1;

      const openedAt = new Date((raw.reviewed_at as string) ?? (raw.created_at as string));
      const ageDays = (Date.now() - openedAt.getTime()) / 86_400_000;
      const milestone = REMINDER_MILESTONES.find((m) => ageDays >= m.days && !raw[m.column]);
      if (!milestone) continue;

      const { amount: thresholdAmount, currency: thresholdCurrency } =
        procureGuardThreshold(request);
      const approvalStatus = getRecipientApprovalStatus(requestType, request);
      const actions = getProcureGuardAvailableActions(
        adminPermissions,
        requestType,
        request.status,
        thresholdAmount,
        thresholdCurrency,
      );
      if (!approvalStatus || !actions.requiredPermission) {
        summary.skipped += 1;
        continue;
      }

      const recipients = await getProcureGuardNotificationRecipients({
        requestType,
        country: request.country,
        approvalStatus,
        ownerLabel: actions.ownerLabel,
      });
      const delegateRecipients = recipients.flatMap((r) =>
        (delegatesByDelegator[r.email.trim().toLowerCase()] ?? []).map((d) => ({
          display_name: d.delegate_name || d.delegate_email,
          email: d.delegate_email,
          notification_role: `Delegate of ${r.display_name || r.email}`,
          approval_status: r.approval_status,
          country: r.country,
          source_column: 'delegation',
        })),
      );
      const seen = new Set<string>();
      const allRecipients = [...recipients, ...delegateRecipients].filter((r) => {
        const key = r.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      if (allRecipients.length === 0) {
        summary.skipped += 1;
        continue;
      }

      const item: ReminderItem = {
        table,
        requestType,
        request,
        milestoneDays: milestone.days,
        milestoneLabel: milestone.label,
        ageDays,
        detailUrl: getRequestDetailUrl(requestType, request.id),
        ownerLabel: actions.ownerLabel,
        thresholdAmount,
        thresholdCurrency,
      };
      for (const r of allRecipients) {
        const key = r.email.trim().toLowerCase();
        const bucket = byRecipient.get(key);
        if (bucket) bucket.items.push(item);
        else byRecipient.set(key, { recipient: r as ReminderAddressee, items: [item] });
      }
    }
  }

  /* -- pass two: one email per person ----------------------------------------
     A request can sit in several people's digests (an approval step with two
     named approvers, or an approver plus their delegate). It is marked reminded
     if ANY of those digests was accepted: the nudge went out. If every one
     failed it stays unmarked and tomorrow's run tries again. */
  const reminded = new Map<string, ReminderItem>();

  for (const { recipient, items } of byRecipient.values()) {
    summary.recipients += 1;

    /* One request reads better as the focused single-request email than as a one-row table. */
    const email =
      items.length === 1
        ? buildProcureGuardReminderEmail({
            requestType: items[0].requestType,
            request: items[0].request,
            detailUrl: items[0].detailUrl,
            ownerLabel: items[0].ownerLabel,
            ageLabel: items[0].milestoneLabel,
            ageDays: items[0].ageDays,
          })
        : buildProcureGuardReminderDigestEmail({
            recipientName: recipient.display_name || recipient.email,
            items,
          });

    const payload = {
      event: 'request.reminder',
      source: 'procureguard-local',
      occurred_at: new Date().toISOString(),
      /* The digest spans both request types, so the top-level type describes the batch only when
         it is unambiguous. Per-request detail lives in `reminder.requests`. */
      request_type: items.every((i) => i.requestType === items[0].requestType)
        ? items[0].requestType
        : 'mixed',
      reminder: {
        request_count: items.length,
        oldest_days_open: Math.max(...items.map((i) => Math.floor(i.ageDays))),
        requests: items.map((i) => ({
          id: i.request.id,
          reference_number: i.request.reference_number,
          request_type: i.requestType,
          status: i.request.status,
          vendor_name: i.request.vendor_name,
          amount: i.request.amount,
          currency: i.request.currency,
          amount_usd: toUsd(i.thresholdAmount, i.thresholdCurrency),
          country: i.request.country,
          days_open: Math.floor(i.ageDays),
          milestone_days: i.milestoneDays,
          owner_role: i.ownerLabel,
          detail_url: i.detailUrl,
        })),
      },
      recipients: [
        {
          name: recipient.display_name,
          email: recipient.email,
          role: recipient.notification_role,
          approval_status: recipient.approval_status,
          country: recipient.country,
          source_column: recipient.source_column,
        },
      ],
      email: {
        subject: email.subject,
        body_html: email.bodyHtml,
        to: [recipient.email],
        to_recipients: [
          { emailAddress: { address: recipient.email, name: recipient.display_name } },
        ],
      },
    };

    try {
      const response = await postProcureGuardWebhook(webhookUrl, headers, payload);
      if (!response.ok) {
        log.error('reminders.webhookFailed', null, {
          recipient: recipient.email,
          requestCount: items.length,
          status: response.status,
          statusText: response.statusText,
        });
        summary.errors += 1;
        continue;
      }
      summary.sent += 1;
    } catch (err) {
      log.error('reminders.webhookFailed', err, {
        recipient: recipient.email,
        requestCount: items.length,
        reason: procureGuardWebhookErrorMessage(err),
      });
      summary.errors += 1;
      continue;
    }

    for (const item of items) reminded.set(`${item.table}:${item.request.id}`, item);
  }

  /* -- mark what was actually reminded ----------------------------------------
     After sending, and only for requests whose nudge reached someone. When
     firing the 14-day milestone, also stamp the 7-day column so a late 7-day
     reminder can never fire afterwards. */
  for (const item of reminded.values()) {
    const setCols =
      item.milestoneDays >= 14
        ? 'reminder_14d_sent_at = CURRENT_TIMESTAMP, reminder_7d_sent_at = COALESCE(reminder_7d_sent_at, CURRENT_TIMESTAMP)'
        : 'reminder_7d_sent_at = CURRENT_TIMESTAMP';
    try {
      await exec(`UPDATE ${item.table} SET ${setCols} WHERE id = ?`, [item.request.id]);
    } catch (err) {
      log.error('reminders.markSentFailed', err, {
        table: item.table,
        requestId: item.request.id,
      });
    }
  }

  return summary;
}
