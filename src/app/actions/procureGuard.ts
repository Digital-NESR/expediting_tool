'use server';

import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { getProcureGuardUser } from '@/lib/auth';
import procureGuardPool from '@/lib/db-procureguard';
import { canUseProcureGuardAdmin, canUseProcureGuardAnalytics, canUseProcureGuardOperationalPages, canUseProcureGuardReviewerQueue, formatProcureGuardStatusLabel, getNextApprovalStatus, getPermissionProfile, getProcureGuardAvailableActions, getProcureGuardAccessView, getRequiredPermissionForTransition, getWorkflowSteps, isActiveApprovalStatus, normalizeProcureGuardCountry, PERMISSION_ROLE_OPTIONS, REVIEWED_STATUSES, toUsd } from '@/lib/procureGuard-utils';
import type { ProcureGuardAvailableActions } from '@/lib/procureGuard-utils';
import type {
  ActionResult,
  AdminCreateAdhocPaymentInput,
  AdminCreateAdvancePaymentInput,
  AdhocPaymentRequest,
  AdvancePaymentRequest,
  CreateAdhocPaymentInput,
  CreateAdvancePaymentInput,
  ProcureGuardActor,
  ProcureGuardPermissionRole,
  ProcureGuardPermissionRow,
  ProcureGuardAdminData,
  ProcureGuardAnalyticsData,
  ProcureGuardAnalyticsMetric,
  ProcureGuardActivityRow,
  ProcureGuardAdminAnalyticsData,
  ProcureGuardDashboardData,
  ProcureGuardHighValueRequest,
  ProcureGuardMonthlyMetric,
  ProcureGuardNotificationContact,
  ProcureGuardRequestDetailData,
  ProcureGuardDocument,
  ProcureGuardRequestListData,
  ProcureGuardReviewDurationMetric,
  ProcureGuardWorkQueueData,
  ProcureGuardRequestType,
  ProcureGuardStatus,
  UpdateProcureGuardPermissionInput,
  ProcureGuardVendorMetric,
} from '@/types/procureGuard';

const STATUS_SORT_ORDER: ProcureGuardStatus[] = [
  'Submitted',
  'Under Review',
  'Approved by SCM',
  'Approved by Country Controller',
  'Approved by Supply Chain Director',
  'Approved by Treasury Director',
  'Approved by Corporate Controller',
  'Approved',
  'Rejected',
  'Cancelled',
];
const PRIORITY_SORT_ORDER = ['Critical', 'High', 'Normal', 'Low'];
const MEANINGFUL_ACTIVITY_WHERE = "request_id > 0 AND action NOT ILIKE '%seeded%'";

const MAX_PROCURE_GUARD_FILE_BYTES = 10 * 1024 * 1024;
const FILE_MIME_MAP: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
  msg: 'application/vnd.ms-outlook',
  eml: 'message/rfc822',
};

function fileBaseName(name: string): string {
  return name.replace(/\.[^/.]+$/, '').trim() || 'Attachment';
}

function detectMime(file: File): string {
  const fileExt = (file.name.split('.').pop() ?? '').toLowerCase();
  return FILE_MIME_MAP[fileExt] || file.type || 'application/octet-stream';
}

type QueryParam = string | number | boolean | null | Date | Buffer | number[] | string[] | undefined;
type QueryParams = QueryParam[];
type ExecResult = { rowCount: number; insertId: number };
export type ProcureGuardAccessRequestStatus = 'Pending' | 'Approved' | 'Rejected' | 'Revoked';

export interface ProcureGuardAccessRequestRow {
  user_email: string;
  display_name: string | null;
  job_title: string | null;
  department: string | null;
  status: ProcureGuardAccessRequestStatus;
  requested_role: ProcureGuardPermissionRole;
  approved_role: ProcureGuardPermissionRole | null;
  country: string | null;
  segment: string | null;
  requested_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  notes: string | null;
}

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}

function normaliseParams(params: QueryParams): QueryParams {
  return params.map(value => value === undefined ? null : value);
}

async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await procureGuardPool.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}

async function exec(statement: string, params: QueryParams = []): Promise<ExecResult> {
  const result = await procureGuardPool.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return {
    rowCount: result.rowCount ?? 0,
    insertId: Number.isFinite(insertId) ? insertId : 0,
  };
}

async function ensureProcureGuardUsageTables(): Promise<void> {
  async function execSchema(statement: string) {
    try {
      await exec(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
    }
  }

  await execSchema(`
    CREATE TABLE IF NOT EXISTS procure_guard_usage_events (
      id BIGSERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      user_email TEXT,
      user_name TEXT,
      event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'click')),
      path TEXT NOT NULL,
      page_title TEXT,
      target_tag TEXT,
      target_text TEXT,
      target_href TEXT,
      target_role TEXT,
      duration_ms INTEGER,
      occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_occurred_at ON procure_guard_usage_events (occurred_at DESC)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_path ON procure_guard_usage_events (path)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_user ON procure_guard_usage_events (user_email)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_type ON procure_guard_usage_events (event_type)`);
}

async function ensureProcureGuardAccessRequestTable(): Promise<void> {
  async function execSchema(statement: string) {
    try {
      await exec(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
    }
  }

  await execSchema(`
    CREATE TABLE IF NOT EXISTS procure_guard_access_requests (
      user_email TEXT PRIMARY KEY,
      display_name TEXT,
      job_title TEXT,
      department TEXT,
      status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Revoked')),
      requested_role TEXT NOT NULL DEFAULT 'Requester',
      approved_role TEXT,
      country TEXT,
      segment TEXT,
      requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ,
      reviewed_by TEXT,
      notes TEXT
    )
  `);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_access_requests_status ON procure_guard_access_requests (status)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_access_requests_requested_at ON procure_guard_access_requests (requested_at DESC)`);
}

async function ensureProcureGuardPermissionRoleValues(): Promise<void> {
  try {
    await exec(`ALTER TYPE procure_guard_permission_role ADD VALUE IF NOT EXISTS 'Analyst'`);
  } catch (err) {
    const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
    if (code !== '42710' && code !== '42704') throw err;
  }
}

async function ensureProcureGuardPaymentRequestColumns(): Promise<void> {
  async function execSchema(statement: string) {
    try {
      await exec(statement);
    } catch (err) {
      const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
      if (code !== '23505' && code !== '42P07' && code !== '42710' && code !== '42701') throw err;
    }
  }

  await execSchema(`ALTER TABLE procure_guard_adhoc_payments ADD COLUMN IF NOT EXISTS requester_notification_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`);
  await execSchema(`ALTER TABLE procure_guard_advance_payments ADD COLUMN IF NOT EXISTS requester_notification_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[]`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_adhoc_requester_notification_emails ON procure_guard_adhoc_payments USING GIN (requester_notification_emails)`);
  await execSchema(`CREATE INDEX IF NOT EXISTS idx_procure_guard_advance_requester_notification_emails ON procure_guard_advance_payments USING GIN (requester_notification_emails)`);
}
function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalisePaymentCountry<T extends { country?: string | null }>(row: T): T {
  return { ...row, country: normalizeProcureGuardCountry(row.country) };
}

function normalisePaymentCountries<T extends { country?: string | null }>(rows: T[]): T[] {
  return rows.map(row => normalisePaymentCountry(row));
}

function normalisePermissionCountry<T extends { country?: string | null }>(row: T): T {
  return { ...row, country: normalizeProcureGuardCountry(row.country) };
}

function requireCountryOption(value: string | null | undefined, label = 'Country'): string {
  const country = normalizeProcureGuardCountry(requireText(value, label));
  if (!country) throw new Error(`${label} is required.`);
  return country;
}

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isTlsCertificateError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const code = typeof err === 'object' && err && 'code' in err ? String(err.code) : '';
  return code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'SELF_SIGNED_CERT_IN_CHAIN'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || message.toLowerCase().includes('unable to verify')
    || message.toLowerCase().includes('self-signed certificate');
}

function procureGuardWebhookErrorMessage(err: unknown): string {
  if (isTlsCertificateError(err)) {
    return 'TLS certificate verification failed for n8n even though ProcureGuard is configured to bypass TLS verification for webhook calls.';
  }
  return err instanceof Error ? err.message : 'ProcureGuard n8n webhook failed.';
}

function adminEmails(): string[] {
  return (`${process.env.ADMIN_EMAILS ?? ''},${process.env.PROCURE_GUARD_ADMIN_EMAILS ?? ''}`)
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

async function getPermissionRowForEmail(email: string): Promise<ProcureGuardPermissionRow | null> {
  try {
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_permissions WHERE email = ? LIMIT 1`,
      [email],
    );
    return rows[0] ? normalisePermissionCountry(serialise<ProcureGuardPermissionRow>(rows[0])) : null;
  } catch (err) {
    console.error('[getPermissionRowForEmail]', err);
    return null;
  }
}

async function getActor(): Promise<ProcureGuardActor> {
  const user = await getProcureGuardUser();
  const email = user?.email ?? '';

  if (!email) {
    throw new Error('You must be signed in to use ProcureGuard.');
  }

  const permissionRow = await getPermissionRowForEmail(email);
  const fallbackRole: ProcureGuardPermissionRole = adminEmails().includes(email.toLowerCase()) ? 'Admin' : 'Requester';
  const role = (permissionRow?.role ?? fallbackRole) as ProcureGuardPermissionRole;
  const permissions = getPermissionProfile(role);

  return {
    email,
    name: permissionRow?.name ?? user?.name ?? email,
    department: user?.department ?? null,
    jobTitle: user?.jobTitle ?? null,
    isAdmin: permissions.role === 'Admin',
    role: permissions.role,
    permissions,
    country: normalizeProcureGuardCountry(permissionRow?.country),
    segment: permissionRow?.segment ?? null,
  };
}

export async function getProcureGuardActor(): Promise<ProcureGuardActor | null> {
  try {
    return await getActor();
  } catch (err) {
    console.error('[getProcureGuardActor]', err);
    return null;
  }
}

export async function canAccessProcureGuardApp(): Promise<boolean> {
  const user = await getProcureGuardUser();
  const email = user?.email?.toLowerCase();

  if (!email) return false;
  if (adminEmails().includes(email)) return true;

  const permissionRow = await getPermissionRowForEmail(email);
  return permissionRow?.role === 'Admin';
}

function scopedWhere(actor: ProcureGuardActor): { where: string; params: string[] } {
  if (!actor.permissions.canViewAll) {
    const email = actor.email.toLowerCase();
    return {
      where: 'WHERE (LOWER(requested_by_email) = ? OR ? = ANY(COALESCE(requester_notification_emails, ARRAY[]::TEXT[])))',
      params: [email, email],
    };
  }
  if (actor.role === 'Admin') return { where: '', params: [] };

  const filters: string[] = [];
  const params: string[] = [];
  if (actor.country) {
    filters.push('country = ?');
    params.push(actor.country);
  }
  if (actor.segment) {
    filters.push('segment = ?');
    params.push(actor.segment);
  }
  return { where: filters.length ? `WHERE ${filters.join(' AND ')}` : '', params };
}

function normaliseScopeValue(value: string | null | undefined): string {
  const trimmed = (value ?? '').trim().toLowerCase();
  const aliases: Record<string, string> = {
    ksa: 'saudi arabia (ksa)',
    'saudi arabia': 'saudi arabia (ksa)',
    uae: 'united arab emirates (uae)',
    'united arab emirates': 'united arab emirates (uae)',
  };
  return aliases[trimmed] ?? trimmed;
}

function actorCanAccessRequestScope(
  actor: ProcureGuardActor,
  request: { country?: string | null; segment?: string | null },
): boolean {
  if (actor.role === 'Admin') return true;

  const countryOk = !actor.country || normalizeProcureGuardCountry(actor.country) === normalizeProcureGuardCountry(request.country);
  const segmentOk = !actor.segment || normaliseScopeValue(actor.segment) === normaliseScopeValue(request.segment);
  return countryOk && segmentOk;
}

function getScopeRestrictionMessage(
  actor: ProcureGuardActor,
  request: { country?: string | null; segment?: string | null },
): string {
  const actorCountry = actor.country?.trim();
  const actorSegment = actor.segment?.trim();
  const requestCountry = request.country?.trim() || 'an unassigned country';
  const requestSegment = request.segment?.trim() || 'an unassigned segment';

  if (actorCountry && normalizeProcureGuardCountry(actorCountry) !== normalizeProcureGuardCountry(request.country)) {
    return `${actor.role} access is limited to ${actorCountry}. This request is for ${requestCountry}.`;
  }
  if (actorSegment && normaliseScopeValue(actorSegment) !== normaliseScopeValue(request.segment)) {
    return `${actor.role} access is limited to ${actorSegment}. This request is for ${requestSegment}.`;
  }
  return `${actor.role} access is limited to your assigned scope.`;
}

function getScopedProcureGuardAvailableActions(
  actor: ProcureGuardActor,
  requestType: ProcureGuardRequestType,
  request: { status: ProcureGuardStatus; amount?: number | string | null; currency?: string | null; spend_value_usd?: number | string | null; country?: string | null; segment?: string | null },
): ProcureGuardAvailableActions {
  const thresholdAmount = request.spend_value_usd ?? request.amount;
  const thresholdCurrency = request.spend_value_usd === null || request.spend_value_usd === undefined ? request.currency : 'USD';
  const actions = getProcureGuardAvailableActions(actor.permissions, requestType, request.status, thresholdAmount, thresholdCurrency);
  if (actorCanAccessRequestScope(actor, request)) return actions;

  return {
    ...actions,
    canApprove: false,
    canReject: false,
  };
}

async function requireAdminActor(): Promise<ProcureGuardActor> {
  const actor = await getActor();
  if (!canUseProcureGuardAdmin(getProcureGuardAccessView(actor.role)) && !adminEmails().includes(actor.email.toLowerCase())) {
    throw new Error('Admin access is required.');
  }
  return actor;
}

async function requirePermissionManager(): Promise<ProcureGuardActor> {
  const actor = await getActor();
  if (!canUseProcureGuardAdmin(getProcureGuardAccessView(actor.role))) {
    throw new Error('Permission management access is required.');
  }
  return actor;
}

function requireProcureGuardOperationalAccess(actor: ProcureGuardActor): void {
  if (!canUseProcureGuardOperationalPages(getProcureGuardAccessView(actor.role))) {
    throw new Error('Operational ProcureGuard access is required.');
  }
}

function requireProcureGuardAnalyticsAccess(actor: ProcureGuardActor): void {
  if (!canUseProcureGuardAnalytics(getProcureGuardAccessView(actor.role))) {
    throw new Error('Analytics access is required.');
  }
}

function requireProcureGuardReviewerQueueAccess(actor: ProcureGuardActor): void {
  if (!canUseProcureGuardReviewerQueue(getProcureGuardAccessView(actor.role))) {
    throw new Error('Reviewer access is required.');
  }
}

function makeReference(prefix: 'ADH' | 'ADV') {
  const d = new Date();
  const stamp = d.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `PG-${prefix}-${stamp}-${rand}`;
}

function blankToNull(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value as string | number;
}

function validateMoney(amount: unknown) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) throw new Error('Amount must be greater than zero.');
  return n;
}

function requireText(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

function validateNonNegativeNumber(value: unknown, label: string) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be zero or greater.`);
  return n;
}

function normalizeRequesterNotificationEmails(value: unknown, requesterEmail?: string | null): string[] {
  const rawValues = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\s,;]+/)
      : [];
  const requester = requesterEmail?.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const emails = new Set<string>();

  for (const raw of rawValues) {
    const email = String(raw ?? '').trim().toLowerCase();
    if (!email) continue;
    if (!emailPattern.test(email)) throw new Error(`Invalid notification email: ${email}`);
    if (email !== requester) emails.add(email);
  }

  return [...emails];
}

