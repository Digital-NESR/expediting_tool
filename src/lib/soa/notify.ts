import { logger } from '@/lib/logger';
import { buildConsolidatedWorkbook, consolidatedFileName } from './consolidated';
import { handoffNoticeEmail } from './email-template';
import type { MailAttachment } from './mail';

/**
 * Tell the administrators when somebody asks for SOA access.
 *
 * Without this a request lands in `soa_access_requests` and nothing happens until an admin
 * happens to open /admin/soa and notice the badge. During a soft test that reads as the tool
 * being broken, somebody asks, waits, and concludes nobody is there.
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
  countryId: string;
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

  /* The consolidated file rides along, because this message is the handover and that file is what
     is being handed over. AP would otherwise be told a country is ready and left to go and fetch
     the thing they were told about.

     Built here rather than stored, so it is the file as it stands at the moment of closing, and
     allowed to fail on its own: the close is already committed, and a notice that arrives without
     its attachment is better than no notice at all. The body says which of the two happened. */
  let attachments: MailAttachment[] = [];
  let attachmentName: string | null = null;
  try {
    const { file } = await buildConsolidatedWorkbook(input.countryId);
    attachmentName = consolidatedFileName(input.countryId, input.cycleLabel);
    attachments = [
      {
        fileName: attachmentName,
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        contentBase64: file.toString('base64'),
      },
    ];
  } catch (err) {
    log.warn('handoff.consolidatedUnavailable', {
      countryId: input.countryId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const rows: [string, string][] = [
    ['Country', input.countryName],
    ['Cycle', input.cycleLabel],
    ['Vendors in scope', String(input.vendors)],
    ['Statements received', String(input.statementsReceived)],
    ['Coverage', `${input.coveragePct}%`],
    ['Closed by', input.closedBy],
  ];

  const bodyHtml = handoffNoticeEmail({
    countryName: input.countryName,
    cycleLabel: input.cycleLabel,
    vendors: input.vendors,
    statementsReceived: input.statementsReceived,
    coveragePct: input.coveragePct,
    closedBy: input.closedBy,
    portalUrl: input.portalUrl,
    attachmentName,
  });

  try {
    const { sendMail } = await import('./mail');
    await sendMail({
      kind: 'soa.handoff',
      to: input.apEmails,
      cc: input.championEmails,
      subject: `SOA ${input.cycleLabel} closed, ${input.countryName}`,
      bodyHtml,
      bodyText: rows.map(([k, v]) => `${k}: ${v}`).join('\n'),
      attachments,
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
