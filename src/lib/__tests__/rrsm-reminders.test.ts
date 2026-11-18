import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The daily renewal reminder run.
 *
 * Three properties are worth pinning here, because each is a way the job could be quietly wrong
 * in production and look fine in a log:
 *
 *   1. It must not stamp `reminders_sent` on a run that could not send. Otherwise the day the
 *      webhook is configured, every renewal already believes it has been chased.
 *   2. One email per person, not one per contract -- the ProcureGuard mistake.
 *   3. It marks every step the clock has REACHED, not only the one it sent, so a renewal nobody
 *      looked at for two months does not produce three emails on three consecutive days.
 */

const query = vi.fn();
const sendRrsmMail = vi.fn();

vi.mock('@/lib/db-rrsm', () => ({ default: { query: (...a: unknown[]) => query(...a) } }));
vi.mock('@/lib/rrsm/notify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/rrsm/notify')>();
  return { ...actual, sendRrsmMail: (...a: unknown[]) => sendRrsmMail(...a) };
});

import { sendRrsmRenewalReminders } from '@/lib/rrsm/reminders';

const TODAY = new Date('2026-11-16T09:00:00Z');
const day = 86_400_000;
/** `yyyy-mm-dd` n days from TODAY. */
const due = (n: number) => new Date(TODAY.getTime() + n * day).toISOString().slice(0, 10);

function renewalRow(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    due_on: due(24),
    reminders_sent: [],
    country_code: 'KW',
    description: 'Crane 50T',
    asset_ref: 'CR-50-01',
    segment: 'CPVEN_CT',
    requester_email: '',
    owner_email: '',
    country_name: 'Kuwait',
    supplier_name: 'SMG Heavy Equipment',
    months_used: 12,
    ...over,
  };
}

/**
 * Answer the job's queries in the order it makes them: the open-renewals INSERT, the deciders
 * lookup, the pending-renewals SELECT, then one UPDATE per renewal marked.
 */
function wireQueries(opts: { deciders?: { country_code: string; email: string }[]; rows: object[] }) {
  query.mockImplementation((sql: string) => {
    if (/INSERT INTO rrsm_renewals/.test(sql)) return Promise.resolve({ rows: [] });
    if (/FROM rrsm_users/.test(sql)) return Promise.resolve({ rows: opts.deciders ?? [] });
    if (/FROM rrsm_renewals/.test(sql)) return Promise.resolve({ rows: opts.rows });
    return Promise.resolve({ rows: [] });
  });
}

/** Every UPDATE the run issued, as `[renewalId, stampedSteps]`. */
function stamps(): [number, number[]][] {
  return query.mock.calls
    .filter(([sql]) => typeof sql === 'string' && /UPDATE rrsm_renewals/.test(sql))
    .map(([, params]) => params as [number, number[]]);
}

beforeEach(() => {
  query.mockReset();
  sendRrsmMail.mockReset();
  sendRrsmMail.mockResolvedValue({ ok: true, status: 200 });
  process.env.N8N_RRSM_WEBHOOK_URL = 'https://n8n.example.test/webhook/rrsm';
  process.env.NEXT_PUBLIC_APP_URL = 'https://sc.example.test';
});

describe('a run that cannot send', () => {
  it('touches nothing at all when no webhook is configured', async () => {
    delete process.env.N8N_RRSM_WEBHOOK_URL;
    wireQueries({ rows: [renewalRow()] });

    const summary = await sendRrsmRenewalReminders({ today: TODAY });

    expect(summary.skipped).toBeTruthy();
    /* The important half: not one query ran, so nothing was marked reminded. A run that stamped
       first and discovered it could not send would silence every renewal permanently. */
    expect(query).not.toHaveBeenCalled();
    expect(sendRrsmMail).not.toHaveBeenCalled();
  });

  it('does not mark a renewal whose email was refused', async () => {
    sendRrsmMail.mockResolvedValue({ ok: false, status: 422, error: 'No deliverable address.' });
    wireQueries({ deciders: [{ country_code: 'KW', email: 'buyer.kw@nesr.com' }], rows: [renewalRow()] });

    const summary = await sendRrsmRenewalReminders({ today: TODAY });

    expect(summary.errors).toBe(1);
    expect(summary.reminded).toBe(0);
    expect(stamps()).toHaveLength(0);
  });
});