function requesterNotificationEmailsOf(request: Pick<AdhocPaymentRequest | AdvancePaymentRequest, 'requester_notification_emails'>): string[] {
  return Array.isArray(request.requester_notification_emails)
    ? request.requester_notification_emails.map(email => email.trim().toLowerCase()).filter(Boolean)
    : [];
}

function actorCanAccessRequesterSideRequest(
  actor: ProcureGuardActor,
  request: Pick<AdhocPaymentRequest | AdvancePaymentRequest, 'requested_by_email' | 'requester_notification_emails'>,
): boolean {
  const actorEmail = actor.email.toLowerCase();
  return request.requested_by_email?.toLowerCase() === actorEmail
    || requesterNotificationEmailsOf(request).includes(actorEmail);
}

function requestMonth(value: string | null | undefined): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function addMetric(map: Map<string, ProcureGuardAnalyticsMetric>, label: string | null | undefined, amount: unknown) {
  const key = label?.trim() || 'Unspecified';
  const current = map.get(key) ?? { label: key, count: 0, amount: 0 };
  current.count += 1;
  current.amount += Number(amount || 0);
  map.set(key, current);
}

function topMetrics(map: Map<string, ProcureGuardAnalyticsMetric>, limit = 8): ProcureGuardAnalyticsMetric[] {
  return [...map.values()]
    .sort((a, b) => b.count - a.count || b.amount - a.amount)
    .slice(0, limit);
}


function hoursBetween(startValue: string | null | undefined, endMs: number): number {
  const start = startValue ? new Date(startValue) : null;
  if (!start || Number.isNaN(start.getTime())) return 0;
  return Math.max(0, (endMs - start.getTime()) / 36e5);
}

type ReviewDurationDraft = ProcureGuardReviewDurationMetric & { longestUpdatedAtMs: number };

type ProcureGuardWorkflowEvent = 'request.submitted' | 'request.status_changed' | 'request.requester_status_changed';

type ProcureGuardWebhookRequest = Pick<
  AdhocPaymentRequest | AdvancePaymentRequest,
  | 'id'
  | 'reference_number'
  | 'requisition_number'
  | 'status'
  | 'priority'
  | 'vendor_name'
  | 'amount'
  | 'currency'
  | 'spend_value_usd'
  | 'country'
  | 'segment'
  | 'spend_category'
  | 'requested_by_name'
  | 'requested_by_email'
  | 'requester_notification_emails'
  | 'requester_comments'
  | 'created_at'
  | 'updated_at'
>;

type ProcureGuardNotificationRecipient = {
  display_name: string;
  email: string;
  notification_role: string;
  approval_status: ProcureGuardStatus | null;
  country: string;
  source_column: string;
};

function getAppBaseUrl(): string {
  const configured = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
  return stripEnvQuotes(configured).replace(/\/$/, '');
}

function getRequestDetailUrl(requestType: ProcureGuardRequestType, id: number): string {
  const segment = requestType === 'adhoc' ? 'adhoc-payments' : 'advance-payments';
  return `${getAppBaseUrl()}/procure-guard/${segment}/${id}`;
}

function countryRecipientKeys(country: string | null | undefined): string[] {
  const raw = normalizeProcureGuardCountry(country)?.trim();
  if (!raw) return [];

  const keys = new Set([raw]);
  const normalized = raw.toLowerCase();
  if (normalized === 'saudi arabia (ksa)' || normalized === 'ksa') keys.add('Saudi Arabia');
  if (normalized === 'saudi arabia') keys.add('Saudi Arabia (KSA)');
  if (normalized === 'united arab emirates (uae)' || normalized === 'united arab emirates') keys.add('UAE');
  if (normalized === 'uae') keys.add('United Arab Emirates (UAE)');
  return [...keys];
}

