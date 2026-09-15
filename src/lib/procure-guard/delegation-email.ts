/**
 * Delegation grant/revoke emails and the "what is waiting for you" open-items lookup.
 *
 * A plain module, deliberately NOT `'use server'`: sendProcureGuardDelegationEmail addresses an
 * arbitrary recipient, so it stays behind the delegation actions' guards.
 */
import type { QueryResultRow } from 'pg';
import { logger } from '@/lib/logger';
import { getPermissionProfile } from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  ProcureGuardActor,
  ProcureGuardRequestType,
  ProcureGuardReviewGrant,
} from '@/types/procureGuard';
import { scopedRequestWhere as scopedWhere } from './access';
import { getScopedProcureGuardAvailableActions } from './actor';
import {
  escapeHtml,
  getAppBaseUrl,
  postProcureGuardWebhook,
  procureGuardWebhookErrorMessage,
  serialise,
  sql,
} from './internals';
import { normalisePaymentCountries } from './validation';
import { shortDate } from '@/lib/format';

const log = logger('procure-guard');

function fmtDelegationDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return shortDate(d);
}

export type DelegationOpenItem = {
  reference: string;
  requestType: ProcureGuardRequestType;
  status: string;
};

// The delegator's currently-open approval items, so the grant email can tell the delegate what's waiting.
export async function getDelegatorOpenItems(
  grant: ProcureGuardReviewGrant,
): Promise<DelegationOpenItem[]> {
  try {
    const synthetic: ProcureGuardActor = {
      email: grant.fromEmail,
      name: grant.fromName,
      isAdmin: grant.isAdmin,
      role: grant.role,
      permissions: getPermissionProfile(grant.role),
      country: grant.country,
      segment: grant.segment,
      reviewGrants: [{ ...grant, source: 'self' }],
    };
    const scope = scopedWhere(synthetic);
    const [adhocRows, advanceRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_adhoc_payments ${scope.where} ORDER BY created_at DESC`,
        scope.params,
      ),
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_advance_payments ${scope.where} ORDER BY created_at DESC`,
        scope.params,
      ),
    ]);
    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    return [
      ...adhoc.map((request) => ({
        requestType: 'adhoc' as const,
        request,
        actions: getScopedProcureGuardAvailableActions(synthetic, 'adhoc', request),
      })),
      ...advance.map((request) => ({
        requestType: 'advance' as const,
        request,
        actions: getScopedProcureGuardAvailableActions(synthetic, 'advance', request),
      })),
    ]
      .filter((item) => item.actions.canApprove || item.actions.canReject)
      .slice(0, 8)
      .map((item) => ({
        reference: item.request.reference_number,
        requestType: item.requestType,
        status: item.request.status,
      }));
  } catch (err) {
    log.error('getDelegatorOpenItems.failed', err);
    return [];
  }
}

export async function sendProcureGuardDelegationEmail(
  kind: 'granted' | 'revoked',
  params: {
    delegateEmail: string;
    delegateName: string | null;
    delegatorName: string;
    expiresAt: string | null;
    openItems: DelegationOpenItem[];
  },
): Promise<void> {
  const webhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    log.warn('delegationEmail.unconfigured', {
      reason: 'N8N_PROCUREGUARD_WEBHOOK_URL is not set',
      kind,
    });
    return;
  }
  // Resolved up front: getAppBaseUrl() now refuses to invent a localhost link in production, and
  // an email we cannot address must not take the delegation write down with it.
  let appBaseUrl: string;
  try {
    appBaseUrl = getAppBaseUrl();
  } catch (err) {
    log.error('delegationEmail.failed', err, { kind });
    return;
  }
  const to = params.delegateEmail.trim().toLowerCase();
  const name = params.delegateName || to;
  const granted = kind === 'granted';
  const accent = granted ? '#006B0C' : '#b42318';
  const subject = granted
    ? `ProcureGuard: ${params.delegatorName} delegated their approvals to you`
    : `ProcureGuard: your delegated access from ${params.delegatorName} was revoked`;
  const heading = granted
    ? 'Approval authority delegated to you'
    : 'Delegated approval access revoked';
  const lead = granted
    ? `${escapeHtml(params.delegatorName)} has delegated their ProcureGuard approval authority to you. You can now review and act on requests within their scope.`
    : `${escapeHtml(params.delegatorName)} has revoked the ProcureGuard approval authority that was delegated to you. You no longer have access to their approvals.`;
  const expiryLine = granted
    ? params.expiresAt
      ? `This access is active until ${escapeHtml(fmtDelegationDate(params.expiresAt))}.`
      : 'This access stays active until it is revoked.'
    : '';
  const openBlock = granted
    ? params.openItems.length
      ? `<div style="background:#f9fafb;border-left:4px solid ${accent};padding:12px 14px;margin-bottom:22px;"><div style="font-weight:600;margin-bottom:6px;">Currently open for your action</div><ul style="margin:0;padding-left:18px;color:#374151;">${params.openItems.map((i) => `<li>${escapeHtml(i.reference)} — ${escapeHtml(i.requestType === 'adhoc' ? 'Adhoc PO' : 'Advance Payment')} (${escapeHtml(i.status)})</li>`).join('')}</ul></div>`
      : `<p style="margin:0 0 22px 0;color:#4b5563;">There are no items awaiting action right now.</p>`
    : '';
  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid ${accent};padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:${accent};">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Approval delegation</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(heading)}</h2>
      <p style="margin:0 0 ${expiryLine ? '8' : '22'}px 0;color:#4b5563;">${lead}</p>
      ${expiryLine ? `<p style="margin:0 0 22px 0;color:#4b5563;">${expiryLine}</p>` : ''}
      ${openBlock}
      ${granted ? `<div style="text-align:center;margin:24px 0;"><a href="${escapeHtml(appBaseUrl)}/procure-guard/my-work" style="display:inline-block;background:${accent};color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;">Open ProcureGuard</a></div>` : ''}
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">This message was generated by the ProcureGuard workflow.</div>
    </div>
  `;
  const payload = {
    event: granted ? 'delegation.granted' : 'delegation.revoked',
    source: 'procureguard-local',
    occurred_at: new Date().toISOString(),
    email: {
      subject,
      body_html: bodyHtml,
      to: [to],
      to_recipients: [{ emailAddress: { address: to, name } }],
    },
    recipients: [
      {
        name,
        email: to,
        role: 'Delegate',
        approval_status: null,
        country: null,
        source_column: 'delegation',
      },
    ],
    delegation: {
      delegator_name: params.delegatorName,
      delegate_email: to,
      expires_at: params.expiresAt,
    },
  };
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
  if (secret) headers['x-procureguard-secret'] = secret;
  try {
    const response = await postProcureGuardWebhook(webhookUrl, headers, payload);
    if (!response.ok)
      log.error('delegationEmail.failed', null, {
        kind,
        status: response.status,
        statusText: response.statusText,
      });
  } catch (err) {
    log.error('delegationEmail.failed', err, {
      kind,
      reason: procureGuardWebhookErrorMessage(err),
    });
  }
}
