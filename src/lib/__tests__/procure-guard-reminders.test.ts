import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The reminder used to build and post one email PER REQUEST, so an approver holding ten overdue
 * requests got ten emails in the same minute. Measured against the live backlog the day this
 * changed: 25 emails to 5 people, 10 to one person and 9 to another, repeating every 7 days.
 * These tests pin the property that fixes it — one email per person, whatever they are holding.
 */

const sql = vi.fn();
const exec = vi.fn();
const postProcureGuardWebhook = vi.fn();
const getProcureGuardNotificationRecipients = vi.fn();
const getActiveDelegatesByDelegator = vi.fn();

vi.mock('@/lib/procure-guard/internals', () => ({
  sql: (...a: unknown[]) => sql(...a),
  exec: (...a: unknown[]) => exec(...a),
  ensureProcureGuardSchema: vi.fn().mockResolvedValue(undefined),
  getActiveDelegatesByDelegator: () => getActiveDelegatesByDelegator(),
  getProcureGuardNotificationRecipients: (...a: unknown[]) =>
    getProcureGuardNotificationRecipients(...a),
  postProcureGuardWebhook: (...a: unknown[]) => postProcureGuardWebhook(...a),
  getRequestDetailUrl: (t: string, id: number) => `https://example.test/${t}/${id}`,
  getRecipientApprovalStatus: () => 'Under Review',
  serialise: <T>(row: T) => row,
  escapeHtml: (s: string) => String(s ?? ''),
  formatWebhookAmount: (a: unknown, c: unknown) => `${c} ${a}`,
  procureGuardRefRowsHtml: () => '',
  procureGuardWebhookErrorMessage: (e: unknown) => String(e),
}));

import { sendProcureGuardOpenRequestReminders } from '@/lib/procure-guard/reminders';

/** A row as the reminder query returns it, old enough to be overdue and never reminded. */
function overdueRow(id: number, ref: string, daysOld: number) {
  return {
    id,
    reference_number: ref,
    status: 'Submitted',
    vendor_name: `Vendor ${id}`,
    amount: '1000.00',
    currency: 'USD',
    country: 'Oman',
    requested_by_name: 'A Requester',
    requested_by_email: 'req@nesr.com',
    created_at: new Date(Date.now() - daysOld * 86_400_000).toISOString(),
    reviewed_at: null,
    reminder_7d_sent_at: null,
    reminder_14d_sent_at: null,
  };
}

const approver = (email: string, name: string) => ({
  display_name: name,
  email,
  notification_role: 'Country Controller',
  approval_status: 'Under Review',
  country: 'Oman',
  source_column: 'Country Controller',
});

/** The payload of the Nth webhook call. */
const payloadOf = (n: number) => postProcureGuardWebhook.mock.calls[n][2];