function getRecipientApprovalStatus(
  requestType: ProcureGuardRequestType,
  request: ProcureGuardWebhookRequest,
): ProcureGuardStatus | null {
  if (!isActiveApprovalStatus(request.status)) return null;
  const thresholdAmount = request.spend_value_usd ?? request.amount;
  const thresholdCurrency = request.spend_value_usd === null || request.spend_value_usd === undefined ? request.currency : 'USD';
  if (request.status === 'Submitted') {
    return getNextApprovalStatus(requestType, request.status, thresholdAmount, thresholdCurrency) ?? request.status;
  }
  return request.status;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatWebhookAmount(amount: number | string | null | undefined, currency: string | null | undefined): string {
  const value = Number(amount || 0);
  return `${currency || 'USD'} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function getNotificationPreviewStatuses(
  requestType: ProcureGuardRequestType,
  amount?: number | string | null,
  currency?: string | null,
): ProcureGuardStatus[] {
  return getWorkflowSteps(requestType, amount, currency || 'USD')
    .map(step => step.status)
    .filter((status): status is ProcureGuardStatus => status !== 'Submitted' && status !== 'Approved');
}

async function getProcureGuardNotificationContactPreviewRows(input: {
  requestType: ProcureGuardRequestType;
  country: string | null | undefined;
  amount?: number | string | null;
  currency?: string | null;
}): Promise<ProcureGuardNotificationContact[]> {
  const countries = countryRecipientKeys(input.country);
  const statuses = getNotificationPreviewStatuses(input.requestType, input.amount, input.currency);
  if (countries.length === 0 || statuses.length === 0) return [];

  const countryPlaceholders = countries.map(() => '?').join(', ');
  const statusPlaceholders = statuses.map(() => '?').join(', ');
  const rows = await sql<QueryResultRow[]>(
    `SELECT id, country, request_type, notification_role, approval_status, source_column, display_name, email
     FROM procure_guard_notification_recipients
     WHERE is_active = TRUE
       AND email IS NOT NULL
       AND TRIM(email) <> ''
       AND country IN (${countryPlaceholders})
       AND (request_type = ? OR request_type = 'both')
       AND approval_status IN (${statusPlaceholders})
     ORDER BY display_name ASC`,
    [...countries, input.requestType, ...statuses],
  );

  const statusRank = new Map(statuses.map((status, index) => [status, index]));
  const seen = new Set<string>();
  return serialise<ProcureGuardNotificationContact[]>(rows)
    .filter(row => {
      const key = `${row.approval_status || 'none'}:${row.email.trim().toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (statusRank.get(a.approval_status as ProcureGuardStatus) ?? 99) - (statusRank.get(b.approval_status as ProcureGuardStatus) ?? 99)
      || a.notification_role.localeCompare(b.notification_role)
      || a.display_name.localeCompare(b.display_name));
}
async function getProcureGuardNotificationRecipients(input: {
  requestType: ProcureGuardRequestType;
  country: string | null | undefined;
  approvalStatus: ProcureGuardStatus;
  ownerLabel: string;
}): Promise<ProcureGuardNotificationRecipient[]> {
  const countries = countryRecipientKeys(input.country);
  if (countries.length === 0) return [];

  const countryPlaceholders = countries.map(() => '?').join(', ');
  const rows = await sql<QueryResultRow[]>(
    `SELECT display_name, email, notification_role, approval_status, country, source_column
     FROM procure_guard_notification_recipients
     WHERE is_active = TRUE
       AND email IS NOT NULL
       AND TRIM(email) <> ''
       AND country IN (${countryPlaceholders})
       AND (request_type = ? OR request_type = 'both')
       AND (approval_status = ? OR LOWER(notification_role) = LOWER(?))
     ORDER BY CASE WHEN approval_status = ? THEN 0 ELSE 1 END,
              is_required DESC,
              display_name ASC`,
    [...countries, input.requestType, input.approvalStatus, input.ownerLabel, input.approvalStatus],
  );

  const seen = new Set<string>();
  return serialise<ProcureGuardNotificationRecipient[]>(rows)
    .filter(row => {
      const key = row.email.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildProcureGuardNotificationEmail(input: {
  event: ProcureGuardWorkflowEvent;
  requestType: ProcureGuardRequestType;
  request: ProcureGuardWebhookRequest;
  detailUrl: string;
  ownerLabel: string;
  nextStatus: ProcureGuardStatus | null;
  actor: ProcureGuardActor;
  previousStatus?: ProcureGuardStatus | null;
  comment?: string | null;
}) {
  const typeLabel = input.requestType === 'adhoc' ? 'ADHOC payment' : 'Advance payment';
  const actionLabel = input.event === 'request.submitted' ? 'New request submitted' : 'Request moved forward';
  const subject = `ProcureGuard: ${input.request.reference_number} needs ${input.ownerLabel} review`;
  const comment = input.comment || input.request.requester_comments || '';
  const statusLine = input.previousStatus
    ? `${formatProcureGuardStatusLabel(input.previousStatus)} -> ${formatProcureGuardStatusLabel(input.request.status)}`
    : formatProcureGuardStatusLabel(input.request.status);

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid #006B0C;padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:#006B0C;">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">${escapeHtml(actionLabel)}</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(input.request.reference_number)} needs your review</h2>
      <p style="margin:0 0 20px 0;color:#4b5563;">A ${escapeHtml(typeLabel)} request is waiting for ${escapeHtml(input.ownerLabel)} action.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;width:170px;">Vendor</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.vendor_name)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Amount</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatWebhookAmount(input.request.amount, input.request.currency))}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Country</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.country || 'Unspecified')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Status</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(statusLine)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Next action</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.nextStatus ? formatProcureGuardStatusLabel(input.nextStatus) : 'Review decision')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Requester</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.requested_by_name || input.request.requested_by_email)}</td></tr>
      </table>
      ${comment ? `<div style="background:#f9fafb;border-left:4px solid #006B0C;padding:12px 14px;margin-bottom:22px;"><div style="font-weight:600;margin-bottom:6px;">Comment</div><div style="white-space:pre-wrap;color:#374151;">${escapeHtml(comment)}</div></div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(input.detailUrl)}" style="display:inline-block;background:#006B0C;color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;">Open request</a>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">
        Triggered by ${escapeHtml(input.actor.name || input.actor.email)}. This message was generated by the ProcureGuard workflow.
      </div>
    </div>
  `;

  return { subject, bodyHtml };
}

function isRequesterAcceptedStage(status: ProcureGuardStatus): boolean {
  return status !== 'Rejected' && status !== 'Cancelled';
}

function buildProcureGuardRequesterStageEmail(input: {
  requestType: ProcureGuardRequestType;
  request: ProcureGuardWebhookRequest;
  detailUrl: string;
  actor: ProcureGuardActor;
  ownerLabel: string;
  nextStatus: ProcureGuardStatus | null;
  previousStatus?: ProcureGuardStatus | null;
  comment?: string | null;
}) {
  const typeLabel = input.requestType === 'adhoc' ? 'ADHOC payment' : 'Advance payment';
  const statusLine = input.previousStatus
    ? `${formatProcureGuardStatusLabel(input.previousStatus)} -> ${formatProcureGuardStatusLabel(input.request.status)}`
    : formatProcureGuardStatusLabel(input.request.status);
  const nextLine = input.nextStatus
    ? `It is now waiting for ${input.ownerLabel}.`
    : 'The approval workflow is complete.';
  const comment = input.comment || '';
  const subject = `ProcureGuard: ${input.request.reference_number} moved to ${formatProcureGuardStatusLabel(input.request.status)}`;

  const bodyHtml = `
    <div style="font-family:Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;color:#1f2937;">
      <div style="border-bottom:3px solid #006B0C;padding-bottom:14px;margin-bottom:22px;">
        <div style="font-size:19px;font-weight:700;color:#006B0C;">NESR ProcureGuard</div>
        <div style="font-size:12px;color:#6b7280;margin-top:4px;">Requester status update</div>
      </div>
      <h2 style="margin:0 0 8px 0;color:#111827;">${escapeHtml(input.request.reference_number)} has moved forward</h2>
      <p style="margin:0 0 20px 0;color:#4b5563;">Your ${escapeHtml(typeLabel)} request changed stage. ${escapeHtml(nextLine)}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:22px;">
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;width:170px;">Vendor</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.vendor_name)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Amount</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(formatWebhookAmount(input.request.amount, input.request.currency))}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Country</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.request.country || 'Unspecified')}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Status</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(statusLine)}</td></tr>
        <tr><td style="padding:9px;border-bottom:1px solid #e5e7eb;font-weight:600;">Next step</td><td style="padding:9px;border-bottom:1px solid #e5e7eb;">${escapeHtml(input.nextStatus ? formatProcureGuardStatusLabel(input.nextStatus) : 'Approved')}</td></tr>
      </table>
      ${comment ? `<div style="background:#f9fafb;border-left:4px solid #006B0C;padding:12px 14px;margin-bottom:22px;"><div style="font-weight:600;margin-bottom:6px;">Reviewer comment</div><div style="white-space:pre-wrap;color:#374151;">${escapeHtml(comment)}</div></div>` : ''}
      <div style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(input.detailUrl)}" style="display:inline-block;background:#006B0C;color:#ffffff;padding:12px 26px;border-radius:6px;text-decoration:none;font-weight:700;">Open request</a>
      </div>
      <div style="border-top:1px solid #e5e7eb;padding-top:14px;font-size:12px;color:#6b7280;">
        Updated by ${escapeHtml(input.actor.name || input.actor.email)}. This message was generated by the ProcureGuard workflow.
      </div>
    </div>
  `;

  return { subject, bodyHtml };
}

async function postProcureGuardWebhook(
  webhookUrl: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ ok: boolean; status: number; statusText: string }> {
  const url = new URL(stripEnvQuotes(webhookUrl));
  const body = JSON.stringify(payload);
  const isHttps = url.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const request = (isHttps ? httpsRequest : httpRequest)({
      method: 'POST',
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      path: `${url.pathname}${url.search}`,
      headers: {
        ...headers,
        'Content-Length': Buffer.byteLength(body),
      },
      rejectUnauthorized: isHttps ? false : undefined,
    }, response => {
      response.resume();
      response.on('end', () => {
        const status = response.statusCode ?? 0;
        resolve({
          ok: status >= 200 && status < 300,
          status,
          statusText: response.statusMessage ?? '',
        });
      });
    });

    request.setTimeout(15000, () => {
      request.destroy(new Error('ProcureGuard n8n webhook timed out.'));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
async function notifyProcureGuardNextApprover(input: {
  event: ProcureGuardWorkflowEvent;
  requestType: ProcureGuardRequestType;
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments';
  requestId: number;
  actor: ProcureGuardActor;
  previousStatus?: ProcureGuardStatus | null;
  comment?: string | null;
}): Promise<void> {
  const webhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn('[ProcureGuard n8n] N8N_PROCUREGUARD_WEBHOOK_URL is not configured; skipping webhook notification.');
    return;
  }

  try {
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM ${input.table} WHERE id = ? LIMIT 1`, [input.requestId]);
    const request = rows[0] ? serialise<ProcureGuardWebhookRequest>(rows[0]) : null;
    if (!request) return;

    const thresholdAmount = request.spend_value_usd ?? request.amount;
    const thresholdCurrency = request.spend_value_usd === null || request.spend_value_usd === undefined ? request.currency : 'USD';
    const adminPermissions = getPermissionProfile('Admin');
    const actions = getProcureGuardAvailableActions(
      adminPermissions,
      input.requestType,
      request.status,
      thresholdAmount,
      thresholdCurrency,
    );
    const detailUrl = getRequestDetailUrl(input.requestType, request.id);
    const requestPayload = {
      id: request.id,
      reference_number: request.reference_number,
      requisition_number: request.requisition_number,
      status: request.status,
      previous_status: input.previousStatus ?? null,
      priority: request.priority,
      vendor_name: request.vendor_name,
      amount: request.amount,
      currency: request.currency,
      amount_usd: toUsd(thresholdAmount, thresholdCurrency),
      country: request.country,
      segment: request.segment,
      spend_category: request.spend_category,
      requested_by_name: request.requested_by_name,
      requested_by_email: request.requested_by_email,
      requester_notification_emails: requesterNotificationEmailsOf(request),
      requester_comments: request.requester_comments,
      created_at: request.created_at,
      updated_at: request.updated_at,
      detail_url: detailUrl,
    };
    const actorPayload = {
      name: input.actor.name,
      email: input.actor.email,
      role: input.actor.role,
    };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-procureguard-secret'] = secret;

    if (
      input.event === 'request.status_changed'
      && isRequesterAcceptedStage(request.status)
      && request.requested_by_email?.trim()
    ) {
      const requesterEmail = buildProcureGuardRequesterStageEmail({
        requestType: input.requestType,
        request,
        detailUrl,
        ownerLabel: actions.ownerLabel,
        nextStatus: actions.nextStatus,
        actor: input.actor,
        previousStatus: input.previousStatus,
        comment: input.comment,
      });
      const requesterName = request.requested_by_name || request.requested_by_email;
      const requesterSideRecipients = [
        {
          name: requesterName,
          email: request.requested_by_email.trim().toLowerCase(),
          role: 'Requester',
          source_column: 'requested_by_email',
        },
        ...requesterNotificationEmailsOf(request).map(email => ({
          name: email,
          email,
          role: 'Requester notification',
          source_column: 'requester_notification_emails',
        })),
      ];
      const requesterPayload = {
        event: 'request.requester_status_changed' as ProcureGuardWorkflowEvent,
        source: 'procureguard-local',
        occurred_at: new Date().toISOString(),
        request_type: input.requestType,
        request: requestPayload,
        workflow: {
          owner_role: actions.ownerLabel,
          required_permission: actions.requiredPermission,
          decision_status: request.status,
          next_status: actions.nextStatus,
        },
        actor: actorPayload,
        comment: input.comment ?? null,
        recipients: requesterSideRecipients.map(row => ({
          name: row.name,
          email: row.email,
          role: row.role,
          approval_status: null,
          country: request.country,
          source_column: row.source_column,
        })),
        email: {
          subject: requesterEmail.subject,
          body_html: requesterEmail.bodyHtml,
          to: requesterSideRecipients.map(row => row.email),
          to_recipients: requesterSideRecipients.map(row => ({
            emailAddress: { address: row.email, name: row.name },
          })),
        },
      };

      const requesterResponse = await postProcureGuardWebhook(webhookUrl, headers, requesterPayload);
      if (!requesterResponse.ok) {
        console.error('[ProcureGuard n8n] Requester webhook failed', requesterResponse.status, requesterResponse.statusText);
      } else {
        console.log('[ProcureGuard n8n] Requester webhook sent', {
          requestType: input.requestType,
          requestId: input.requestId,
          status: requesterResponse.status,
        });
      }
    }

    const recipientApprovalStatus = getRecipientApprovalStatus(input.requestType, request);
    if (!recipientApprovalStatus) return;

    if (!actions.requiredPermission) return;

    const recipients = await getProcureGuardNotificationRecipients({
      requestType: input.requestType,
      country: request.country,
      approvalStatus: recipientApprovalStatus,
      ownerLabel: actions.ownerLabel,
    });

    if (recipients.length === 0) {
      console.warn('[ProcureGuard n8n] No notification recipients found', {
        requestType: input.requestType,
        requestId: input.requestId,
        country: request.country,
        approvalStatus: recipientApprovalStatus,
        ownerLabel: actions.ownerLabel,
      });
    }

    const email = buildProcureGuardNotificationEmail({
      event: input.event,
      requestType: input.requestType,
      request,
      detailUrl,
      ownerLabel: actions.ownerLabel,
      nextStatus: actions.nextStatus,
      actor: input.actor,
      previousStatus: input.previousStatus,
      comment: input.comment,
    });

    const payload = {
      event: input.event,
      source: 'procureguard-local',
      occurred_at: new Date().toISOString(),
      request_type: input.requestType,
      request: requestPayload,
      workflow: {
        owner_role: actions.ownerLabel,
        required_permission: actions.requiredPermission,
        decision_status: recipientApprovalStatus,
        next_status: actions.nextStatus,
      },
      actor: actorPayload,
      comment: input.comment ?? null,
      recipients: recipients.map(row => ({
        name: row.display_name,
        email: row.email,
        role: row.notification_role,
        approval_status: row.approval_status,
        country: row.country,
        source_column: row.source_column,
      })),
      email: {
        subject: email.subject,
        body_html: email.bodyHtml,
        to: recipients.map(row => row.email),
        to_recipients: recipients.map(row => ({
          emailAddress: { address: row.email, name: row.display_name },
        })),
      },
    };

    const response = await postProcureGuardWebhook(webhookUrl, headers, payload);

    if (!response.ok) {
      console.error('[ProcureGuard n8n] Webhook failed', response.status, response.statusText);
    } else {
      console.log('[ProcureGuard n8n] Webhook sent', {
        requestType: input.requestType,
        requestId: input.requestId,
        recipientCount: recipients.length,
        status: response.status,
      });
    }
  } catch (err) {
    console.error('[ProcureGuard n8n] Webhook notification failed', procureGuardWebhookErrorMessage(err), err);
  }
}

function buildReviewDurationMetrics(
  adhoc: AdhocPaymentRequest[],
  advance: AdvancePaymentRequest[],
): ProcureGuardReviewDurationMetric[] {
  const nowMs = Date.now();
  const adminPermissions = getPermissionProfile('Admin');
  const groups = new Map<string, ReviewDurationDraft>();

  for (const row of [
    ...adhoc.map(request => ({ requestType: 'adhoc' as const, request })),
    ...advance.map(request => ({ requestType: 'advance' as const, request })),
  ]) {
    if (!isActiveApprovalStatus(row.request.status)) continue;

    const actions = getProcureGuardAvailableActions(
      adminPermissions,
      row.requestType,
      row.request.status,
      row.request.amount,
      row.request.currency,
    );
    const enteredAt = row.request.updated_at || row.request.created_at;
    const stuckHours = hoursBetween(enteredAt, nowMs);
    const groupKey = `${row.requestType}:${row.request.status}:${actions.ownerLabel}`;
    const enteredAtMs = new Date(enteredAt).getTime();
    const current = groups.get(groupKey) ?? {
      request_type: row.requestType,
      status: row.request.status,
      owner_label: actions.ownerLabel,
      count: 0,
      average_hours: 0,
      total_hours: 0,
      longest_hours: 0,
      oldest_request_id: row.request.id,
      oldest_reference_number: row.request.reference_number,
      oldest_vendor_name: row.request.vendor_name,
      oldest_updated_at: enteredAt,
      longestUpdatedAtMs: Number.isNaN(enteredAtMs) ? nowMs : enteredAtMs,
    };

    current.count += 1;
    current.total_hours += stuckHours;

    if (stuckHours >= current.longest_hours) {
      current.longest_hours = stuckHours;
      current.oldest_request_id = row.request.id;
      current.oldest_reference_number = row.request.reference_number;
      current.oldest_vendor_name = row.request.vendor_name;
      current.oldest_updated_at = enteredAt;
      current.longestUpdatedAtMs = Number.isNaN(enteredAtMs) ? current.longestUpdatedAtMs : enteredAtMs;
    }

    groups.set(groupKey, current);
  }

  return [...groups.values()]
    .map(row => ({
      request_type: row.request_type,
      status: row.status,
      owner_label: row.owner_label,
      count: row.count,
      average_hours: row.count ? row.total_hours / row.count : 0,
      total_hours: row.total_hours,
      longest_hours: row.longest_hours,
      oldest_request_id: row.oldest_request_id,
      oldest_reference_number: row.oldest_reference_number,
      oldest_vendor_name: row.oldest_vendor_name,
      oldest_updated_at: row.oldest_updated_at,
    }))
    .sort((a, b) => b.total_hours - a.total_hours || b.average_hours - a.average_hours || a.owner_label.localeCompare(b.owner_label));
}

function buildStats(adhoc: AdhocPaymentRequest[], advance: AdvancePaymentRequest[]) {
  const all = [...adhoc, ...advance];
  const totalAmount = all.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0);
  return {
    adhoc_total: adhoc.length,
    advance_total: advance.length,
    pending_review: all.filter(r => isActiveApprovalStatus(r.status)).length,
    approved: all.filter(r => r.status === 'Approved').length,
    rejected: all.filter(r => r.status === 'Rejected').length,
    total_requested_amount: totalAmount,
    adhoc_requested_amount: adhoc.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0),
    advance_requested_amount: advance.reduce((sum, r) => sum + toUsd(r.amount, r.currency), 0),
    average_request_amount: all.length ? totalAmount / all.length : 0,
    active_vendor_count: new Set(all.map(r => r.vendor_name.trim().toLowerCase()).filter(Boolean)).size,
    active_requester_count: new Set(all.map(r => r.requested_by_email.trim().toLowerCase()).filter(Boolean)).size,
  };
}

async function writeActivity(input: {
  requestType: 'adhoc' | 'advance';
  requestId: number;
  referenceNumber: string;
  action: string;
  actor: ProcureGuardActor;
  notes?: string | null;
}) {
  await exec(
    `INSERT INTO procure_guard_activity_log
      (request_type, request_id, reference_number, action, actor_name, actor_email, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.requestType,
      input.requestId,
      input.referenceNumber,
      input.action,
      input.actor.name,
      input.actor.email,
      input.notes ?? null,
    ],
  );
}

export async function getAdhocPayments(): Promise<AdhocPaymentRequest[] | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    await ensureProcureGuardPaymentRequestColumns();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_adhoc_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(rows));
  } catch (err) {
    console.error('[getAdhocPayments]', err);
    return null;
  }
}

export async function getAdhocPaymentsData(): Promise<ProcureGuardRequestListData<AdhocPaymentRequest> | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_adhoc_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return { actor, requests: normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(rows)) };
  } catch (err) {
    console.error('[getAdhocPaymentsData]', err);
    return null;
  }
}

export async function getAdvancePaymentRequestsData(): Promise<ProcureGuardRequestListData<AdvancePaymentRequest> | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_advance_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return { actor, requests: normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(rows)) };
  } catch (err) {
    console.error('[getAdvancePaymentRequestsData]', err);
    return null;
  }
}

