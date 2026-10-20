import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_APPS } from '@/app/admin/adminNav';
import {
  ACCESS_REVIEW_PATHS,
  NOT_CAPTURED,
  notifyAccessDecision,
  notifyAccessRequest,
  TOOL_PATHS,
  type NotifiableTool,
} from '@/lib/access-request-notify';

describe('ACCESS_REVIEW_PATHS', () => {
  /*
   * The whole point of this table. /admin addresses a section with ?section=, not a path segment,
   * and the ids are not uniform — SourceGuide's is `access` where everyone else's is
   * `access-approvals`. The notifier this replaced linked to /admin/soa/access-approvals, which
   * has never been a route, and nothing caught it because a dead link in an email fails silently.
   */
  it.each(Object.entries(ACCESS_REVIEW_PATHS))(
    '%s points at an admin app and section that exist',
    (_tool, path) => {
      const [base, query] = path.split('?');
      const appId = base.replace('/admin/', '');
      const app = ADMIN_APPS.find((a) => a.id === appId);
      expect(app, `no admin app with id "${appId}"`).toBeDefined();

      const sectionId = new URLSearchParams(query).get('section');
      expect(sectionId, `"${path}" names no section`).toBeTruthy();
      expect(
        app!.sections.map((s) => s.id),
        `"${appId}" has no section "${sectionId}"`,
      ).toContain(sectionId);
    },
  );

  it('covers every tool that can raise a request', () => {
    expect(Object.keys(ACCESS_REVIEW_PATHS).sort()).toEqual([
      'SC Agents Platform',
      'SOA Consolidation',
      'SourceGuide',
      'TI-TE',
    ]);
  });
});

describe('notifyAccessRequest', () => {
  const notice = {
    tool: 'SourceGuide' as NotifiableTool,
    name: 'Mohammed Kamran',
    email: 'mohammed.kamran@nesr.com',
    country: 'All countries',
    role: 'Read-only viewer',
  };

  beforeEach(() => {
    vi.stubEnv('N8N_APPROVAL_NOTIFICATION_WEBHOOK_URL', 'https://n8n.test/webhook/x');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://scagents.nesr.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts the five fields plus the resolved review link', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessRequest(notice);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://n8n.test/webhook/x');
    expect(JSON.parse(init.body)).toMatchObject({
      tool: 'SourceGuide',
      name: 'Mohammed Kamran',
      country: 'All countries',
      role: 'Read-only viewer',
      reviewUrl: 'https://scagents.nesr.com/admin/sourceguide?section=access',
    });
  });

  it('sends nothing at all when the webhook is not configured', async () => {
    vi.stubEnv('N8N_APPROVAL_NOTIFICATION_WEBHOOK_URL', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessRequest(notice);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /*
   * The request row is already committed by the time this runs. A webhook that is down must delay
   * the reviewers hearing about it, never fail the submission and tell the person to try again.
   */
  it('swallows a refused webhook', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Boom' }),
    );
    await expect(notifyAccessRequest(notice)).resolves.toBeUndefined();
  });

  it('swallows a webhook that never answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));
    await expect(notifyAccessRequest(notice)).resolves.toBeUndefined();
  });

  it('omits the review link rather than building a relative one', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessRequest(notice);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).reviewUrl).toBeNull();
  });

  it('passes a not-applicable field through as the sentence, not as a blank', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessRequest({
      ...notice,
      tool: 'TI-TE',
      role: NOT_CAPTURED,
      country: 'Oman, UAE',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      role: 'Not applicable',
      country: 'Oman, UAE',
    });
  });
});

describe('TOOL_PATHS', () => {
  /*
   * The reviewers' mail links to the queue; this one links to the thing the person just got
   * access to. Reusing ACCESS_REVIEW_PATHS with the /admin prefix stripped would have sent a
   * newly approved SourceGuide user to `/sourceguide?section=access`, so it is a second map —
   * and a second map is a second thing that can rot.
   */
  it('names the same four tools as the review paths', () => {
    expect(Object.keys(TOOL_PATHS).sort()).toEqual(Object.keys(ACCESS_REVIEW_PATHS).sort());
  });

  it('points at the tool itself, never at an admin screen the requester cannot open', () => {
    for (const [tool, path] of Object.entries(TOOL_PATHS)) {
      expect(path.startsWith('/'), `${tool} is not an absolute path`).toBe(true);
      expect(path.startsWith('/admin'), `${tool} links into /admin`).toBe(false);
      expect(path, `${tool} carries a query string`).not.toContain('?');
    }
  });
});

describe('notifyAccessDecision', () => {
  const decision = {
    tool: 'SOA Consolidation' as NotifiableTool,
    decision: 'approved' as const,
    name: 'Mohammed Kamran',
    email: 'mohammed.kamran@nesr.com',
    country: 'Egypt',
    role: 'champion',
    decidedBy: 'admin@nesr.com',
  };

  beforeEach(() => {
    vi.stubEnv('N8N_ACCESS_DECISION_WEBHOOK_URL', 'https://n8n.test/webhook/decision');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://scagents.nesr.com');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('posts the decision, who made it, and a link into the tool', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessDecision(decision);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://n8n.test/webhook/decision');
    expect(JSON.parse(init.body)).toMatchObject({
      tool: 'SOA Consolidation',
      decision: 'approved',
      email: 'mohammed.kamran@nesr.com',
      country: 'Egypt',
      role: 'champion',
      decidedBy: 'admin@nesr.com',
      toolUrl: 'https://scagents.nesr.com/soa-consolidation',
    });
  });

  it('carries a rejection, which is the half nobody was being told', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessDecision({ ...decision, decision: 'rejected', country: NOT_CAPTURED });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
      decision: 'rejected',
      country: 'Not applicable',
    });
  });

  it('uses its OWN webhook, not the one that mails the reviewers', async () => {
    /* Sharing the request webhook would send a decision payload to a workflow that mails two
       named reviewers, so the wrong people would get a malformed mail about somebody else. */
    vi.stubEnv('N8N_ACCESS_DECISION_WEBHOOK_URL', '');
    vi.stubEnv('N8N_APPROVAL_NOTIFICATION_WEBHOOK_URL', 'https://n8n.test/webhook/requests');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessDecision(decision);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /* The grant is committed and real before this runs. A webhook that is down must leave
     somebody un-emailed, never report a failure for an approval that succeeded. */
  it('swallows a refused webhook', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Boom' }),
    );
    await expect(notifyAccessDecision(decision)).resolves.toBeUndefined();
  });

  it('swallows a webhook that never answers', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ETIMEDOUT')));
    await expect(notifyAccessDecision(decision)).resolves.toBeUndefined();
  });

  it('omits the link rather than building a relative one', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await notifyAccessDecision(decision);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).toolUrl).toBeNull();
  });
});
