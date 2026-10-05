/**
 * One notification for every access request, whichever tool it is for.
 *
 * Four tools take access requests and they did not agree on what happens next. The platform and
 * SOA each emailed ADMIN_EMAILS through their own hand-rolled HTML; SourceGuide and TI-TE sent
 * nothing at all, so a request there sat in a table until somebody happened to open the admin
 * screen. This replaces all of it: one payload, one n8n workflow ("Approval Notification"), one
 * pair of reviewers.
 *
 * The tools also disagree about what they capture. SourceGuide asks for neither a country nor a
 * role, because approving it grants all-country read-only and there is nothing to choose; the
 * platform and TI-TE take several countries at once and no role; only SOA has both. Rather than
 * teach the workflow about four shapes, every caller resolves its own fields to a sentence and
 * the mail prints the same five rows every time. A reader comparing two requests is then reading
 * the same layout twice.
 *
 * A plain module, deliberately not `'use server'`: every export of one of those is a public POST
 * endpoint, and an endpoint that emails two named people on demand is one nobody needs.
 */

import { logger } from '@/lib/logger';

const log = logger('access-request-notify');

/** Said in full rather than left blank, so an empty row never reads as a broken mail. */
export const NOT_CAPTURED = 'Not applicable';

/**
 * Where each tool's queue is reviewed, as the "Review request" button in the mail.
 *
 * Gathered here rather than spelled out at four call sites because /admin addresses a section
 * with a query parameter, not a path segment, and the section ids are not uniform: SourceGuide's
 * is `access` where everyone else's is `access-approvals`. The SOA notifier this replaces linked
 * to /admin/soa/access-approvals, which has never been a route. A test checks every entry below
 * against ADMIN_APPS so the next rename cannot quietly reintroduce that.
 */
export const ACCESS_REVIEW_PATHS = {
  // The platform's own access_requests table is reviewed under PO Expediting, its first tool.
  'SC Agents Platform': '/admin/po-expediting?section=access-approvals',
  'SOA Consolidation': '/admin/soa?section=access-approvals',
  SourceGuide: '/admin/sourceguide?section=access',
  'TI-TE': '/admin/tite?section=access-approvals',
} as const;

export type NotifiableTool = keyof typeof ACCESS_REVIEW_PATHS;

export interface AccessRequestNotice {
  /** The tool as a person would name it, and the key to its review path. */
  tool: NotifiableTool;
  name: string;
  email: string;
  /** Already resolved by the caller: one country, a joined list, or NOT_CAPTURED. */
  country: string;
  /** Likewise: the role asked for, what approval grants, or NOT_CAPTURED. */
  role: string;
  jobTitle?: string | null;
  department?: string | null;
  reason?: string | null;
}

/**
 * Tell the reviewers. Best-effort by design and never throws.
 *
 * Callers invoke this after the request row is committed. A request that was recorded but not
 * announced is a delay somebody fixes by opening the admin screen; a request refused because a
 * webhook was down is work the person has to do again, having been told it failed.
 */
export async function notifyAccessRequest(notice: AccessRequestNotice): Promise<void> {
  const webhookUrl = process.env.N8N_APPROVAL_NOTIFICATION_WEBHOOK_URL;
  if (!webhookUrl) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const reviewPath = ACCESS_REVIEW_PATHS[notice.tool];
  const reviewUrl = reviewPath && appUrl ? `${appUrl}${reviewPath}` : null;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: notice.tool,
        name: notice.name,
        email: notice.email,
        country: notice.country,
        role: notice.role,
        jobTitle: notice.jobTitle ?? null,
        department: notice.department ?? null,
        reason: notice.reason ?? null,
        reviewUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      log.warn('notifyRejected', {
        tool: notice.tool,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (err) {
    log.warn('notifyFailed', {
      tool: notice.tool,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