export async function getAdvancePaymentRequests(): Promise<AdvancePaymentRequest[] | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM procure_guard_advance_payments
       ${scope.where}
       ORDER BY created_at DESC`,
      scope.params,
    );
    return normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(rows));
  } catch (err) {
    console.error('[getAdvancePaymentRequests]', err);
    return null;
  }
}

export async function getProcureGuardWorkQueueData(): Promise<ProcureGuardWorkQueueData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardReviewerQueueAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const scope = scopedWhere(actor);
    const [adhocRows, advanceRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments ${scope.where} ORDER BY created_at DESC`, scope.params),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments ${scope.where} ORDER BY created_at DESC`, scope.params),
    ]);
    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    const items = [
      ...adhoc.map(request => ({
        request_type: 'adhoc' as const,
        request,
        actions: getScopedProcureGuardAvailableActions(actor, 'adhoc', request),
      })),
      ...advance.map(request => ({
        request_type: 'advance' as const,
        request,
        actions: getScopedProcureGuardAvailableActions(actor, 'advance', request),
      })),
    ]
      .filter(item => item.actions.canApprove || item.actions.canReject)
      .sort((a, b) => {
        const priorityRank: Record<string, number> = { Critical: 0, High: 1, Normal: 2, Low: 3 };
        return (priorityRank[a.request.priority] ?? 2) - (priorityRank[b.request.priority] ?? 2)
          || new Date(a.request.created_at).getTime() - new Date(b.request.created_at).getTime();
      });

    return {
      actor,
      items,
      stats: {
        total: items.length,
        adhoc: items.filter(item => item.request_type === 'adhoc').length,
        advance: items.filter(item => item.request_type === 'advance').length,
        approval: items.filter(item => item.actions.canApprove || item.actions.canReject).length,
      },
    };
  } catch (err) {
    console.error('[getProcureGuardWorkQueueData]', err);
    return null;
  }
}
export async function getProcureGuardNotificationPreview(input: {
  requestType: ProcureGuardRequestType;
  country?: string;
  amount?: number | string | null;
  currency?: string | null;
}): Promise<ProcureGuardNotificationContact[]> {
  try {
    return await getProcureGuardNotificationContactPreviewRows({
      requestType: input.requestType,
      country: input.country,
      amount: input.amount,
      currency: input.currency || 'USD',
    });
  } catch (err) {
    console.error('[getProcureGuardNotificationPreview]', err);
    return [];
  }
}
export async function getProcureGuardRequestDetail(
  requestType: ProcureGuardRequestType,
  id: number,
): Promise<ProcureGuardRequestDetailData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const table = requestType === 'adhoc'
      ? 'procure_guard_adhoc_payments'
      : 'procure_guard_advance_payments';
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM ${table} WHERE id = ? LIMIT 1`,
      [id],
    );

    if (!rows[0]) return null;

    const request = normalisePaymentCountry(serialise<AdhocPaymentRequest | AdvancePaymentRequest>(rows[0]));
    if (!actor.permissions.canViewAll && !actorCanAccessRequesterSideRequest(actor, request)) {
      return null;
    }
    if (actor.permissions.canViewAll && !actorCanAccessRequestScope(actor, request)) {
      return null;
    }

    const [activityRows, documentRows, notificationContacts] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_activity_log
         WHERE request_type = ? AND request_id = ?
         ORDER BY created_at DESC`,
        [requestType, id],
      ),
      sql<QueryResultRow[]>(
        `SELECT id, request_type, request_id, document_name, original_name, document_type, file_type, file_size,
                uploaded_by_name, uploaded_by_email, uploaded_at
         FROM procure_guard_documents
         WHERE request_type = ? AND request_id = ?
         ORDER BY uploaded_at DESC`,
        [requestType, id],
      ),
      getProcureGuardNotificationContactPreviewRows({
        requestType,
        country: request.country,
        amount: request.amount,
        currency: request.currency,
      }),
    ]);

    return {
      actor,
      request_type: requestType,
      request,
      activity: serialise<ProcureGuardActivityRow[]>(activityRows),
      documents: serialise<ProcureGuardDocument[]>(documentRows),
      notification_contacts: notificationContacts,
      actions: getScopedProcureGuardAvailableActions(actor, requestType, request),
    };
  } catch (err) {
    console.error('[getProcureGuardRequestDetail]', err);
    return null;
  }
}

export async function getProcureGuardDashboardData(): Promise<ProcureGuardDashboardData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const scope = scopedWhere(actor);

    const [adhocRows, advanceRows, activityRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments ${scope.where} ORDER BY created_at DESC`, scope.params),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments ${scope.where} ORDER BY created_at DESC`, scope.params),
      sql<QueryResultRow[]>(
        actor.permissions.canViewAll
          ? `SELECT * FROM procure_guard_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 12`
          : `SELECT a.* FROM procure_guard_activity_log a
             LEFT JOIN procure_guard_adhoc_payments ap
               ON a.request_type = 'adhoc' AND a.request_id = ap.id
             LEFT JOIN procure_guard_advance_payments adv
               ON a.request_type = 'advance' AND a.request_id = adv.id
             WHERE (
                 LOWER(ap.requested_by_email) = ?
                 OR ? = ANY(COALESCE(ap.requester_notification_emails, ARRAY[]::TEXT[]))
                 OR LOWER(adv.requested_by_email) = ?
                 OR ? = ANY(COALESCE(adv.requester_notification_emails, ARRAY[]::TEXT[]))
               )
               AND a.request_id > 0
               AND a.action NOT ILIKE '%seeded%'
             ORDER BY a.created_at DESC LIMIT 12`,
        actor.permissions.canViewAll ? [] : [actor.email.toLowerCase(), actor.email.toLowerCase(), actor.email.toLowerCase(), actor.email.toLowerCase()],
      ),
    ]);

    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    return {
      stats: buildStats(adhoc, advance),
      adhoc,
      advance,
      activity: serialise<ProcureGuardActivityRow[]>(activityRows),
      actor,
    };
  } catch (err) {
    console.error('[getProcureGuardDashboardData]', err);
    return null;
  }
}

export async function getProcureGuardAdminData(): Promise<ProcureGuardAdminData | null> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardPaymentRequestColumns();
    await syncProcureGuardRecipientAccessApprovals();
    const [adhocRows, advanceRows, activityRows, permissionRows, notificationRecipientRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments ORDER BY created_at DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments ORDER BY created_at DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 100`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_permissions ORDER BY role, email`),
      sql<QueryResultRow[]>(
        `SELECT id, country, request_type, notification_role, approval_status, source_column, display_name,
                COALESCE(email, '') AS email
         FROM procure_guard_notification_recipients
         ORDER BY country, request_type, approval_status NULLS LAST, notification_role, display_name`,
      ),
    ]);

    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    const permissions = normalisePaymentCountries(serialise<ProcureGuardPermissionRow[]>(permissionRows));
    return {
      actor,
      adhoc,
      advance,
      activity: serialise<ProcureGuardActivityRow[]>(activityRows),
      permissions,
      notification_recipients: serialise<ProcureGuardNotificationContact[]>(notificationRecipientRows),
      stats: buildStats(adhoc, advance),
    };
  } catch (err) {
    console.error('[getProcureGuardAdminData]', err);
    return null;
  }
}

export async function getProcureGuardAnalyticsData(): Promise<ProcureGuardAnalyticsData | null> {
  try {
    const actor = await getActor();
    requireProcureGuardAnalyticsAccess(actor);
    const [adhocRows, advanceRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments ORDER BY created_at DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments ORDER BY created_at DESC`),
    ]);

    const adhoc = normalisePaymentCountries(serialise<AdhocPaymentRequest[]>(adhocRows));
    const advance = normalisePaymentCountries(serialise<AdvancePaymentRequest[]>(advanceRows));
    const all = [...adhoc, ...advance];

    const adhocVendors = new Map<string, ProcureGuardAnalyticsMetric>();
    const advanceVendors = new Map<string, ProcureGuardAnalyticsMetric>();
    const statusBreakdown = new Map<string, ProcureGuardAnalyticsMetric>();
    const priorityBreakdown = new Map<string, ProcureGuardAnalyticsMetric>();
    const requesters = new Map<string, ProcureGuardAnalyticsMetric>();
    const vendorTotals = new Map<string, ProcureGuardVendorMetric>();
    const monthly = new Map<string, ProcureGuardMonthlyMetric>();

    for (const row of adhoc) {
      const amount = toUsd(row.amount, row.currency);
      addMetric(adhocVendors, row.vendor_name, amount);
      addMetric(statusBreakdown, row.status, amount);
      addMetric(priorityBreakdown, row.priority, amount);
      addMetric(requesters, row.requested_by_email, amount);

      const vendorKey = row.vendor_name.trim() || 'Unspecified';
      const vendor = vendorTotals.get(vendorKey) ?? {
        label: vendorKey,
        count: 0,
        amount: 0,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
      };
      vendor.count += 1;
      vendor.amount += amount;
      vendor.adhoc_count += 1;
      vendor.adhoc_amount += amount;
      vendorTotals.set(vendorKey, vendor);

      const monthKey = requestMonth(row.created_at);
      const month = monthly.get(monthKey) ?? {
        month: monthKey,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
        total_count: 0,
        total_amount: 0,
      };
      month.adhoc_count += 1;
      month.adhoc_amount += amount;
      month.total_count += 1;
      month.total_amount += amount;
      monthly.set(monthKey, month);
    }

    for (const row of advance) {
      const amount = toUsd(row.amount, row.currency);
      addMetric(advanceVendors, row.vendor_name, amount);
      addMetric(statusBreakdown, row.status, amount);
      addMetric(priorityBreakdown, row.priority, amount);
      addMetric(requesters, row.requested_by_email, amount);

      const vendorKey = row.vendor_name.trim() || 'Unspecified';
      const vendor = vendorTotals.get(vendorKey) ?? {
        label: vendorKey,
        count: 0,
        amount: 0,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
      };
      vendor.count += 1;
      vendor.amount += amount;
      vendor.advance_count += 1;
      vendor.advance_amount += amount;
      vendorTotals.set(vendorKey, vendor);

      const monthKey = requestMonth(row.created_at);
      const month = monthly.get(monthKey) ?? {
        month: monthKey,
        adhoc_count: 0,
        adhoc_amount: 0,
        advance_count: 0,
        advance_amount: 0,
        total_count: 0,
        total_amount: 0,
      };
      month.advance_count += 1;
      month.advance_amount += amount;
      month.total_count += 1;
      month.total_amount += amount;
      monthly.set(monthKey, month);
    }

    const highValueOpenRequests: ProcureGuardHighValueRequest[] = all
      .filter(row => isActiveApprovalStatus(row.status))
      .map(row => {
        const requestType: ProcureGuardRequestType = 'contract_reference' in row ? 'advance' : 'adhoc';
        return {
          id: row.id,
          request_type: requestType,
          reference_number: row.reference_number,
          vendor_name: row.vendor_name,
          status: row.status,
          amount: Number(row.amount || 0),
          amount_usd: toUsd(row.amount, row.currency),
          currency: row.currency,
          created_at: row.created_at,
        };
      })
      .sort((a, b) => b.amount_usd - a.amount_usd)
      .slice(0, 8);

    return {
      actor,
      stats: buildStats(adhoc, advance),
      top_vendors: [...vendorTotals.values()]
        .sort((a, b) => b.count - a.count || b.amount - a.amount)
        .slice(0, 10),
      top_adhoc_vendors: topMetrics(adhocVendors, 10),
      top_advance_vendors: topMetrics(advanceVendors, 10),
      status_breakdown: topMetrics(statusBreakdown, STATUS_SORT_ORDER.length),
      priority_breakdown: topMetrics(priorityBreakdown, PRIORITY_SORT_ORDER.length),
      requester_breakdown: topMetrics(requesters, 10),
      monthly_trend: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
      review_duration_metrics: buildReviewDurationMetrics(adhoc, advance),
      high_value_open_requests: highValueOpenRequests,
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[getProcureGuardAnalyticsData]', err);
    return null;
  }
}

