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
 * It also carries the other direction. `notifyAccessDecision` tells the person who ASKED what
 * was decided -- the half that did not exist, so a request announced itself to the reviewers
 * and then went quiet, and somebody rejected learned nothing at all.
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

/**
 * Where each tool lives, as the "Open <tool>" button in the decision mail.
 *
 * The reviewers' mail links to the queue; the requester's has to link to the thing they just
 * got access to. Same four tools, different destination, so a second map rather than reusing
 * ACCESS_REVIEW_PATHS with the admin prefix stripped — which would send a newly approved
 * SourceGuide user to `/sourceguide?section=access`.
 */
export const TOOL_PATHS: Record<NotifiableTool, string> = {
  'SC Agents Platform': '/home',
  'SOA Consolidation': '/soa-consolidation',
  SourceGuide: '/sourceguide',
  'TI-TE': '/ti-te',
};

export interface AccessDecisionNotice {
  tool: NotifiableTool;
  /** 'approved' or 'rejected'. The workflow picks the wording; nothing here writes prose. */
  decision: 'approved' | 'rejected';
  /** The person who asked. This mail goes to them, not to the reviewers. */
  name: string;
  email: string;
  /** What they ended up with: a country, a joined list, or NOT_CAPTURED. */
  country: string;
  role: string;
  /** Who decided, so the requester knows who to go back to. */
  decidedBy: string;
  /** Free text from the reviewer, where the tool captures one. */
  note?: string | null;
}

/**
 * Tell the person who asked what was decided.
 *
 * The gap this fills: a request announced itself to the reviewers and then went quiet. Somebody
 * asking for access had no way to learn they had been approved other than trying the tool
 * again, and no way at all to learn they had been rejected — the row simply changed state in a
 * table they cannot see.
 *
 * Its own webhook rather than a `decision` field on the existing one. That workflow emails two
 * named reviewers; a payload it did not expect would either be dropped or, worse, mailed to the
 * reviewers as a malformed request. Two workflows, two audiences, no branching on a shape.
 *
 * Best-effort and never throws, for the same reason as the request notice: the decision is
 * already committed and granted by the time this runs. A webhook that is down should leave
 * somebody un-emailed, not leave an administrator staring at a failure for work that succeeded.
 *
 * If N8N_ACCESS_DECISION_WEBHOOK_URL is unset this returns silently, which is the state of
 * every environment until that workflow exists.
 */
export async function notifyAccessDecision(notice: AccessDecisionNotice): Promise<void> {
  const webhookUrl = process.env.N8N_ACCESS_DECISION_WEBHOOK_URL;
  if (!webhookUrl) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';
  const toolPath = TOOL_PATHS[notice.tool];
  const toolUrl = toolPath && appUrl ? `${appUrl}${toolPath}` : null;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: notice.tool,
        decision: notice.decision,
        name: notice.name,
        email: notice.email,
        country: notice.country,
        role: notice.role,
        decidedBy: notice.decidedBy,
        note: notice.note ?? null,
        toolUrl,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      log.warn('decisionRejected', {
        tool: notice.tool,
        decision: notice.decision,
        status: response.status,
        statusText: response.statusText,
      });
    }
  } catch (err) {
    log.warn('decisionFailed', {
      tool: notice.tool,
      decision: notice.decision,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