describe('who is told', () => {
  it('tells the country buyers, the requester and the owner, once each', async () => {
    wireQueries({
      deciders: [
        { country_code: 'KW', email: 'buyer.kw@nesr.com' },
        /* A different country's buyer must not be dragged in. */
        { country_code: 'AE', email: 'buyer.ae@nesr.com' },
      ],
      rows: [
        renewalRow({
          requester_email: 'K.Almutairi@nesr.com',
          /* Deliberately the buyer again, in another case: one person, one email. */
          owner_email: 'BUYER.KW@nesr.com',
        }),
      ],
    });

    await sendRrsmRenewalReminders({ today: TODAY });

    const recipients = sendRrsmMail.mock.calls.map((c) => (c[0] as { to: string[] }).to).flat();
    expect(recipients.sort()).toEqual(['buyer.kw@nesr.com', 'k.almutairi@nesr.com']);
  });

  it('counts a renewal with nobody to tell rather than failing the run', async () => {
    /* The symptom of a country with no buyer assigned, which is the one configuration fault
       that silently disables the whole feature. */
    wireQueries({ deciders: [], rows: [renewalRow()] });

    const summary = await sendRrsmRenewalReminders({ today: TODAY });

    expect(summary.orphaned).toBe(1);
    expect(summary.errors).toBe(0);
    expect(sendRrsmMail).not.toHaveBeenCalled();
  });
});

describe('one email per person', () => {
  it('sends a buyer holding four expiring contracts one email, not four', async () => {
    wireQueries({
      deciders: [{ country_code: 'KW', email: 'buyer.kw@nesr.com' }],
      rows: [
        renewalRow({ id: 1, due_on: due(24) }),
        renewalRow({ id: 2, due_on: due(12) }),
        renewalRow({ id: 3, due_on: due(-9) }),
        renewalRow({ id: 4, due_on: due(60) }),
      ],
    });

    const summary = await sendRrsmRenewalReminders({ today: TODAY });

    expect(sendRrsmMail).toHaveBeenCalledTimes(1);
    expect(summary.recipients).toBe(1);
    expect(summary.reminded).toBe(4);
    const mail = sendRrsmMail.mock.calls[0][0] as { subject: string };
    expect(mail.subject).toContain('4 contracts');
  });

  it('links at the country of the most urgent line, on the renewals view', async () => {
    wireQueries({
      deciders: [{ country_code: 'KW', email: 'buyer.kw@nesr.com' }],
      rows: [renewalRow()],
    });

    await sendRrsmRenewalReminders({ today: TODAY });

    const mail = sendRrsmMail.mock.calls[0][0] as { bodyHtml: string };
    expect(mail.bodyHtml).toContain('https://sc.example.test/rrsm/renewals?country=KW');
  });
});

describe('what gets marked', () => {
  it('marks every step the clock has reached, not only the one it sent', async () => {
    /* 24 days out with nothing sent: 90, 60 and 30 have all been missed. Marking only the 90
       would mail the 60 tomorrow and the 30 the day after. */
    wireQueries({
      deciders: [{ country_code: 'KW', email: 'buyer.kw@nesr.com' }],
      rows: [renewalRow({ due_on: due(24), reminders_sent: [] })],
    });

    await sendRrsmRenewalReminders({ today: TODAY });

    expect(stamps()).toEqual([[1, [90, 60, 30]]]);
  });

  it('keeps steps already sent, so history is never rewritten', async () => {
    wireQueries({
      deciders: [{ country_code: 'KW', email: 'buyer.kw@nesr.com' }],
      rows: [renewalRow({ due_on: due(12), reminders_sent: [90, 60, 30] })],
    });

    await sendRrsmRenewalReminders({ today: TODAY });

    expect(stamps()).toEqual([[1, [90, 60, 30, 14]]]);
  });

  it('sends nothing on a second run the same day', async () => {
    wireQueries({
      deciders: [{ country_code: 'KW', email: 'buyer.kw@nesr.com' }],
      rows: [renewalRow({ due_on: due(24), reminders_sent: [90, 60, 30] })],
    });

    const summary = await sendRrsmRenewalReminders({ today: TODAY });

    expect(summary.checked).toBe(1);
    expect(summary.due).toBe(0);
    expect(sendRrsmMail).not.toHaveBeenCalled();
  });
});