export async function getProcureGuardAdminAnalyticsData(): Promise<ProcureGuardAdminAnalyticsData | null> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardUsageTables();

    const windowWhere = `occurred_at >= NOW() - INTERVAL '30 days'`;
    const [summaryRows, pageRows, clickRows, userRows, recentRows, pendingRows] = await Promise.all([
      sql<QueryResultRow[]>(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(DISTINCT session_id)::int AS sessions,
          COUNT(DISTINCT user_email)::int AS users,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'page_view'))::int, 0) AS average_page_duration_ms,
          COALESCE(SUM(duration_ms) FILTER (WHERE event_type = 'page_view'), 0)::int AS total_page_duration_ms,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'click'))::int, 0) AS average_click_delay_ms
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
      `),
      sql<QueryResultRow[]>(`
        SELECT
          path,
          COALESCE(NULLIF(MAX(page_title), ''), path) AS page_title,
          COUNT(*)::int AS views,
          COUNT(DISTINCT session_id)::int AS sessions,
          COALESCE(ROUND(AVG(duration_ms))::int, 0) AS average_duration_ms,
          COALESCE(SUM(duration_ms), 0)::int AS total_duration_ms,
          COALESCE(MAX(duration_ms), 0)::int AS longest_duration_ms
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
          AND event_type = 'page_view'
        GROUP BY path
        ORDER BY total_duration_ms DESC, views DESC, path ASC
        LIMIT 20
      `),
      sql<QueryResultRow[]>(`
        WITH click_labels AS (
          SELECT
            path,
            target_tag,
            target_href,
            LEFT(COALESCE(NULLIF(TRIM(target_text), ''), NULLIF(TRIM(target_href), ''), NULLIF(TRIM(target_role), ''), NULLIF(TRIM(target_tag), ''), 'Unknown click'), 180) AS target_label,
            user_email,
            duration_ms
          FROM procure_guard_usage_events
          WHERE ${windowWhere}
            AND event_type = 'click'
        )
        SELECT
          target_label,
          COALESCE(target_tag, '') AS target_tag,
          target_href,
          path,
          COUNT(*)::int AS clicks,
          COUNT(DISTINCT user_email)::int AS users,
          COALESCE(ROUND(AVG(duration_ms))::int, 0) AS average_click_delay_ms,
          COALESCE(MAX(duration_ms), 0)::int AS slowest_click_delay_ms
        FROM click_labels
        GROUP BY target_label, target_tag, target_href, path
        ORDER BY clicks DESC, average_click_delay_ms DESC, target_label ASC
        LIMIT 30
      `),
      sql<QueryResultRow[]>(`
        SELECT
          COALESCE(user_email, 'Unknown') AS user_email,
          COALESCE(MAX(user_name), COALESCE(user_email, 'Unknown')) AS user_name,
          COUNT(*) FILTER (WHERE event_type = 'page_view')::int AS page_views,
          COUNT(*) FILTER (WHERE event_type = 'click')::int AS clicks,
          COUNT(DISTINCT session_id)::int AS sessions,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'page_view'))::int, 0) AS average_page_duration_ms,
          COALESCE(ROUND(AVG(duration_ms) FILTER (WHERE event_type = 'click'))::int, 0) AS average_click_delay_ms,
          MAX(occurred_at) AS last_seen_at
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
        GROUP BY user_email
        ORDER BY last_seen_at DESC
        LIMIT 25
      `),
      sql<QueryResultRow[]>(`
        SELECT id::int AS id, event_type, user_email, user_name, path, page_title, target_text, target_href, duration_ms, occurred_at
        FROM procure_guard_usage_events
        WHERE ${windowWhere}
        ORDER BY occurred_at DESC
        LIMIT 50
      `),
      sql<QueryResultRow[]>(`
        SELECT (
          (SELECT COUNT(*) FROM procure_guard_adhoc_payments WHERE status IN ('Submitted', 'Under Review', 'Approved by SCM')) +
          (SELECT COUNT(*) FROM procure_guard_advance_payments WHERE status IN ('Submitted', 'Under Review', 'Approved by Country Controller', 'Approved by Supply Chain Director', 'Approved by Treasury Director', 'Approved by Corporate Controller'))
        )::int AS pending_review
      `),
    ]);

    return {
      actor,
      pending_review: Number(pendingRows[0]?.pending_review ?? 0),
      summary: serialise<ProcureGuardAdminAnalyticsData['summary']>(summaryRows[0] ?? {
        page_views: 0,
        clicks: 0,
        sessions: 0,
        users: 0,
        average_page_duration_ms: 0,
        total_page_duration_ms: 0,
        average_click_delay_ms: 0,
      }),
      page_metrics: serialise<ProcureGuardAdminAnalyticsData['page_metrics']>(pageRows),
      click_metrics: serialise<ProcureGuardAdminAnalyticsData['click_metrics']>(clickRows),
      user_metrics: serialise<ProcureGuardAdminAnalyticsData['user_metrics']>(userRows),
      recent_events: serialise<ProcureGuardAdminAnalyticsData['recent_events']>(recentRows),
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[getProcureGuardAdminAnalyticsData]', err);
    return null;
  }
}

export async function createAdhocPayment(input: CreateAdhocPaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    if (!actor.permissions.canCreateRequests) throw new Error('Request creation access is required.');
    await ensureProcureGuardPaymentRequestColumns();
    const amount = validateMoney(input.amount);
    const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
    const country = requireCountryOption(input.country);
    const segment = requireText(input.segment, 'Segment');
    const vendorName = requireText(input.vendor_name, 'ADHOC vendor name');
    const vendorTaxId = requireText(input.vendor_tax_id, 'Vendor tax ID');
    const spendCategory = requireText(input.spend_category, 'Spend category');
    const reason = requireText(input.payment_reason || input.justification, 'Reason / justification of exception');
    if (!input.acknowledged) throw new Error('Acknowledgement is required.');
    const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, actor.email);

    const reference = makeReference('ADH');
    const result = await exec(
      `INSERT INTO procure_guard_adhoc_payments
        (reference_number, requisition_number, status, priority, vendor_name, vendor_code, vendor_tax_id, supplier_email,
         amount, currency, country, segment, department, business_unit, cost_center, project_code,
         po_number, invoice_number, due_date, expense_category, spend_category, spend_value_usd, payment_method,
         payment_reason, justification, notes, attachment_link, cc_email, requester_notification_emails, acknowledged_at,
         requested_by_name, requested_by_email)
       VALUES (?, ?, 'Submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?) RETURNING id`,
      [
        reference,
        requisitionNumber,
        input.priority || 'Normal',
        vendorName,
        blankToNull(input.vendor_code || vendorTaxId),
        vendorTaxId,
        blankToNull(input.supplier_email),
        amount,
        input.currency || 'USD',
        country,
        segment,
        blankToNull(input.department ?? actor.department),
        blankToNull(input.business_unit),
        blankToNull(input.cost_center),
        blankToNull(input.project_code),
        blankToNull(input.po_number),
        blankToNull(input.invoice_number),
        blankToNull(input.due_date),
        blankToNull(input.expense_category),
        spendCategory,
        input.spend_value_usd ?? amount,
        blankToNull(input.payment_method),
        reason,
        (input.justification || reason).trim(),
        blankToNull(input.notes),
        blankToNull(input.attachment_link),
        null,
        requesterNotificationEmails,
        actor.name,
        actor.email,
      ],
    );
    await exec(
      `UPDATE procure_guard_adhoc_payments
       SET requester_comments = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [blankToNull(input.requester_comments ?? input.notes), result.insertId],
    );


    await writeActivity({
      requestType: 'adhoc',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Adhoc payment submitted',
      actor,
    });

    await notifyProcureGuardNextApprover({
      event: 'request.submitted',
      requestType: 'adhoc',
      table: 'procure_guard_adhoc_payments',
      requestId: result.insertId,
      actor,
      comment: input.requester_comments ?? input.notes ?? null,
    });

    revalidatePath('/procure-guard');
    revalidatePath('/procure-guard/adhoc-payments');
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    console.error('[createAdhocPayment]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create adhoc payment request.' };
  }
}

export async function createAdvancePayment(input: CreateAdvancePaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    if (!actor.permissions.canCreateRequests) throw new Error('Request creation access is required.');
    await ensureProcureGuardPaymentRequestColumns();
    const amount = validateMoney(input.amount);
    const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
    const country = requireCountryOption(input.country);
    const segment = requireText(input.segment, 'Segment');
    const sapVendorId = requireText(input.sap_vendor_id || input.vendor_code, 'SAP vendor ID');
    const vendorName = requireText(input.vendor_name, 'SAP vendor name');
    const spendCategory = requireText(input.spend_category, 'Spend category');
    const paymentTermsDays = validateNonNegativeNumber(input.current_payment_terms_days, 'Current payment terms in days');
    const creditLimitUsd = validateNonNegativeNumber(input.current_credit_limit_usd, 'Current credit limit in USD');
    const reason = requireText(input.advance_purpose || input.justification, 'Reason / justification for exception');
    const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, actor.email);

    const contractValue = input.contract_value === undefined || input.contract_value === null || Number.isNaN(Number(input.contract_value))
      ? null
      : Number(input.contract_value);
    const advancePercentage = input.advance_percentage === undefined || input.advance_percentage === null || Number.isNaN(Number(input.advance_percentage))
      ? null
      : Number(input.advance_percentage);

    const reference = makeReference('ADV');
    const result = await exec(
      `INSERT INTO procure_guard_advance_payments
        (reference_number, requisition_number, status, priority, vendor_name, vendor_code, sap_vendor_id, supplier_email,
         amount, currency, country, segment, department, business_unit, cost_center, project_code,
         contract_reference, po_number, contract_value, advance_percentage, spend_category, spend_value_usd,
         current_payment_terms_days, current_credit_limit_usd,
         expected_invoice_date, expected_settlement_date, recovery_method,
         advance_purpose, justification, notes, attachment_link, cc_email, requester_notification_emails,
         requested_by_name, requested_by_email)
       VALUES (?, ?, 'Submitted', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        reference,
        requisitionNumber,
        input.priority || 'Normal',
        vendorName,
        sapVendorId,
        sapVendorId,
        blankToNull(input.supplier_email),
        amount,
        input.currency || 'USD',
        country,
        segment,
        blankToNull(input.department ?? actor.department),
        blankToNull(input.business_unit),
        blankToNull(input.cost_center),
        blankToNull(input.project_code),
        blankToNull(input.contract_reference),
        blankToNull(input.po_number),
        contractValue,
        advancePercentage,
        spendCategory,
        input.spend_value_usd ?? amount,
        paymentTermsDays,
        creditLimitUsd,
        blankToNull(input.expected_invoice_date),
        blankToNull(input.expected_settlement_date),
        blankToNull(input.recovery_method),
        reason,
        (input.justification || reason).trim(),
        blankToNull(input.notes),
        blankToNull(input.attachment_link),
        null,
        requesterNotificationEmails,
        actor.name,
        actor.email,
      ],
    );
    await exec(
      `UPDATE procure_guard_advance_payments
       SET requester_comments = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [blankToNull(input.requester_comments ?? input.notes), result.insertId],
    );


    await writeActivity({
      requestType: 'advance',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Advance payment submitted',
      actor,
    });

    await notifyProcureGuardNextApprover({
      event: 'request.submitted',
      requestType: 'advance',
      table: 'procure_guard_advance_payments',
      requestId: result.insertId,
      actor,
      comment: input.requester_comments ?? input.notes ?? null,
    });

    revalidatePath('/procure-guard');
    revalidatePath('/procure-guard/advance-payments');
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    console.error('[createAdvancePayment]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create advance payment request.' };
  }
}

export async function updateAdhocPaymentRequest(id: number, input: CreateAdhocPaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM procure_guard_adhoc_payments WHERE id = ? LIMIT 1`, [id]);
    const existing = rows[0];
    if (!existing) return { success: false, error: 'Request not found.' };
    if (existing.status !== 'Submitted') {
      return { success: false, error: 'This request can only be edited before review starts.' };
    }

    const ownsRequest = String(existing.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    if (!ownsRequest && !actor.permissions.canManageData) {
      return { success: false, error: 'Only the requester can edit this request before review starts.' };
    }

    const amount = validateMoney(input.amount);
    const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
    const country = requireCountryOption(input.country);
    const segment = requireText(input.segment, 'Segment');
    const vendorName = requireText(input.vendor_name, 'ADHOC vendor name');
    const vendorTaxId = requireText(input.vendor_tax_id, 'Vendor tax ID');
    const spendCategory = requireText(input.spend_category, 'Spend category');
    const reason = requireText(input.payment_reason || input.justification, 'Reason / justification of exception');
    if (!input.acknowledged) throw new Error('Acknowledgement is required.');
    const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, existing.requested_by_email);

    await exec(
      `UPDATE procure_guard_adhoc_payments
       SET requisition_number = ?,
           vendor_name = ?,
           vendor_code = ?,
           vendor_tax_id = ?,
           amount = ?,
           currency = ?,
           country = ?,
           segment = ?,
           expense_category = ?,
           spend_category = ?,
           spend_value_usd = ?,
           payment_method = ?,
           payment_reason = ?,
           justification = ?,
           notes = ?,
           requester_comments = ?,
           cc_email = ?,
           requester_notification_emails = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        requisitionNumber,
        vendorName,
        blankToNull(input.vendor_code || vendorTaxId),
        vendorTaxId,
        amount,
        input.currency || 'USD',
        country,
        segment,
        spendCategory,
        spendCategory,
        input.spend_value_usd ?? amount,
        blankToNull(input.payment_method),
        reason,
        (input.justification || reason).trim(),
        blankToNull(input.notes),
        blankToNull(input.requester_comments ?? input.notes),
        null,
        requesterNotificationEmails,
        id,
      ],
    );

    await writeActivity({
      requestType: 'adhoc',
      requestId: id,
      referenceNumber: existing.reference_number,
      action: 'Adhoc payment edited before review',
      actor,
    });

    revalidatePath('/procure-guard');
    revalidatePath('/procure-guard/adhoc-payments');
    revalidatePath(`/procure-guard/adhoc-payments/${id}`);
    return { success: true, data: { id }, reference_number: existing.reference_number };
  } catch (err) {
    console.error('[updateAdhocPaymentRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update adhoc payment request.' };
  }
}

export async function updateAdvancePaymentRequest(id: number, input: CreateAdvancePaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    await ensureProcureGuardPaymentRequestColumns();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM procure_guard_advance_payments WHERE id = ? LIMIT 1`, [id]);
    const existing = rows[0];
    if (!existing) return { success: false, error: 'Request not found.' };
    if (existing.status !== 'Submitted') {
      return { success: false, error: 'This request can only be edited before review starts.' };
    }

    const ownsRequest = String(existing.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    if (!ownsRequest && !actor.permissions.canManageData) {
      return { success: false, error: 'Only the requester can edit this request before review starts.' };
    }

    const amount = validateMoney(input.amount);
    const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
    const country = requireCountryOption(input.country);
    const segment = requireText(input.segment, 'Segment');
    const sapVendorId = requireText(input.sap_vendor_id || input.vendor_code, 'SAP vendor ID');
    const vendorName = requireText(input.vendor_name, 'SAP vendor name');
    const spendCategory = requireText(input.spend_category, 'Spend category');
    const paymentTermsDays = validateNonNegativeNumber(input.current_payment_terms_days, 'Current payment terms in days');
    const creditLimitUsd = validateNonNegativeNumber(input.current_credit_limit_usd, 'Current credit limit in USD');
    const reason = requireText(input.advance_purpose || input.justification, 'Reason / justification for exception');
    const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, existing.requested_by_email);

    await exec(
      `UPDATE procure_guard_advance_payments
       SET requisition_number = ?,
           vendor_name = ?,
           vendor_code = ?,
           sap_vendor_id = ?,
           amount = ?,
           currency = ?,
           country = ?,
           segment = ?,
           spend_category = ?,
           spend_value_usd = ?,
           current_payment_terms_days = ?,
           current_credit_limit_usd = ?,
           advance_purpose = ?,
           justification = ?,
           notes = ?,
           requester_comments = ?,
           cc_email = ?,
           requester_notification_emails = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        requisitionNumber,
        vendorName,
        sapVendorId,
        sapVendorId,
        amount,
        input.currency || 'USD',
        country,
        segment,
        spendCategory,
        input.spend_value_usd ?? amount,
        paymentTermsDays,
        creditLimitUsd,
        reason,
        (input.justification || reason).trim(),
        blankToNull(input.notes),
        blankToNull(input.requester_comments ?? input.notes),
        null,
        requesterNotificationEmails,
        id,
      ],
    );

    await writeActivity({
      requestType: 'advance',
      requestId: id,
      referenceNumber: existing.reference_number,
      action: 'Advance payment edited before review',
      actor,
    });

    revalidatePath('/procure-guard');
    revalidatePath('/procure-guard/advance-payments');
    revalidatePath(`/procure-guard/advance-payments/${id}`);
    return { success: true, data: { id }, reference_number: existing.reference_number };
  } catch (err) {
    console.error('[updateAdvancePaymentRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update advance payment request.' };
  }
}

export async function createAdminAdhocPayment(input: AdminCreateAdhocPaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardPaymentRequestColumns();
    const amount = validateMoney(input.amount);
    const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
    const country = requireCountryOption(input.country);
    const segment = requireText(input.segment, 'Segment');
    const vendorName = requireText(input.vendor_name, 'ADHOC vendor name');
    const vendorTaxId = requireText(input.vendor_tax_id, 'Vendor tax ID');
    const spendCategory = requireText(input.spend_category, 'Spend category');
    const reason = requireText(input.payment_reason || input.justification, 'Reason / justification of exception');

    const reference = makeReference('ADH');
    const requestedByEmail = input.requested_by_email?.trim() || actor.email;
    const requestedByName = input.requested_by_name?.trim() || actor.name;
    const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, requestedByEmail);
    const status = input.status || 'Submitted';
    const result = await exec(
      `INSERT INTO procure_guard_adhoc_payments
        (reference_number, requisition_number, status, priority, vendor_name, vendor_code, vendor_tax_id, supplier_email,
         amount, currency, country, segment, department, business_unit, cost_center, project_code,
         po_number, invoice_number, due_date, expense_category, spend_category, spend_value_usd, payment_method,
         payment_reason, justification, notes, attachment_link, cc_email, requester_notification_emails, acknowledged_at,
         requested_by_name, requested_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, ?) RETURNING id`,
      [
        reference,
        requisitionNumber,
        status,
        input.priority || 'Normal',
        vendorName,
        blankToNull(input.vendor_code || vendorTaxId),
        vendorTaxId,
        blankToNull(input.supplier_email),
        amount,
        input.currency || 'USD',
        country,
        segment,
        blankToNull(input.department ?? actor.department),
        blankToNull(input.business_unit),
        blankToNull(input.cost_center),
        blankToNull(input.project_code),
        blankToNull(input.po_number),
        blankToNull(input.invoice_number),
        blankToNull(input.due_date),
        blankToNull(input.expense_category),
        spendCategory,
        input.spend_value_usd ?? amount,
        blankToNull(input.payment_method),
        reason,
        (input.justification || reason).trim(),
        blankToNull(input.notes),
        blankToNull(input.attachment_link),
        null,
        requesterNotificationEmails,
        requestedByName,
        requestedByEmail,
      ],
    );
    await exec(
      `UPDATE procure_guard_adhoc_payments
       SET requester_comments = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [blankToNull(input.requester_comments ?? input.notes), result.insertId],
    );


    await writeActivity({
      requestType: 'adhoc',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Admin created adhoc payment',
      actor,
    });

    await notifyProcureGuardNextApprover({
      event: 'request.submitted',
      requestType: 'adhoc',
      table: 'procure_guard_adhoc_payments',
      requestId: result.insertId,
      actor,
      comment: input.requester_comments ?? input.notes ?? null,
    });

    revalidateProcureGuardPaths();
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    console.error('[createAdminAdhocPayment]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create adhoc payment.' };
  }
}

