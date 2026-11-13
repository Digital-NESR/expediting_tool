import { afterEach, describe, expect, it, vi } from 'vitest';
import { assignedMail, mailTestRecipient, redirectForTest, sendIcsaMail } from '../mail';

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
