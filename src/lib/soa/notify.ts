import { logger } from '@/lib/logger';
import { platformAdminEmails } from '@/lib/require-access';

/**
 * Tell the administrators when somebody asks for SOA access.
 *
 * Without this a request lands in `soa_access_requests` and nothing happens until an admin
 * happens to open /admin/soa and notice the badge. During a soft test that reads as the tool
 * being broken — somebody asks, waits, and concludes nobody is there.
 *
 * Reuses `N8N_ACCESS_NOTIFICATION_WEBHOOK_URL`, the same workflow the platform access request
 * already posts to, and the same Microsoft Graph sendMail payload shape it expects. A second
 * webhook for a second kind of request would be a second thing to configure and a second thing to
 * forget.
 *
 * Best-effort throughout: a request that was written but not announced is a delay, while a request
 * refused because a webhook was down is lost work. The write has already happened by the time this
 * is called, and nothing here is allowed to undo that.
 */

const log = logger('soa-notify');

const ROLE_LABEL: Record<string, string> = {
  champion: 'SC SOA Champion',
  ap: 'Accounts Payable',
  viewer: 'Read-only Viewer',
};

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export async function notifySoaAccessRequest(input: {
  name: string;
  email: string;
  role: string;
  /** The country they asked for, or null meaning every country. */
  countryName: string | null;
  reason: string | null;
}): Promise<void> {
  const webhookUrl = process.env.N8N_ACCESS_NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return;

  const admins = platformAdminEmails();
  if (!admins.length) return;

  const scope = input.countryName ?? 'All countries';
  const role = ROLE_LABEL[input.role] ?? input.role;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  const row = (label: string, value: string) =>
    `<tr style="border-bottom:1px solid #e5e7eb;">
       <td style="padding:10px;font-weight:600;color:#374151;width:150px;">${esc(label)}</td>
       <td style="padding:10px;color:#1f2937;">${esc(value)}</td>
     </tr>`;

  const body = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;">
      <div style="border-bottom:3px solid #2a7e4f;padding-bottom:16px;margin-bottom:24px;">
        <span style="font-size:18px;font-weight:700;color:#2a7e4f;">NESR SC Agents</span>
        <span style="font-size:12px;color:#6b7280;margin-left:8px;">SOA Consolidation</span>
      </div>
      <h2 style="color:#1f2937;margin-bottom:8px;">SOA access requested</h2>
      <p style="color:#6b7280;margin-bottom:24px;">
        Approving as a Champion lets this person scope their country and chase its vendors.
        A Viewer can read progress and the evidence trail and change nothing.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
        ${row('Name', input.name)}
        ${row('Email', input.email)}
        ${row('Requested role', role)}
        ${row('Country', scope)}
        ${input.reason ? row('Reason', input.reason) : ''}
      </table>
      ${
        appUrl
          ? `<div style="margin-bottom:24px;">
               <a href="${esc(appUrl)}/admin/soa/access-approvals"
                  style="background:#2a7e4f;color:#ffffff;padding:11px 20px;border-radius:6px;
                         text-decoration:none;font-weight:600;font-size:15px;">Review request →</a>
             </div>`
          : ''
      }
      <div style="border-top:1px solid #e5e7eb;padding-top:16px;font-size:12px;color:#9ca3af;">
        Automated notification from NESR SC Agents.
      </div>
    </div>`;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: `SOA Consolidation — access requested: ${input.name}`,
          body: { contentType: 'HTML', content: body },
          toRecipients: admins.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      log.warn('accessRequest.notifyRejected', {
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (err) {
    log.warn('accessRequest.notifyFailed', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Tell Accounts Payable that a country's cycle has been closed.
 *
 * The tool promises this on the AP waiting screen -- "you will be emailed when they do" -- so it
 * is the one piece of the handoff that is visible from outside. It goes through the same single
 * mail webhook as everything else the tool sends.
 *
 * Best-effort, and deliberately so. The close is already committed by the time this is called: a
 * cycle that was closed but not announced is a delay somebody can fix by looking at the portal,
 * while a close refused because a webhook was down is work that has to be done again. Returns
 * whether the notice went, so the champion is told which of the two happened rather than being
 * left to assume.
 */
export async function notifySoaHandoff(input: {
  countryName: string;
  cycleLabel: string;
  apEmails: string[];
  championEmails: string[];
  closedBy: string;
  vendors: number;
  statementsReceived: number;
  coveragePct: number;
  portalUrl: string | null;
}): Promise<boolean> {
  if (!input.apEmails.length) {
    log.warn('handoff.noApContacts', { countryName: input.countryName });
    return false;
  }

  const rows: [string, string][] = [
    ['Country', input.countryName],
    ['Cycle', input.cycleLabel],
    ['Vendors in scope', String(input.vendors)],
    ['Statements received', String(input.statementsReceived)],
    ['Coverage', `${input.coveragePct}%`],
    ['Closed by', input.closedBy],
  ];

  const bodyHtml = [
    `<p>The Statement of Account cycle for <strong>${esc(input.countryName)}</strong> has been closed and is ready for your review.</p>`,
    '<table cellpadding="4" style="border-collapse:collapse">',
    ...rows.map(
      ([k, v]) =>
        `<tr><td style="color:#58595B">${esc(k)}</td><td><strong>${esc(v)}</strong></td></tr>`,
    ),
    '</table>',
    input.portalUrl
      ? `<p>Open it in the portal: <a href="${esc(input.portalUrl)}">${esc(input.portalUrl)}</a></p>`
      : '<p>Open SOA Consolidation in the SC Agents portal to review it.</p>',
    '<p>You can see every statement returned, the invoice lines read from each one, and the full evidence trail.</p>',
  ].join('');

  try {
    const { sendMail } = await import('./mail');
    await sendMail({
      kind: 'soa.handoff',
      to: input.apEmails,
      cc: input.championEmails,
      subject: `SOA ${input.cycleLabel} closed — ${input.countryName}`,
      bodyHtml,
      bodyText: rows.map(([k, v]) => k + ": " + v).join('\n'),
      attachments: [],
      meta: { countryName: input.countryName, cycleLabel: input.cycleLabel },
    });
    return true;
  } catch (err) {
    log.warn('handoff.notifyFailed', {
      countryName: input.countryName,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}