export async function createAdminAdvancePayment(input: AdminCreateAdvancePaymentInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await requireAdminActor();
    await ensureProcureGuardPaymentRequestColumns();
    const amount = validateMoney(input.amount);
    const requisitionNumber = requireText(input.requisition_number, 'Requisition number');
    const country = requireCountryOption(input.country);
    const segment = requireText(input.segment, 'Segment');
    const sapVendorId = requireText(input.sap_vendor_id || input.vendor_code, 'SAP vendor ID');
    const vendorName = requireText(input.vendor_name, 'SAP vendor name');
    const spendCategory = requireText(input.spend_category, 'Spend category');
    const paymentTermsDays = validateNonNegativeNumber(input.current_payment_terms_days, 'Current payment terms in days');
    const creditLimitUsd = validateNonNegativeNumber(input.current_credit_limit_usd, 'Current credit limit in USD');
    const reason = requireText(input.advance_purpose || input.justification, 'Reason / justification for exception');

    const contractValue = input.contract_value === undefined || input.contract_value === null || Number.isNaN(Number(input.contract_value))
      ? null
      : Number(input.contract_value);
    const advancePercentage = input.advance_percentage === undefined || input.advance_percentage === null || Number.isNaN(Number(input.advance_percentage))
      ? null
      : Number(input.advance_percentage);

    const reference = makeReference('ADV');
    const requestedByEmail = input.requested_by_email?.trim() || actor.email;
    const requestedByName = input.requested_by_name?.trim() || actor.name;
    const requesterNotificationEmails = normalizeRequesterNotificationEmails(input.requester_notification_emails, requestedByEmail);
    const status = input.status || 'Submitted';
    const result = await exec(
      `INSERT INTO procure_guard_advance_payments
        (reference_number, requisition_number, status, priority, vendor_name, vendor_code, sap_vendor_id, supplier_email,
         amount, currency, country, segment, department, business_unit, cost_center, project_code,
         contract_reference, po_number, contract_value, advance_percentage, spend_category, spend_value_usd,
         current_payment_terms_days, current_credit_limit_usd,
         expected_invoice_date, expected_settlement_date, recovery_method,
         advance_purpose, justification, notes, attachment_link, cc_email, requester_notification_emails,
         requested_by_name, requested_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        reference,
        requisitionNumber,
        status,
        input.priority || 'Normal',
        vendorName,
        sapVendorId,
        sapVendorId,
        blankToNull(input.supplier_email),
        amount,
        input.currency || 'USD',
        country,
        segment,
        blankToNull(input.department ?? actor.department),
        blankToNull(input.business_unit),
        blankToNull(input.cost_center),
        blankToNull(input.project_code),
        blankToNull(input.contract_reference),
        blankToNull(input.po_number),
        contractValue,
        advancePercentage,
        spendCategory,
        input.spend_value_usd ?? amount,
        paymentTermsDays,
        creditLimitUsd,
        blankToNull(input.expected_invoice_date),
        blankToNull(input.expected_settlement_date),
        blankToNull(input.recovery_method),
        reason,
        (input.justification || reason).trim(),
        blankToNull(input.notes),
        blankToNull(input.attachment_link),
        null,
        requesterNotificationEmails,
        requestedByName,
        requestedByEmail,
      ],
    );
    await exec(
      `UPDATE procure_guard_advance_payments
       SET requester_comments = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [blankToNull(input.requester_comments ?? input.notes), result.insertId],
    );


    await writeActivity({
      requestType: 'advance',
      requestId: result.insertId,
      referenceNumber: reference,
      action: 'Admin created advance payment',
      actor,
    });

    await notifyProcureGuardNextApprover({
      event: 'request.submitted',
      requestType: 'advance',
      table: 'procure_guard_advance_payments',
      requestId: result.insertId,
      actor,
      comment: input.requester_comments ?? input.notes ?? null,
    });

    revalidateProcureGuardPaths();
    return { success: true, data: { id: result.insertId }, reference_number: reference };
  } catch (err) {
    console.error('[createAdminAdvancePayment]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create advance payment.' };
  }
}

function revalidateProcureGuardPaths() {
  revalidatePath('/admin');
  revalidatePath('/procure-guard/admin');
  revalidatePath('/procure-guard/analytics');
  revalidatePath('/procure-guard');
  revalidatePath('/procure-guard/adhoc-payments');
  revalidatePath('/procure-guard/advance-payments');
}

