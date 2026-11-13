import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assignedMail,
  extensionDecisionMail,
  extensionRequestMail,
  mailTestRecipient,
  redirectForTest,
  sendIcsaMail,
} from '../mail';

const base = () =>
  assignedMail({
    to: 'champion.ksa@icsa-demo.invalid',
    name: 'Faisal',
    cycleLabel: 'Q1 2027',
    country: 'Saudi Arabia',
    deadline: '2027-03-31',
    thresholdPct: 70,
    enrollmentId: 4,
  });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('ICSA test recipient', () => {
  it('reads the address only when it looks like one', () => {
    vi.stubEnv('ICSA_MAIL_TEST_RECIPIENT', ' "SBagalkot@nesr.com" ');
    expect(mailTestRecipient()).toBe('sbagalkot@nesr.com');
    vi.stubEnv('ICSA_MAIL_TEST_RECIPIENT', '');
    expect(mailTestRecipient()).toBeNull();
  });

  it('re-addresses the email and says who it was meant for', () => {
    const m = redirectForTest({ ...base(), cc: ['boss@nesr.com'] }, 'me@nesr.com');
    expect(m.to).toEqual(['me@nesr.com']);
    expect(m.cc).toEqual([]);
    expect(m.subject.startsWith('[ICSA TEST] ')).toBe(true);
    expect(m.bodyText).toContain('champion.ksa@icsa-demo.invalid, boss@nesr.com (cc)');
  });

  it('sends demo-person mail to the test recipient instead of skipping it', async () => {
    vi.stubEnv('N8N_ICSA_WEBHOOK_URL', 'https://n8n.example/webhook/icsa-mail');
    vi.stubEnv('ICSA_MAIL_TEST_RECIPIENT', 'me@nesr.com');
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await sendIcsaMail(base());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.to).toEqual(['me@nesr.com']);
    expect(body.kind).toBe('assigned');
  });

  it('still skips demo-person mail when no test recipient is set', async () => {
    vi.stubEnv('N8N_ICSA_WEBHOOK_URL', 'https://n8n.example/webhook/icsa-mail');
    vi.stubEnv('ICSA_MAIL_TEST_RECIPIENT', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await sendIcsaMail(base());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('extension emails', () => {
  it('asks every admin, with the dates and the reason', () => {
    const m = extensionRequestMail({
      to: ['a@nesr.com', 'b@nesr.com'],
      championName: 'Yousef',
      championEmail: 'y@nesr.com',
      cycleLabel: 'Q1 2027',
      country: 'Kuwait',
      currentDeadline: '2027-03-31',
      requestedDeadline: '2027-04-15',
      reason: 'Stock count <week>',
    });
    expect(m.kind).toBe('extension-request');
    expect(m.to).toEqual(['a@nesr.com', 'b@nesr.com']);
    expect(m.subject).toContain('Kuwait asks for an extension to 2027-04-15');
    expect(m.bodyHtml).toContain('Stock count &lt;week&gt;');
    expect(m.bodyHtml).toContain('/icsa/admin');
  });

  it('tells the champion the outcome, and only mentions a note when there is one', () => {
    const base = {
      to: 'y@nesr.com',
      cc: [],
      name: 'Yousef',
      cycleLabel: 'Q1 2027',
      country: 'Kuwait',
      requestedDeadline: '2027-04-15',
      enrollmentId: 9,
    };
    const yes = extensionDecisionMail({ ...base, approved: true, note: null });
    expect(yes.subject).toContain('approved');
    expect(yes.bodyHtml).toContain('The new deadline for <b>Kuwait</b> is <b>2027-04-15</b>');
    expect(yes.bodyHtml).not.toContain('Note from the administrator');
    const no = extensionDecisionMail({ ...base, approved: false, note: 'Too late' });
    expect(no.subject).toContain('rejected');
    expect(no.bodyHtml).toContain('Too late');
    expect(no.bodyHtml).toContain('/icsa/enrollments/9');
  });
});