describe('sendProcureGuardOpenRequestReminders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.N8N_PROCUREGUARD_WEBHOOK_URL = 'https://n8n.test/hook';
    exec.mockResolvedValue({});
    getActiveDelegatesByDelegator.mockResolvedValue({});
    postProcureGuardWebhook.mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
    // Adhoc table first (the module queries adhoc then advance), then advance.
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
  });

  it('sends ONE email to an approver holding several requests', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([]) // adhoc
      .mockResolvedValueOnce([
        overdueRow(1, 'ADV-000001', 30),
        overdueRow(2, 'ADV-000002', 20),
        overdueRow(3, 'ADV-000003', 10),
      ]);
    getProcureGuardNotificationRecipients.mockResolvedValue([
      approver('merghani@nesr.com', 'Mohamed Merghani'),
    ]);

    const result = await sendProcureGuardOpenRequestReminders();

    expect(postProcureGuardWebhook).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1);
    expect(result.recipients).toBe(1);
    expect(result.checked).toBe(3);

    const payload = payloadOf(0);
    expect(payload.email.to).toEqual(['merghani@nesr.com']);
    expect(payload.reminder.request_count).toBe(3);
    expect(
      payload.reminder.requests.map((r: { reference_number: string }) => r.reference_number),
    ).toEqual(['ADV-000001', 'ADV-000002', 'ADV-000003']);
  });

  it('splits by person, so two approvers get one email each and not one of everything', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([overdueRow(1, 'ADV-1', 30), overdueRow(2, 'ADV-2', 30)]);
    getProcureGuardNotificationRecipients
      .mockResolvedValueOnce([approver('a@nesr.com', 'A Person')])
      .mockResolvedValueOnce([approver('b@nesr.com', 'B Person')]);

    const result = await sendProcureGuardOpenRequestReminders();

    expect(postProcureGuardWebhook).toHaveBeenCalledTimes(2);
    expect(result.recipients).toBe(2);
    const recipients = [payloadOf(0).email.to[0], payloadOf(1).email.to[0]].sort();
    expect(recipients).toEqual(['a@nesr.com', 'b@nesr.com']);
    expect(payloadOf(0).reminder.request_count).toBe(1);
    expect(payloadOf(1).reminder.request_count).toBe(1);
  });

  it('gives one request the focused single-request email, not a one-row table', async () => {
    sql.mockReset();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([overdueRow(1, 'ADV-000009', 9)]);
    getProcureGuardNotificationRecipients.mockResolvedValue([approver('a@nesr.com', 'A Person')]);

    await sendProcureGuardOpenRequestReminders();

    expect(payloadOf(0).email.subject).toContain('ADV-000009');
    expect(payloadOf(0).email.subject).not.toContain('requests awaiting');
  });

  it('titles a digest by how many are waiting, oldest first in the table', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([overdueRow(1, 'NEWER', 8), overdueRow(2, 'OLDER', 40)]);
    getProcureGuardNotificationRecipients.mockResolvedValue([approver('a@nesr.com', 'A Person')]);

    await sendProcureGuardOpenRequestReminders();

    const { subject, body_html } = payloadOf(0).email;
    expect(subject).toBe('ProcureGuard reminder: 2 requests awaiting your approval');
    // The worst one is what a reader who stops after one row should see.
    expect(body_html.indexOf('OLDER')).toBeLessThan(body_html.indexOf('NEWER'));
    expect(payloadOf(0).reminder.oldest_days_open).toBe(40);
  });

  it('marks every request in a delivered digest, once each', async () => {
    sql.mockReset();
    sql
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([overdueRow(1, 'A', 30), overdueRow(2, 'B', 8)]);
    getProcureGuardNotificationRecipients.mockResolvedValue([approver('a@nesr.com', 'A Person')]);

    await sendProcureGuardOpenRequestReminders();

    expect(exec).toHaveBeenCalledTimes(2);
    // Past 14 days stamps both columns so a late 7-day reminder can never follow.
    expect(exec.mock.calls[0][0]).toContain('reminder_14d_sent_at');
    expect(exec.mock.calls[1][0]).toContain('reminder_7d_sent_at');
    expect(exec.mock.calls[1][0]).not.toContain('reminder_14d_sent_at');
  });

  it('marks nothing when the send fails, so tomorrow retries', async () => {
    sql.mockReset();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([overdueRow(1, 'A', 30)]);
    getProcureGuardNotificationRecipients.mockResolvedValue([approver('a@nesr.com', 'A Person')]);
    postProcureGuardWebhook.mockResolvedValue({ ok: false, status: 500, statusText: 'nope' });

    const result = await sendProcureGuardOpenRequestReminders();

    expect(result.errors).toBe(1);
    expect(result.sent).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });

  it('marks a request once even when it appears in two people’s digests', async () => {
    sql.mockReset();
    sql.mockResolvedValueOnce([]).mockResolvedValueOnce([overdueRow(1, 'SHARED', 30)]);
    getProcureGuardNotificationRecipients.mockResolvedValue([
      approver('a@nesr.com', 'A Person'),
      approver('b@nesr.com', 'B Person'),
    ]);

    await sendProcureGuardOpenRequestReminders();

    expect(postProcureGuardWebhook).toHaveBeenCalledTimes(2); // both approvers nudged
    expect(exec).toHaveBeenCalledTimes(1); // but the request is stamped once
  });

  it('does nothing at all when the webhook is not configured', async () => {
    delete process.env.N8N_PROCUREGUARD_WEBHOOK_URL;
    const result = await sendProcureGuardOpenRequestReminders();
    expect(postProcureGuardWebhook).not.toHaveBeenCalled();
    expect(result).toEqual({ checked: 0, sent: 0, skipped: 0, errors: 0, recipients: 0 });
  });
});