export async function deleteProcureGuardRecord(
  recordType: ProcureGuardRequestType | 'activity',
  id: number,
): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();

    if (!actor.permissions.canDeleteRecords) {
      return { success: false, error: 'Delete access is required for this action.' };
    }

    if (recordType === 'activity') {
      await exec(`DELETE FROM procure_guard_activity_log WHERE id = ?`, [id]);
      revalidateProcureGuardPaths();
      return { success: true };
    }

    const table = recordType === 'adhoc' ? 'procure_guard_adhoc_payments' : 'procure_guard_advance_payments';
    const rows = await sql<QueryResultRow[]>(`SELECT reference_number FROM ${table} WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Record not found.' };

    await exec(`DELETE FROM ${table} WHERE id = ?`, [id]);
    await exec(`DELETE FROM procure_guard_activity_log WHERE request_type = ? AND request_id = ?`, [recordType, id]);
    await writeActivity({
      requestType: recordType,
      requestId: id,
      referenceNumber: row.reference_number,
      action: `Admin deleted ${recordType} payment`,
      actor,
    });

    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[deleteProcureGuardRecord]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete record.' };
  }
}

async function updateStatusCommon(input: {
  table: 'procure_guard_adhoc_payments' | 'procure_guard_advance_payments';
  requestType: 'adhoc' | 'advance';
  id: number;
  status: ProcureGuardStatus;
  notes?: string;
}): Promise<ActionResult> {
  const actor = await getActor();

  const rows = await sql<QueryResultRow[]>(`SELECT * FROM ${input.table} WHERE id = ? LIMIT 1`, [input.id]);
  const row = rows[0];
  if (!row) return { success: false, error: 'Request not found.' };

  const ownsRequest = String(row.requested_by_email).toLowerCase() === actor.email.toLowerCase();
  const userCancellingOwnRequest = ownsRequest && input.status === 'Cancelled';

  if (userCancellingOwnRequest && actor.permissions.canCreateRequests) {
    if (row.status !== 'Submitted') {
      return { success: false, error: 'This request can only be cancelled before review starts.' };
    }
  } else {
    const thresholdAmount = row.spend_value_usd ?? row.amount;
    const thresholdCurrency = row.spend_value_usd === null || row.spend_value_usd === undefined ? row.currency : 'USD';
    const expectedNextStatus = getNextApprovalStatus(input.requestType, row.status, thresholdAmount, thresholdCurrency);
    const requiredPermission = getRequiredPermissionForTransition(
      input.requestType,
      row.status,
      input.status,
      thresholdAmount,
      thresholdCurrency,
    );
    const validApprovalMove = expectedNextStatus === input.status;
    const validRejectMove = input.status === 'Rejected' && isActiveApprovalStatus(row.status);

    if (!validApprovalMove && !validRejectMove) {
      return { success: false, error: `Cannot move ${row.reference_number} from ${formatProcureGuardStatusLabel(row.status)} to ${formatProcureGuardStatusLabel(input.status)}.` };
    }

    if (!requiredPermission || !actor.permissions[requiredPermission]) {
      return {
        success: false,
        error: `${actor.role} cannot move this request from ${formatProcureGuardStatusLabel(row.status)} to ${formatProcureGuardStatusLabel(input.status)}. Contact a ProcureGuard admin if your access needs to change.`,
      };
    }

    if (!actorCanAccessRequestScope(actor, row)) {
      return {
        success: false,
        error: getScopeRestrictionMessage(actor, row),
      };
    }
  }

  const comment = typeof input.notes === 'string' ? input.notes.trim() : '';
  const requiresComment = input.status === 'Rejected';
  if (requiresComment && !comment) {
    return { success: false, error: 'Add a comment before rejecting this request.' };
  }

  const setReviewed = REVIEWED_STATUSES.includes(input.status);
  const setCancelled = input.status === 'Cancelled';
  const shouldSetReviewer = setReviewed || setCancelled;
  const rejectionReason = input.status === 'Rejected' ? blankToNull(comment) : null;
  const reviewComments = shouldSetReviewer ? blankToNull(comment) : row.review_comments;

  await exec(
    `UPDATE ${input.table}
     SET status = ?,
         reviewed_by_name = ?,
         reviewed_by_email = ?,
         reviewed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
         rejection_reason = ?,
         review_comments = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      input.status,
      shouldSetReviewer ? actor.name : row.reviewed_by_name,
      shouldSetReviewer ? actor.email : row.reviewed_by_email,
      setReviewed || setCancelled,
      rejectionReason,
      reviewComments,
      input.id,
    ],
  );

  await writeActivity({
    requestType: input.requestType,
    requestId: input.id,
    referenceNumber: row.reference_number,
    action: `Status updated to ${formatProcureGuardStatusLabel(input.status)}`,
    actor,
    notes: comment || null,
  });

  await notifyProcureGuardNextApprover({
    event: 'request.status_changed',
    requestType: input.requestType,
    table: input.table,
    requestId: input.id,
    actor,
    previousStatus: row.status,
    comment: comment || null,
  });

  revalidatePath('/procure-guard');
  revalidatePath('/procure-guard/my-work');
  revalidatePath('/procure-guard/adhoc-payments');
  revalidatePath(`/procure-guard/adhoc-payments/${input.id}`);
  revalidatePath('/procure-guard/advance-payments');
  revalidatePath(`/procure-guard/advance-payments/${input.id}`);
  return { success: true };
}

export async function updateAdhocPaymentStatus(
  id: number,
  status: ProcureGuardStatus,
  notes?: string,
): Promise<ActionResult> {
  try {
    return await updateStatusCommon({
      table: 'procure_guard_adhoc_payments',
      requestType: 'adhoc',
      id,
      status,
      notes,
    });
  } catch (err) {
    console.error('[updateAdhocPaymentStatus]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update adhoc payment status.' };
  }
}

export async function updateAdvancePaymentStatus(
  id: number,
  status: ProcureGuardStatus,
  notes?: string,
): Promise<ActionResult> {
  try {
    return await updateStatusCommon({
      table: 'procure_guard_advance_payments',
      requestType: 'advance',
      id,
      status,
      notes,
    });
  } catch (err) {
    console.error('[updateAdvancePaymentStatus]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update advance payment status.' };
  }
}

