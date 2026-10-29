import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dedupeByEmail } from '@/lib/procure-guard/notifications';
import { APPROVAL_ACTIVE_STATUSES } from '@/lib/procureGuard-utils';

/**
 * The SAP Team on the final-approval email.
 *
 * A fully approved adhoc request used to notify only the requester and their CC list. Not an
 * oversight in the data: `getRecipientApprovalStatus` returns null for any status outside
 * `APPROVAL_ACTIVE_STATUSES`, and `Approved` is outside it, so the approver-side dispatch
 * returns before it looks up a single recipient. The SAP Team is therefore added to the
 * REQUESTER-side email rather than through the approver path, which never runs here.
 *
 * The test below pins that reason, because the day `Approved` is added to
 * `APPROVAL_ACTIVE_STATUSES` the approver path starts firing too and the team would be emailed
 * twice.
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const NOTIFICATIONS = 'src/lib/procure-guard/notifications.ts';

describe('dedupeByEmail', () => {
  it('keeps the first spelling of an address and drops the rest', () => {
    /* The case this exists for: somebody on the SAP team who also raised the request. Two rows
       for one address is two copies of the same email. */
    const rows = dedupeByEmail([
      { email: 'rana@nesr.com', role: 'Requester' },
      { email: 'other@nesr.com', role: 'Requester notification' },
      { email: 'RANA@nesr.com', role: 'SAP Team' },
    ]);
    expect(rows.map((r) => r.email)).toEqual(['rana@nesr.com', 'other@nesr.com']);
    expect(rows[0].role).toBe('Requester');
  });

  it('ignores padding and case when comparing', () => {
    expect(dedupeByEmail([{ email: ' A@b.com ' }, { email: 'a@b.com' }])).toHaveLength(1);
  });

  it('drops a blank address rather than treating it as a recipient', () => {
    expect(dedupeByEmail([{ email: '' }, { email: '   ' }, { email: 'a@b.com' }])).toEqual([
      { email: 'a@b.com' },
    ]);
  });

  it('leaves a list with nothing to remove exactly as it was', () => {
    const rows = [{ email: 'a@b.com' }, { email: 'c@d.com' }];
    expect(dedupeByEmail(rows)).toEqual(rows);
  });
});

describe('who joins the final-approval email', () => {
  const src = read(NOTIFICATIONS);
  const block = src.slice(
    src.indexOf('const sapTeamOnFinalApproval'),
    src.indexOf('const requesterSideRecipients'),
  );

  it('only on adhoc, and only at Approved', () => {
    /* Advance requests have no SAP step, and adding the team at an intermediate status would
       email them about a request that is still moving. */
    expect(block).toContain("input.requestType === 'adhoc'");
    expect(block).toContain("request.status === 'Approved'");
  });

  it('reads the team from the recipient directory, not from a list in code', () => {
    /* So the team is whoever the Approval Access matrix currently says it is. */
    expect(block).toContain('getProcureGuardNotificationRecipients');
    expect(block).toContain("approvalStatus: 'Approved by SCM'");
    expect(block).toContain("ownerLabel: 'SAP Team'");
  });

  it('narrows to the SAP Team role, not merely to that step"s status', () => {
    /* The lookup also matches anyone else filed against the same status in the same country.
       That is the SAP team today and need not stay so. */
    expect(block).toContain("=== 'sap team'");
  });

  it('is copied on the requester email, not addressed by it and not sent a second one', () => {
    /* They want to know the outcome, not to be asked for anything -- which is what CC says
       and TO does not. */
    const cc = src.slice(
      src.indexOf('const requesterCcRecipients'),
      src.indexOf('const requesterSideRecipients'),
    );
    expect(cc).toContain('sapTeamOnFinalApproval');
    expect(cc).toContain('dedupeByEmail');
  });

  it('leaves somebody off CC when they are already on TO', () => {
    /* A SAP team member who raised the request themselves should appear once. */
    const cc = src.slice(
      src.indexOf('const toAddresses'),
      src.indexOf('const requesterSideRecipients'),
    );
    expect(cc).toContain('!toAddresses.has(row.email)');
  });

  it('counts both lines as the intended recipients', () => {
    /* `intended_recipients` answers "who was told". Listing only TO would answer wrongly. */
    const intended = src.slice(src.indexOf('const requesterSideRecipients'));
    expect(intended.slice(0, 160)).toContain('...requesterToRecipients');
    expect(intended.slice(0, 160)).toContain('...requesterCcRecipients');
  });

  it('sends the CC line to the webhook in both shapes', () => {
    /* The n8n workflow has only ever read `to` / `to_recipients`; these are the fields it now
       needs to map, and they are always present so it never has to test for the key. */
    const payload = src.slice(src.indexOf('subject: requesterEmail.subject'));
    expect(payload.slice(0, 900)).toContain('cc: routedCcRecipients.map');
    expect(payload.slice(0, 900)).toContain('cc_recipients: routedCcRecipients.map');
  });

  it('empties the CC line in email test mode', () => {
    /* A test send puts everything on TO to the test addresses. Copying the real SAP team on it
       would be the one way a test reaches somebody it was never meant to. */
    const routed = src.slice(
      src.indexOf('const routedRequesterRecipients'),
      src.indexOf('const requesterPayload'),
    );
    expect(routed).toContain('isEmailTestMode');
    expect(routed).toContain('routedCcRecipients = isEmailTestMode ? []');
  });

  it('keeps the TO line as the requester and their notification list', () => {
    const to = src.slice(
      src.indexOf('const requesterToRecipients'),
      src.indexOf('const toAddresses'),
    );
    expect(to).toContain('requested_by_email');
    expect(to).toContain('requesterNotificationEmailsOf');
    expect(to, 'the SAP team should no longer be on TO').not.toContain('sapTeamOnFinalApproval');
  });
});

describe('the reason this sits on the requester side', () => {
  it('Approved is not an active approval status, so the approver dispatch never runs', () => {
    /* If this ever changes, the approver path starts firing at Approved as well and the SAP
       Team would be emailed twice -- once here, once there. */
    expect(APPROVAL_ACTIVE_STATUSES).not.toContain('Approved');
    expect(APPROVAL_ACTIVE_STATUSES).toContain('Verified by SAP Team');
  });
});
