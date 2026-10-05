import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_APPS } from '@/app/admin/adminNav';
import {
  ACCESS_REVIEW_PATHS,
  NOT_CAPTURED,
  notifyAccessRequest,
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