export async function uploadProcureGuardDocument(
  formData: FormData,
): Promise<{ success: boolean; document?: ProcureGuardDocument; error?: string }> {
  try {
    const actor = await getActor();
    requireProcureGuardOperationalAccess(actor);
    const requestType = formData.get('request_type') as ProcureGuardRequestType | null;
    const requestId = Number(formData.get('request_id'));
    const file = formData.get('file') as File | null;
    const customName = ((formData.get('custom_name') as string) || '').trim() || (file ? fileBaseName(file.name) : 'Attachment');
    const documentType = ((formData.get('document_type') as string) || 'request_attachment').trim();

    if ((requestType !== 'adhoc' && requestType !== 'advance') || !Number.isFinite(requestId) || requestId <= 0 || !file) {
      return { success: false, error: 'Missing required upload fields.' };
    }

    if (file.size > MAX_PROCURE_GUARD_FILE_BYTES) {
      return { success: false, error: 'File is too large. Maximum size is 10 MB.' };
    }

    const table = requestType === 'adhoc' ? 'procure_guard_adhoc_payments' : 'procure_guard_advance_payments';
    const requestRows = await sql<QueryResultRow[]>(`SELECT id, reference_number, requested_by_email, requester_notification_emails FROM ${table} WHERE id = ? LIMIT 1`, [requestId]);
    if (!requestRows[0]) return { success: false, error: 'Request not found.' };
    const request = serialise<Pick<AdhocPaymentRequest | AdvancePaymentRequest, 'requested_by_email' | 'requester_notification_emails'>>(requestRows[0]);
    if (!actor.permissions.canViewAll && !actorCanAccessRequesterSideRequest(actor, request)) {
      return { success: false, error: 'You can only upload files to your own requests.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const insert = await exec(
      `INSERT INTO procure_guard_documents
         (request_type, request_id, document_name, original_name, document_type, file_type, file_size, file_content, uploaded_by_name, uploaded_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        requestType,
        requestId,
        customName,
        file.name !== customName ? file.name : null,
        documentType,
        detectMime(file),
        file.size,
        buffer,
        actor.name,
        actor.email,
      ],
    );

    const docs = await sql<QueryResultRow[]>(
      `SELECT id, request_type, request_id, document_name, original_name, document_type, file_type, file_size,
              uploaded_by_name, uploaded_by_email, uploaded_at
       FROM procure_guard_documents
       WHERE id = ? LIMIT 1`,
      [insert.insertId],
    );

    await writeActivity({
      requestType,
      requestId,
      referenceNumber: requestRows[0].reference_number,
      action: 'Attachment uploaded',
      actor,
      notes: file.name,
    });

    revalidatePath('/procure-guard');
    revalidatePath(`/procure-guard/${requestType === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${requestId}`);
    return { success: true, document: serialise<ProcureGuardDocument>(docs[0]) };
  } catch (err) {
    console.error('[uploadProcureGuardDocument]', err);
    return { success: false, error: 'Upload failed. Please try again.' };
  }
}

export async function deleteProcureGuardDocument(documentId: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const docs = await sql<QueryResultRow[]>(
      `SELECT d.id, d.request_type, d.request_id,
              COALESCE(a.reference_number, adv.reference_number) AS reference_number
       FROM procure_guard_documents d
       LEFT JOIN procure_guard_adhoc_payments a ON d.request_type = 'adhoc' AND d.request_id = a.id
       LEFT JOIN procure_guard_advance_payments adv ON d.request_type = 'advance' AND d.request_id = adv.id
       WHERE d.id = ? LIMIT 1`,
      [documentId],
    );
    const doc = docs[0];
    if (!doc) return { success: false, error: 'Attachment not found.' };

    await exec(`DELETE FROM procure_guard_documents WHERE id = ?`, [documentId]);
    await writeActivity({
      requestType: doc.request_type,
      requestId: doc.request_id,
      referenceNumber: doc.reference_number,
      action: 'Attachment removed',
      actor,
    });

    revalidatePath('/procure-guard');
    revalidatePath(`/procure-guard/${doc.request_type === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${doc.request_id}`);
    return { success: true };
  } catch (err) {
    console.error('[deleteProcureGuardDocument]', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}

export async function updateProcureGuardNotificationRecipient(input: {
  id: number;
  display_name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }

    const id = Number(input.id);
    const displayName = requireText(input.display_name, 'Display name');
    const email = requireText(input.email, 'Email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Enter a valid email address.' };
    }

    const result = await exec(
      `UPDATE procure_guard_notification_recipients
       SET display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [displayName, email, id],
    );

    if (result.rowCount === 0) return { success: false, error: 'Notification recipient not found.' };

    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[updateProcureGuardNotificationRecipient]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update notification recipient.' };
  }
}

export async function updateProcureGuardNotificationRecipientGroup(input: {
  ids: number[];
  display_name: string;
  email: string;
}): Promise<ActionResult> {
  try {
    const actor = await requirePermissionManager();
    if (!actor.permissions.canManagePermissions) {
      return { success: false, error: 'Permission management access is required.' };
    }

    const ids = [...new Set(input.ids.map(Number).filter(Number.isFinite))];
    if (ids.length === 0) return { success: false, error: 'Choose at least one notification recipient row.' };

    const displayName = requireText(input.display_name, 'Display name');
    const email = requireText(input.email, 'Email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, error: 'Enter a valid email address.' };
    }

    const result = await exec(
      `UPDATE procure_guard_notification_recipients
       SET display_name = ?, email = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ANY(?::int[])`,
      [displayName, email, ids],
    );

    if (result.rowCount === 0) return { success: false, error: 'Notification recipients not found.' };

    await syncProcureGuardRecipientAccessApprovals();
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[updateProcureGuardNotificationRecipientGroup]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update notification recipient group.' };
  }
}

export async function testProcureGuardN8nWebhook(): Promise<ActionResult<{
  status: number;
  statusText: string;
  webhookHost: string;
  webhookPath: string;
}>> {
  try {
    await requirePermissionManager();
    const rawWebhookUrl = process.env.N8N_PROCUREGUARD_WEBHOOK_URL?.trim();
    if (!rawWebhookUrl) {
      return {
        success: false,
        error: 'N8N_PROCUREGUARD_WEBHOOK_URL is not configured in the running app environment.',
      };
    }

    const webhookUrl = stripEnvQuotes(rawWebhookUrl);
    const parsedUrl = new URL(webhookUrl);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_PROCUREGUARD_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-procureguard-secret'] = secret;

    const response = await postProcureGuardWebhook(webhookUrl, headers, {
      event: 'procureguard.webhook_test',
      source: 'procureguard-admin-test',
      occurred_at: new Date().toISOString(),
      message: 'ProcureGuard n8n webhook connectivity test',
    });

    return {
      success: response.ok,
      data: {
        status: response.status,
        statusText: response.statusText,
        webhookHost: parsedUrl.hostname,
        webhookPath: parsedUrl.pathname,
      },
      error: response.ok ? undefined : `n8n responded with ${response.status} ${response.statusText || ''}`.trim(),
    };
  } catch (err) {
    console.error('[testProcureGuardN8nWebhook]', err);
    return {
      success: false,
      error: procureGuardWebhookErrorMessage(err),
    };
  }
}

function normaliseProcureGuardRole(role: unknown): ProcureGuardPermissionRole {
  return PERMISSION_ROLE_OPTIONS.includes(role as ProcureGuardPermissionRole)
    ? role as ProcureGuardPermissionRole
    : 'Requester';
}

const PROCURE_GUARD_LOCAL_TEST_EMAILS = ['local.procureguard@example.com'];

const PROCURE_GUARD_REVIEW_ROLE_RANK: Record<ProcureGuardPermissionRole, number> = {
  Requester: 0,
  Analyst: 1,
  'Read Only': 1,
  'SCM Manager': 2,
  'Country Controller': 3,
  'Supply Chain Director': 4,
  'Treasury Director': 5,
  'Corporate Controller': 6,
  CFO: 7,
  Admin: 8,
};

function procureGuardRoleFromRecipient(row: {
  request_type?: ProcureGuardRequestType | 'both' | null;
  notification_role?: string | null;
  approval_status?: ProcureGuardStatus | null;
}): ProcureGuardPermissionRole | null {
  const role = (row.notification_role ?? '').toLowerCase();
  if (role.includes('cfo')) return 'CFO';
  if (role.includes('corporate controller')) return 'Corporate Controller';
  if (role.includes('treasury')) return 'Treasury Director';
  if (role.includes('supply chain director')) return 'Supply Chain Director';
  if (role.includes('country controller') || role.includes('country finance')) return 'Country Controller';
  if (role.includes('scm') || role.includes('supply chain manager')) return 'SCM Manager';

  if (row.approval_status === 'Approved by Corporate Controller') return 'CFO';
  if (row.approval_status === 'Approved by Treasury Director') return 'Corporate Controller';
  if (row.approval_status === 'Approved by Supply Chain Director') return 'Treasury Director';
  if (row.approval_status === 'Approved by Country Controller') return 'Supply Chain Director';
  if (row.approval_status === 'Approved by SCM') return 'Supply Chain Director';
  if (row.approval_status === 'Under Review') {
    return row.request_type === 'advance' ? 'Country Controller' : 'SCM Manager';
  }

  return null;
}

async function syncProcureGuardRecipientAccessApprovals(): Promise<void> {
  await ensureProcureGuardAccessRequestTable();
  await ensureProcureGuardPermissionRoleValues();

  for (const email of PROCURE_GUARD_LOCAL_TEST_EMAILS) {
    await exec(`DELETE FROM procure_guard_access_requests WHERE user_email = ?`, [email]);
    await exec(`DELETE FROM procure_guard_permissions WHERE email = ?`, [email]);
  }

  const rows = await sql<QueryResultRow[]>(`
    SELECT display_name, email, country, request_type, notification_role, approval_status
    FROM procure_guard_notification_recipients
    WHERE is_active = TRUE
      AND email IS NOT NULL
      AND TRIM(email) <> ''
  `);

  const byEmail = new Map<string, {
    email: string;
    name: string;
    role: ProcureGuardPermissionRole;
    countries: Set<string>;
  }>();

  for (const row of rows) {
    const email = String(row.email ?? '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    if (PROCURE_GUARD_LOCAL_TEST_EMAILS.includes(email)) continue;

    const role = procureGuardRoleFromRecipient({
      request_type: row.request_type as ProcureGuardRequestType | 'both' | null,
      notification_role: row.notification_role ? String(row.notification_role) : null,
      approval_status: row.approval_status as ProcureGuardStatus | null,
    });
    if (!role) continue;

    const current = byEmail.get(email);
    const currentRank = current ? PROCURE_GUARD_REVIEW_ROLE_RANK[current.role] : -1;
    const nextRole = PROCURE_GUARD_REVIEW_ROLE_RANK[role] > currentRank ? role : current?.role ?? role;
    const countries = current?.countries ?? new Set<string>();
    const country = normalizeProcureGuardCountry(row.country ? String(row.country) : null);
    if (country) countries.add(country);

    byEmail.set(email, {
      email,
      name: String(row.display_name ?? '').trim() || current?.name || email,
      role: nextRole,
      countries,
    });
  }

  const existingRows = await sql<QueryResultRow[]>(`SELECT email, role FROM procure_guard_permissions`);
  const existingRoleByEmail = new Map(existingRows.map(row => [String(row.email).toLowerCase(), normaliseProcureGuardRole(row.role)]));

  for (const recipient of byEmail.values()) {
    if (existingRoleByEmail.get(recipient.email) === 'Admin') continue;

    const country = recipient.countries.size === 1 ? [...recipient.countries][0] : null;
    await exec(
      `INSERT INTO procure_guard_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, NULL)
       ON CONFLICT (email) DO UPDATE SET
         name = COALESCE(EXCLUDED.name, procure_guard_permissions.name),
         role = EXCLUDED.role,
         country = EXCLUDED.country,
         segment = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [recipient.email, recipient.name, recipient.role, blankToNull(country)],
    );

    await exec(
      `INSERT INTO procure_guard_access_requests
         (user_email, display_name, status, requested_role, approved_role, country, segment, requested_at, reviewed_at, reviewed_by, notes)
       VALUES (?, ?, 'Approved', ?, ?, ?, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'ProcureGuard recipient sync', 'Synced from notification recipients')
       ON CONFLICT (user_email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         status = 'Approved',
         requested_role = EXCLUDED.requested_role,
         approved_role = EXCLUDED.approved_role,
         country = EXCLUDED.country,
         segment = NULL,
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = EXCLUDED.reviewed_by,
         notes = EXCLUDED.notes`,
      [recipient.email, recipient.name, recipient.role, recipient.role, blankToNull(country)],
    );
  }
}

function serialiseProcureGuardAccessRequest(row: QueryResultRow): ProcureGuardAccessRequestRow {
  return {
    user_email: String(row.user_email),
    display_name: row.display_name ? String(row.display_name) : null,
    job_title: row.job_title ? String(row.job_title) : null,
    department: row.department ? String(row.department) : null,
    status: row.status as ProcureGuardAccessRequestStatus,
    requested_role: normaliseProcureGuardRole(row.requested_role),
    approved_role: row.approved_role ? normaliseProcureGuardRole(row.approved_role) : null,
    country: normalizeProcureGuardCountry(row.country ? String(row.country) : null),
    segment: row.segment ? String(row.segment) : null,
    requested_at: row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
    reviewed_at: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : (row.reviewed_at ?? null),
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

export async function submitProcureGuardAccessRequest(input: {
  userEmail: string;
  displayName: string;
  jobTitle?: string | null;
  department?: string | null;
  requestedRole?: ProcureGuardPermissionRole;
}): Promise<ActionResult> {
  try {
    await ensureProcureGuardAccessRequestTable();
    const email = requireText(input.userEmail, 'Email').toLowerCase();
    const displayName = requireText(input.displayName, 'Display name');
    const requestedRole = normaliseProcureGuardRole(input.requestedRole ?? 'Requester');

    await exec(
      `INSERT INTO procure_guard_access_requests
         (user_email, display_name, job_title, department, requested_role, status, requested_at)
       VALUES (?, ?, ?, ?, ?, 'Pending', CURRENT_TIMESTAMP)
       ON CONFLICT (user_email) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         job_title = EXCLUDED.job_title,
         department = EXCLUDED.department,
         requested_role = EXCLUDED.requested_role,
         status = 'Pending',
         requested_at = CURRENT_TIMESTAMP,
         reviewed_at = NULL,
         reviewed_by = NULL,
         notes = NULL`,
      [email, displayName, blankToNull(input.jobTitle), blankToNull(input.department), requestedRole],
    );

    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[submitProcureGuardAccessRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit ProcureGuard access request.' };
  }
}

export async function getProcureGuardAccessRequests(): Promise<ProcureGuardAccessRequestRow[]> {
  try {
    await ensureProcureGuardAccessRequestTable();
    await syncProcureGuardRecipientAccessApprovals();
    const [requestRows, permissionRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM procure_guard_access_requests
         ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, requested_at DESC`,
      ),
      sql<QueryResultRow[]>(`SELECT * FROM procure_guard_permissions ORDER BY updated_at DESC, email`),
    ]);

    const byEmail = new Map<string, ProcureGuardAccessRequestRow>();
    for (const row of requestRows) {
      byEmail.set(String(row.user_email).toLowerCase(), serialiseProcureGuardAccessRequest(row));
    }

    for (const row of permissionRows) {
      const email = String(row.email).toLowerCase();
      if (byEmail.has(email)) continue;
      const role = normaliseProcureGuardRole(row.role);
      byEmail.set(email, {
        user_email: email,
        display_name: row.name ? String(row.name) : null,
        job_title: null,
        department: null,
        status: 'Approved',
        requested_role: role,
        approved_role: role,
        country: normalizeProcureGuardCountry(row.country ? String(row.country) : null),
        segment: row.segment ? String(row.segment) : null,
        requested_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        reviewed_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        reviewed_by: 'ProcureGuard permissions',
        notes: null,
      });
    }

    return [...byEmail.values()].sort((a, b) => {
      const rank = (status: ProcureGuardAccessRequestStatus) => status === 'Pending' ? 0 : status === 'Approved' ? 1 : 2;
      return rank(a.status) - rank(b.status) || Date.parse(b.requested_at) - Date.parse(a.requested_at);
    });
  } catch (err) {
    console.error('[getProcureGuardAccessRequests]', err);
    return [];
  }
}

export async function getProcureGuardPendingAccessCount(): Promise<number> {
  try {
    await ensureProcureGuardAccessRequestTable();
    const rows = await sql<QueryResultRow[]>(`SELECT COUNT(*) AS cnt FROM procure_guard_access_requests WHERE status = 'Pending'`);
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    console.error('[getProcureGuardPendingAccessCount]', err);
    return 0;
  }
}

export async function approveProcureGuardAccess(input: {
  userEmail: string;
  approvedRole: ProcureGuardPermissionRole;
  reviewedBy: string;
  country?: string | null;
  segment?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    await requirePermissionManager();
    await ensureProcureGuardAccessRequestTable();
    await ensureProcureGuardPermissionRoleValues();
    const email = requireText(input.userEmail, 'Email').toLowerCase();
    const role = normaliseProcureGuardRole(input.approvedRole);
    const country = normalizeProcureGuardCountry(input.country);

    await exec(
      `INSERT INTO procure_guard_access_requests
         (user_email, display_name, status, requested_role, approved_role, country, segment, requested_at, reviewed_at, reviewed_by, notes)
       VALUES (?, ?, 'Approved', ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?)
       ON CONFLICT (user_email) DO UPDATE SET
         status = 'Approved',
         approved_role = EXCLUDED.approved_role,
         country = EXCLUDED.country,
         segment = EXCLUDED.segment,
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = EXCLUDED.reviewed_by,
         notes = EXCLUDED.notes`,
      [email, email, role, role, blankToNull(country), blankToNull(input.segment), input.reviewedBy, blankToNull(input.notes)],
    );

    await exec(
      `INSERT INTO procure_guard_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         role = EXCLUDED.role,
         country = EXCLUDED.country,
         segment = EXCLUDED.segment,
         updated_at = CURRENT_TIMESTAMP`,
      [email, null, role, blankToNull(country), blankToNull(input.segment)],
    );

    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[approveProcureGuardAccess]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to approve ProcureGuard access.' };
  }
}

export async function rejectProcureGuardAccess(userEmail: string, reviewedBy: string): Promise<ActionResult> {
  try {
    await requirePermissionManager();
    await ensureProcureGuardAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(
      `UPDATE procure_guard_access_requests
       SET status = 'Rejected', approved_role = NULL, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE user_email = ?`,
      [reviewedBy, email],
    );
    if (!adminEmails().includes(email)) {
      await exec(`DELETE FROM procure_guard_permissions WHERE email = ?`, [email]);
    }
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[rejectProcureGuardAccess]', err);
    return { success: false, error: 'Failed to reject ProcureGuard access.' };
  }
}

export async function revokeProcureGuardAccess(userEmail: string, reviewedBy: string): Promise<ActionResult> {
  try {
    await requirePermissionManager();
    await ensureProcureGuardAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(
      `INSERT INTO procure_guard_access_requests
         (user_email, display_name, status, requested_role, requested_at, reviewed_at, reviewed_by)
       VALUES (?, ?, 'Revoked', 'Requester', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
       ON CONFLICT (user_email) DO UPDATE SET
         status = 'Revoked',
         approved_role = NULL,
         reviewed_at = CURRENT_TIMESTAMP,
         reviewed_by = EXCLUDED.reviewed_by`,
      [email, email, reviewedBy],
    );
    if (!adminEmails().includes(email)) {
      await exec(`DELETE FROM procure_guard_permissions WHERE email = ?`, [email]);
    }
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[revokeProcureGuardAccess]', err);
    return { success: false, error: 'Failed to revoke ProcureGuard access.' };
  }
}

export async function editProcureGuardAccess(input: {
  userEmail: string;
  approvedRole: ProcureGuardPermissionRole;
  reviewedBy: string;
  country?: string | null;
  segment?: string | null;
}): Promise<ActionResult> {
  return approveProcureGuardAccess({
    userEmail: input.userEmail,
    approvedRole: input.approvedRole,
    reviewedBy: input.reviewedBy,
    country: input.country,
    segment: input.segment,
    notes: 'Access edited by admin',
  });
}

export async function deleteProcureGuardAccessRequest(userEmail: string): Promise<ActionResult> {
  try {
    await requirePermissionManager();
    await ensureProcureGuardAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(`DELETE FROM procure_guard_access_requests WHERE user_email = ?`, [email]);
    if (!adminEmails().includes(email)) {
      await exec(`DELETE FROM procure_guard_permissions WHERE email = ?`, [email]);
    }
    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[deleteProcureGuardAccessRequest]', err);
    return { success: false, error: 'Failed to delete ProcureGuard access record.' };
  }
}

export async function updateProcureGuardPermission(input: UpdateProcureGuardPermissionInput): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureProcureGuardPermissionRoleValues();
    const email = requireText(input.email, 'Email').toLowerCase();
    const role = input.role;
    const country = normalizeProcureGuardCountry(input.country);
    const canManageAll = canUseProcureGuardAdmin(getProcureGuardAccessView(actor.role));
    const canManageOwnConfiguredAdmin = actor.email.toLowerCase() === email && adminEmails().includes(email);

    if (!canManageAll && !canManageOwnConfiguredAdmin) {
      return { success: false, error: 'Permission management access is required.' };
    }

    if (!PERMISSION_ROLE_OPTIONS.includes(role)) {
      return { success: false, error: 'Choose a valid permission level.' };
    }

    await exec(
      `INSERT INTO procure_guard_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name,
         role = EXCLUDED.role,
         country = EXCLUDED.country,
         segment = EXCLUDED.segment,
         updated_at = CURRENT_TIMESTAMP`,
      [
        email,
        blankToNull(input.name),
        role,
        blankToNull(country),
        blankToNull(input.segment),
      ],
    );


    revalidateProcureGuardPaths();
    return { success: true };
  } catch (err) {
    console.error('[updateProcureGuardPermission]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update permission.' };
  }
}













