'use server';

import type { QueryResultRow } from 'pg';
import { request as httpRequest } from 'http';
import { request as httpsRequest } from 'https';
import { revalidatePath } from 'next/cache';
import { getProcureGuardUser } from '@/lib/auth';
import laptopProcurementPool from '@/lib/db-laptop';
import {
  ADMIN_REQUESTS_PAGE_SIZE,
  APPROVAL_ACTIVE_STATUSES,
  APPROVER_MATRIX_ROLES,
  bestAccessView,
  canUseLaptopAdmin,
  canUseLaptopAnalytics,
  canUseLaptopOperationalPages,
  canUseLaptopReviewerQueue,
  getLaptopApprovalStage,
  getLaptopAvailableActions,
  getNextApprovalStatus,
  getPermissionProfile,
  getRequiredPermissionForStage,
  IT_MANAGER_STATUSES,
  isActiveApprovalStatus,
  laptopHasAssignedUnit,
  laptopIsProcureNewFlow,
} from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage, LaptopPermissionKey } from '@/lib/laptopProcurement-utils';
import type {
  ActionResult,
  AdminCreateLaptopRequestInput,
  AssignExistingLaptopInput,
  CreateLaptopDeviceInput,
  CreateLaptopRequestInput,
  LaptopAccessRequestRow,
  LaptopAccessRequestStatus,
  LaptopActivityRow,
  LaptopActor,
  LaptopDelegationGrant,
  LaptopDelegationData,
  LaptopDelegationRow,
  LaptopAdminData,
  LaptopAnalyticsData,
  LaptopAnalyticsMetric,
  LaptopApproverMatrixRow,
  LaptopDashboardData,
  LaptopDashboardStats,
  LaptopDeviceCatalogRow,
  LaptopDeviceOption,
  LaptopDocument,
  LaptopMonthlyMetric,
  LaptopPermissionListItem,
  LaptopPermissionProfile,
  LaptopPermissionRole,
  LaptopPermissionRow,
  LaptopRequest,
  LaptopRequestDetailData,
  LaptopRequestListData,
  LaptopRequestStatus,
  LaptopWorkQueueData,
  SubmitProcureNewDetailsInput,
  UpdateLaptopApproverMatrixInput,
  UpdateLaptopDeviceInput,
  UpdateLaptopExistingDeviceInput,
  UpdateLaptopPermissionInput,
} from '@/types/laptopProcurement';

/* ── Low-level DB helpers (mirror ProcureGuard) ───────────────── */

type QueryParam = string | number | boolean | null | Date | Buffer | undefined;
type QueryParams = QueryParam[];
type ExecResult = { rowCount: number; insertId: number };

const MEANINGFUL_ACTIVITY_WHERE = "request_id > 0 AND action NOT ILIKE '%seeded%'";
const MAX_LAPTOP_FILE_BYTES = 10 * 1024 * 1024;
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

function toPostgresQuery(statement: string): string {
  let index = 0;
  return statement.replace(/\?/g, () => `$${++index}`);
}

function normaliseParams(params: QueryParams): QueryParams {
  return params.map(value => (value === undefined ? null : value));
}

function serialise<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function sql<T extends QueryResultRow[]>(statement: string, params: QueryParams = []): Promise<T> {
  const result = await laptopProcurementPool.query(toPostgresQuery(statement), normaliseParams(params));
  return serialise<T>(result.rows);
}

async function exec(statement: string, params: QueryParams = []): Promise<ExecResult> {
  const result = await laptopProcurementPool.query(toPostgresQuery(statement), normaliseParams(params));
  const rawId = result.rows[0]?.id;
  const insertId = typeof rawId === 'number' ? rawId : Number(rawId);
  return {
    rowCount: result.rowCount ?? 0,
    insertId: Number.isFinite(insertId) ? insertId : 0,
  };
}

/* ── Actor / access ───────────────────────────────────────────── */

function adminEmails(): string[] {
  return (`${process.env.ADMIN_EMAILS ?? ''},${process.env.LAPTOP_PROCUREMENT_ADMIN_EMAILS ?? ''}`)
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

async function getPermissionRowForEmail(email: string): Promise<LaptopPermissionRow | null> {
  try {
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_permissions WHERE email = ? LIMIT 1`, [email]);
    return rows[0] ? serialise<LaptopPermissionRow>(rows[0]) : null;
  } catch (err) {
    console.error('[laptop getPermissionRowForEmail]', err);
    return null;
  }
}

// laptop_approver_matrix is the sole source of IT Manager / Country Manager / IT
// Director / Supply Chain Director approval authority — laptop_permissions no longer
// grants it (see buildEffectivePermissions). This lets one person hold several of
// those stages across different countries, which a single role+country permission row
// could never express — e.g. Country Manager for one country and Supply Chain
// Director broadly.
const APPROVAL_STAGES: LaptopApprovalStage[] = ['IT Manager', 'Country Manager', 'IT Director', 'Supply Chain Director'];

function emptyMatrixCapabilities(): Record<LaptopApprovalStage, string[]> {
  return { 'IT Manager': [], 'Country Manager': [], 'IT Director': [], 'Supply Chain Director': [] };
}

async function getApproverMatrixCapabilities(email: string): Promise<Record<LaptopApprovalStage, string[]>> {
  const capabilities = emptyMatrixCapabilities();
  const target = email.trim().toLowerCase();
  if (!target) return capabilities;
  try {
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_approver_matrix WHERE is_active = TRUE`);
    const add = (stage: LaptopApprovalStage, matrixEmail: unknown, country: string) => {
      if (String(matrixEmail ?? '').trim().toLowerCase() !== target) return;
      capabilities[stage].push(country);
    };
    for (const row of rows) {
      const country = String(row.country ?? '').trim();
      if (!country) continue;
      add('IT Manager', row.it_manager_email, country);
      add('IT Manager', row.it_manager_2_email, country);
      add('Country Manager', row.cm_email, country);
      add('IT Director', row.itd_email, country);
      add('Supply Chain Director', row.scd_email, country);
    }
  } catch (err) {
    console.error('[getApproverMatrixCapabilities]', err);
  }
  return capabilities;
}

function hasAnyMatrixCapability(capabilities: Record<LaptopApprovalStage, string[]>): boolean {
  return APPROVAL_STAGES.some(stage => capabilities[stage].length > 0);
}

// Admin bypasses everything (unchanged); Analyst/Read Only keep their analytics-only
// access; everyone else's view-all/reject/per-stage review rights are derived purely
// from approver-matrix presence, ignoring any IT Manager/Country Manager/IT
// Director/Supply Chain Director role a laptop_permissions row might still carry.
function buildEffectivePermissions(baseRole: LaptopPermissionRole, capabilities: Record<LaptopApprovalStage, string[]>): LaptopPermissionProfile {
  const base = getPermissionProfile(baseRole);
  const isAdmin = baseRole === 'Admin';
  const isAnalyst = baseRole === 'Analyst' || baseRole === 'Read Only';
  const hasCapability = hasAnyMatrixCapability(capabilities);
  return {
    ...base,
    canViewAll: isAdmin || hasCapability,
    canReject: isAdmin || hasCapability,
    canReviewItManager: isAdmin || capabilities['IT Manager'].length > 0,
    canReviewCountryManager: isAdmin || capabilities['Country Manager'].length > 0,
    canReviewItDirector: isAdmin || capabilities['IT Director'].length > 0,
    canReviewScmDirector: isAdmin || capabilities['Supply Chain Director'].length > 0,
    accessView: isAdmin ? 'admin' : isAnalyst ? 'analyst' : (hasCapability ? 'reviewer' : 'requester'),
  };
}

function stageHasCountry(capabilities: Record<LaptopApprovalStage, string[]> | undefined, stage: LaptopApprovalStage, country: string | null | undefined): boolean {
  const countries = capabilities?.[stage] ?? [];
  if (!countries.length) return false;
  const target = normaliseScopeValue(country);
  return countries.some(c => normaliseScopeValue(c) === target);
}

function anyMatrixCapabilityForCountry(capabilities: Record<LaptopApprovalStage, string[]> | undefined, country: string | null | undefined): boolean {
  if (!capabilities) return false;
  return APPROVAL_STAGES.some(stage => stageHasCountry(capabilities, stage, country));
}

function allMatrixCountries(capabilities: Record<LaptopApprovalStage, string[]> | undefined): string[] {
  if (!capabilities) return [];
  return [...new Set(APPROVAL_STAGES.flatMap(stage => capabilities[stage]))];
}

async function getActor(): Promise<LaptopActor> {
  const user = await getProcureGuardUser();
  const email = user?.email ?? '';
  if (!email) throw new Error('You must be signed in to use Laptop Procurement.');

  const permissionRow = await getPermissionRowForEmail(email);
  const fallbackRole: LaptopPermissionRole = adminEmails().includes(email.toLowerCase()) ? 'Admin' : 'Requester';
  const baseRole = (permissionRow?.role ?? fallbackRole) as LaptopPermissionRole;
  const matrixCapabilities = await getApproverMatrixCapabilities(email);
  const permissions = buildEffectivePermissions(baseRole, matrixCapabilities);
  const delegatedFrom = await resolveLaptopDelegations(email);
  // Whole-page gates (Admin Panel, Analytics, Reviewer Queue) use the best access
  // tier across the actor's own role and every role they hold via delegation, so a
  // delegate can actually reach those pages — not just act on individual requests,
  // which already account for delegation separately via `delegatedFrom`.
  const effectiveAccessView = bestAccessView([permissions.accessView, ...delegatedFrom.map(d => d.permissions.accessView)]);

  return {
    email,
    name: permissionRow?.name ?? user?.name ?? email,
    department: user?.department ?? null,
    jobTitle: user?.jobTitle ?? null,
    isAdmin: permissions.role === 'Admin',
    role: permissions.role,
    permissions,
    matrixCapabilities,
    delegatedFrom,
    effectiveAccessView,
  };
}

let laptopDelegationTableEnsured: Promise<void> | null = null;
async function ensureLaptopDelegationTable(): Promise<void> {
  if (laptopDelegationTableEnsured) return laptopDelegationTableEnsured;
  laptopDelegationTableEnsured = (async () => {
    await exec(`CREATE TABLE IF NOT EXISTS laptop_delegations (
      id SERIAL PRIMARY KEY,
      delegator_email TEXT NOT NULL,
      delegator_name TEXT,
      delegate_email TEXT NOT NULL,
      delegate_name TEXT,
      starts_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      revoked_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    await exec(`ALTER TABLE laptop_delegations ADD COLUMN IF NOT EXISTS starts_at TIMESTAMPTZ`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_laptop_delegations_delegate ON laptop_delegations (LOWER(delegate_email))`);
    await exec(`CREATE INDEX IF NOT EXISTS idx_laptop_delegations_delegator ON laptop_delegations (LOWER(delegator_email))`);
  })().catch((err) => {
    laptopDelegationTableEnsured = null;
    throw err;
  });
  return laptopDelegationTableEnsured;
}

// A delegation whose expires_at has simply passed still carries is_active = TRUE
// until someone explicitly revokes it — resolveLaptopDelegations already filters on
// expires_at directly so access is never affected, but the admin/delegate lists sort
// and label off this flag, so a merely-expired row reads as if it outranks ones
// genuinely revoked more recently. Flip it here whenever those lists are read.
async function expireStaleLaptopDelegations(): Promise<void> {
  await exec(
    `UPDATE laptop_delegations
     SET is_active = FALSE, revoked_at = expires_at, updated_at = CURRENT_TIMESTAMP
     WHERE is_active = TRUE AND expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP`,
  );
}

/**
 * Who should actually be notified in place of `email`, if anyone — follows an active
 * delegation FROM `email` to its delegate, and recursively from there in case the
 * delegate has also delegated onward. Returns null if `email` has no active
 * delegation (the caller should keep using `email` unchanged).
 */
async function resolveActiveLaptopDelegateEmail(
  email: string | null | undefined,
  depth = 0,
): Promise<{ name: string | null; email: string } | null> {
  if (!email || depth > 5) return null;
  try {
    const rows = await sql<QueryResultRow[]>(
      `SELECT delegate_email, delegate_name FROM laptop_delegations
       WHERE LOWER(delegator_email) = ? AND is_active = TRUE
         AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       LIMIT 1`,
      [email.toLowerCase()],
    );
    const row = rows[0];
    if (!row) return null;
    const delegateEmail = String(row.delegate_email);
    const further = await resolveActiveLaptopDelegateEmail(delegateEmail, depth + 1);
    return further ?? { name: (row.delegate_name as string | null) ?? null, email: delegateEmail };
  } catch (err) {
    console.error('[resolveActiveLaptopDelegateEmail]', err);
    return null;
  }
}

/**
 * Resolve active delegations TO `email` for Laptop Procurement. Each delegator
 * is expanded into their own effective role/permissions/approver-matrix capabilities.
 * Only delegators who actually carry authority (Admin, or named anywhere in the
 * approver matrix) are inherited. Fail-safe: returns [] if the delegations table is
 * unavailable.
 */
async function resolveLaptopDelegations(email: string): Promise<LaptopDelegationGrant[]> {
  try {
    await ensureLaptopDelegationTable();
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_delegations
       WHERE LOWER(delegate_email) = ? AND is_active = TRUE
         AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
         AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)`,
      [email.toLowerCase()],
    );
    if (!rows.length) return [];

    const grants: LaptopDelegationGrant[] = [];
    for (const row of rows) {
      const delegatorEmail = String(row.delegator_email);
      const permRow = await getPermissionRowForEmail(delegatorEmail);
      const baseRole = (permRow?.role ?? 'Requester') as LaptopPermissionRole;
      const matrixCapabilities = await getApproverMatrixCapabilities(delegatorEmail);
      const grantPermissions = buildEffectivePermissions(baseRole, matrixCapabilities);
      if (!grantPermissions.canViewAll) continue; // only reviewers/approvers/admins carry delegatable authority
      grants.push({
        email: delegatorEmail,
        name: permRow?.name ?? (row.delegator_name as string | null) ?? delegatorEmail,
        role: grantPermissions.role,
        matrixCapabilities,
        permissions: grantPermissions,
      });
    }
    return grants;
  } catch (err) {
    console.error('[resolveLaptopDelegations]', err);
    return [];
  }
}

export async function getLaptopActor(): Promise<LaptopActor | null> {
  try {
    return await getActor();
  } catch (err) {
    console.error('[getLaptopActor]', err);
    return null;
  }
}

export async function canAccessLaptopApp(): Promise<boolean> {
  const user = await getProcureGuardUser();
  const email = user?.email?.toLowerCase();
  if (!email) return false;
  if (adminEmails().includes(email)) return true;
  const permissionRow = await getPermissionRowForEmail(email);
  if (permissionRow) return true;
  const delegations = await resolveLaptopDelegations(email);
  return delegations.length > 0;
}

/* ── Scoping ──────────────────────────────────────────────────── */

function normaliseScopeValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

// Maps the required permission for a stage transition back to the approver-matrix
// stage it corresponds to, so resolveLaptopActing can check the acting identity's
// matrix countries for that stage — see getRequiredPermissionForStage.
const PERMISSION_KEY_TO_STAGE: Partial<Record<LaptopPermissionKey, LaptopApprovalStage>> = {
  canReviewItManager: 'IT Manager',
  canReviewCountryManager: 'Country Manager',
  canReviewItDirector: 'IT Director',
  canReviewScmDirector: 'Supply Chain Director',
};

function scopedWhere(actor: LaptopActor): { where: string; params: string[] } {
  const delegated = (actor.delegatedFrom ?? []).filter(d => d.permissions.canViewAll);

  if (actor.role === 'Admin' || delegated.some(d => d.role === 'Admin')) {
    return { where: '', params: [] };
  }

  const orGroups: string[] = [];
  const params: string[] = [];

  if (actor.permissions.canViewAll) {
    const countries = allMatrixCountries(actor.matrixCapabilities);
    if (countries.length) {
      orGroups.push(`country IN (${countries.map(() => '?').join(', ')})`);
      params.push(...countries);
    }
  }
  // Always see your own submitted requests too, regardless of reviewer scope.
  orGroups.push('requested_by_email = ?');
  params.push(actor.email);

  for (const d of delegated) {
    const countries = allMatrixCountries(d.matrixCapabilities);
    if (!countries.length) continue;
    orGroups.push(`country IN (${countries.map(() => '?').join(', ')})`);
    params.push(...countries);
  }

  return { where: `WHERE ${orGroups.join(' OR ')}`, params };
}

// Identities (self + delegators) the actor can act through, each with its own
// approver-matrix capabilities.
function laptopActingIdentities(actor: LaptopActor): LaptopDelegationGrant[] {
  return [
    { email: actor.email, name: actor.name, role: actor.role, permissions: actor.permissions, matrixCapabilities: actor.matrixCapabilities },
    ...(actor.delegatedFrom ?? []),
  ];
}

function getScopedActions(actor: LaptopActor, request: {
  status: LaptopRequestStatus;
  country?: string | null;
  assigned_serial_no?: string | null;
  assigned_model?: string | null;
  assigned_age?: string | null;
  procure_new_requested?: boolean | null;
}) {
  const hasAssignedUnit = laptopHasAssignedUnit(request);
  const isProcureNewFlow = laptopIsProcureNewFlow(request);
  const requiredStage = getLaptopApprovalStage(request.status);
  const ownsCurrentStep = Boolean(requiredStage) && laptopActingIdentities(actor).some(id =>
    id.role === 'Admin' || stageHasCountry(id.matrixCapabilities, requiredStage as LaptopApprovalStage, request.country),
  );
  return getLaptopAvailableActions(ownsCurrentStep, request.status, hasAssignedUnit, isProcureNewFlow);
}

/**
 * Decide whether the actor may perform a stage transition needing
 * `requiredPermission` (and, when rejecting, canReject) on `request` — using
 * their OWN authority first, then any delegated authority whose approver-matrix
 * capabilities cover the request's country for that stage. Returns the "on behalf
 * of" label to record.
 */
function resolveLaptopActing(
  actor: LaptopActor,
  requiredPermission: LaptopPermissionKey,
  needsReject: boolean,
  request: { country?: string | null },
): { allowed: boolean; reason: 'permission' | 'reject' | 'scope' | null; onBehalfOf: string | null } {
  let sawPermission = false;
  let sawReject = true;
  const stage = PERMISSION_KEY_TO_STAGE[requiredPermission];
  const identities = laptopActingIdentities(actor);
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    if (!id.permissions[requiredPermission]) continue;
    sawPermission = true;
    if (needsReject && !id.permissions.canReject) {
      sawReject = false;
      continue;
    }
    const inScope = id.role === 'Admin' || (stage ? stageHasCountry(id.matrixCapabilities, stage, request.country) : false);
    if (inScope) {
      return { allowed: true, reason: null, onBehalfOf: i === 0 ? null : id.name };
    }
  }
  if (!sawPermission) return { allowed: false, reason: 'permission', onBehalfOf: null };
  if (!sawReject) return { allowed: false, reason: 'reject', onBehalfOf: null };
  return { allowed: false, reason: 'scope', onBehalfOf: null };
}

function requireOperationalAccess(actor: LaptopActor): void {
  if (!canUseLaptopOperationalPages(actor.effectiveAccessView)) {
    throw new Error('Operational Laptop Procurement access is required.');
  }
}

function requireAnalyticsAccess(actor: LaptopActor): void {
  if (!canUseLaptopAnalytics(actor.effectiveAccessView)) {
    throw new Error('Analytics access is required.');
  }
}

function requireReviewerQueueAccess(actor: LaptopActor): void {
  if (!canUseLaptopReviewerQueue(actor.effectiveAccessView)) {
    throw new Error('Reviewer access is required.');
  }
}

async function requireAdminActor(): Promise<LaptopActor> {
  const actor = await getActor();
  if (!canUseLaptopAdmin(actor.effectiveAccessView)) {
    throw new Error('Admin access is required.');
  }
  return actor;
}

/* ── n8n webhooks (mirrors ProcureGuard's notifier) ───────────── */

function stripEnvQuotes(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function isTlsCertificateError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
  return code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE'
    || code === 'SELF_SIGNED_CERT_IN_CHAIN'
    || code === 'DEPTH_ZERO_SELF_SIGNED_CERT'
    || message.toLowerCase().includes('unable to verify')
    || message.toLowerCase().includes('self-signed certificate');
}

function laptopWebhookErrorMessage(err: unknown): string {
  if (isTlsCertificateError(err)) {
    return 'TLS certificate verification failed for n8n even though the webhook call is configured to bypass TLS verification.';
  }
  return err instanceof Error ? err.message : 'Laptop Procurement n8n webhook failed.';
}

function getLaptopAppBaseUrl(): string {
  const configured = process.env.CLIENT_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:4001';
  return stripEnvQuotes(configured).replace(/\/$/, '');
}

async function postLaptopWebhook(
  webhookUrl: string,
  headers: Record<string, string>,
  payload: unknown,
): Promise<{ ok: boolean; status: number; statusText: string }> {
  const url = new URL(stripEnvQuotes(webhookUrl));
  const body = JSON.stringify(payload);
  const isHttps = url.protocol === 'https:';

  return new Promise((resolve, reject) => {
    const req = (isHttps ? httpsRequest : httpRequest)({
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
        resolve({ ok: status >= 200 && status < 300, status, statusText: response.statusMessage ?? '' });
      });
    });

    req.setTimeout(15000, () => {
      req.destroy(new Error('Laptop Procurement n8n webhook timed out.'));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/** Notifies the delegate (and, on grant, includes context) when a delegation is created or revoked. */
async function sendLaptopDelegationNotification(
  kind: 'granted' | 'revoked',
  params: {
    delegatorEmail: string;
    delegatorName: string;
    delegateEmail: string;
    delegateName: string | null;
    expiresAt: string | null;
  },
): Promise<void> {
  const webhookUrl = process.env.N8N_LAPTOP_PROCUREMENT_DELEGATION_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn('[Laptop Procurement n8n] N8N_LAPTOP_PROCUREMENT_DELEGATION_WEBHOOK_URL not configured; skipping delegation notification.');
    return;
  }
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-laptop-procurement-secret'] = secret;

    const payload = {
      event: kind === 'granted' ? 'laptop_procurement.delegation_granted' : 'laptop_procurement.delegation_revoked',
      occurred_at: new Date().toISOString(),
      delegator: { email: params.delegatorEmail, name: params.delegatorName },
      delegate: { email: params.delegateEmail, name: params.delegateName },
      expires_at: params.expiresAt,
      app_url: `${getLaptopAppBaseUrl()}/laptop-procurement/my-work`,
    };
    const response = await postLaptopWebhook(webhookUrl, headers, payload);
    if (!response.ok) {
      console.error('[Laptop Procurement n8n] Delegation webhook failed', response.status, response.statusText);
    } else {
      console.log('[Laptop Procurement n8n] Delegation webhook sent', { kind, status: response.status });
    }
  } catch (err) {
    console.error('[Laptop Procurement n8n] Delegation webhook failed', laptopWebhookErrorMessage(err), err);
  }
}

/**
 * Notifies whoever is next in the approval chain (IT Manager → Country Manager →
 * IT Director → Supply Chain Director) that a request needs their attention. The
 * real recipients are resolved from laptop_approver_matrix, but for now every stage
 * is routed to a fixed test roster — see LAPTOP_APPROVAL_EMAIL_TEST_MODE and the
 * LAPTOP_APPROVAL_TEST_*_EMAIL vars below.
 */
async function notifyLaptopNextApprover(request: LaptopRequest): Promise<void> {
  const webhookUrl = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    console.warn('[Laptop Procurement n8n] N8N_LAPTOP_PROCUREMENT_WEBHOOK_URL not configured; skipping approval-chain notification.');
    return;
  }
  const stage = getLaptopApprovalStage(request.status);
  if (!stage) return;

  try {
    const matrixRows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_approver_matrix WHERE country = ? AND is_active = TRUE LIMIT 1`,
      [request.country],
    );
    const matrix = matrixRows[0];

    const matrixRecipients: Array<{ name: string | null; email: string }> =
      stage === 'IT Manager'
        ? ([
            { name: (matrix?.it_manager_name as string) ?? null, email: matrix?.it_manager_email as string },
            { name: (matrix?.it_manager_2_name as string) ?? null, email: matrix?.it_manager_2_email as string },
          ].filter(r => r.email) as Array<{ name: string | null; email: string }>)
        : stage === 'Country Manager'
          ? (matrix?.cm_email ? [{ name: (matrix.cm_name as string) ?? null, email: matrix.cm_email as string }] : [])
          : stage === 'IT Director'
            ? (matrix?.itd_email ? [{ name: (matrix.itd_name as string) ?? null, email: matrix.itd_email as string }] : [])
            : (matrix?.scd_email ? [{ name: (matrix.scd_name as string) ?? null, email: matrix.scd_email as string }] : []);

    // The approver matrix is static per country — if whoever it names has delegated
    // their authority (laptop_delegations), the notification needs to follow that to
    // the delegate, same as getActor() already does for who can actually act on the
    // request. Otherwise the delegate never finds out there's anything to review.
    const realRecipients = await Promise.all(
      matrixRecipients.map(async r => {
        const delegate = await resolveActiveLaptopDelegateEmail(r.email);
        return delegate ? { name: delegate.name ?? r.name, email: delegate.email } : r;
      }),
    );

    // TESTING OVERRIDE: replace the real laptop_approver_matrix lookup above with a fixed
    // per-stage test roster, so the full chain — including the IT Manager → IT Manager 2
    // escalation — can be exercised safely before the real matrix is verified end-to-end.
    // Set LAPTOP_APPROVAL_EMAIL_TEST_MODE=false to deliver to the real matrix recipients.
    const testMode = process.env.LAPTOP_APPROVAL_EMAIL_TEST_MODE !== 'false';
    const testStageCandidates: Record<LaptopApprovalStage, Array<{ name: string; email: string }>> = {
      'IT Manager': [
        { name: 'IT Manager (test)', email: process.env.LAPTOP_APPROVAL_TEST_IT_MANAGER_EMAIL?.trim() || 'sbagalkot@nesr.com' },
        { name: 'IT Manager 2 (test)', email: process.env.LAPTOP_APPROVAL_TEST_IT_MANAGER_2_EMAIL?.trim() || 'sbagalkot@nesr.com' },
      ],
      'Country Manager': [
        { name: 'Country Manager (test)', email: process.env.LAPTOP_APPROVAL_TEST_CM_EMAIL?.trim() || 'cmorales@nesr.com' },
      ],
      'IT Director': [
        { name: 'IT Director (test)', email: process.env.LAPTOP_APPROVAL_TEST_ITD_EMAIL?.trim() || 'mfarhan@nesr.com' },
      ],
      'Supply Chain Director': [
        { name: 'Supply Chain Director (test)', email: process.env.LAPTOP_APPROVAL_TEST_SCD_EMAIL?.trim() || 'sbagalkot@nesr.com' },
      ],
    };

    // `intended_recipients` is the full candidate list for the stage (used by the n8n workflow
    // to pick an escalation target); `recipients` is only the primary — who gets emailed right now.
    const intendedRecipients = testMode ? testStageCandidates[stage] : realRecipients;
    const routedRecipients = testMode ? [testStageCandidates[stage][0]] : realRecipients;

    if (routedRecipients.length === 0) {
      console.warn('[Laptop Procurement n8n] No approver configured for stage; skipping notification', { stage, country: request.country });
      return;
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const secret = process.env.N8N_LAPTOP_PROCUREMENT_WEBHOOK_SECRET?.trim();
    if (secret) headers['x-laptop-procurement-secret'] = secret;

    const payload = {
      event: 'laptop_procurement.approval_needed',
      occurred_at: new Date().toISOString(),
      test_mode: testMode,
      stage,
      request: {
        id: request.id,
        reference_number: request.reference_number,
        status: request.status,
        priority: request.priority,
        request_type: request.request_type,
        country: request.country,
        segment: request.segment,
        type_of_device: request.type_of_device,
        requested_model: request.requested_model,
        requested_by_name: request.requested_by_name,
        requested_by_email: request.requested_by_email,
        created_at: request.created_at,
      },
      intended_recipients: intendedRecipients,
      recipients: routedRecipients,
      detail_url: `${getLaptopAppBaseUrl()}/laptop-procurement/requests/${request.id}`,
    };

    const response = await postLaptopWebhook(webhookUrl, headers, payload);
    if (!response.ok) {
      console.error('[Laptop Procurement n8n] Approval webhook failed', response.status, response.statusText);
    } else {
      console.log('[Laptop Procurement n8n] Approval webhook sent', { stage, requestId: request.id, status: response.status });
    }
  } catch (err) {
    console.error('[Laptop Procurement n8n] Approval webhook failed', laptopWebhookErrorMessage(err), err);
  }
}

/* ── Validation / misc helpers ────────────────────────────────── */

function blankToNull(value: unknown): string | number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value as string | number;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value.trim();
}

async function makeReference(): Promise<string> {
  const rows = await sql<QueryResultRow[]>(
    `SELECT reference_number FROM laptop_requests
     WHERE reference_number ~ '^PLP[0-9]+$'
     ORDER BY (substring(reference_number from 4))::int DESC
     LIMIT 1`,
  );
  const last = rows[0]?.reference_number as string | undefined;
  const lastNum = last ? Number(last.slice(3)) : 0;
  const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
  return `PLP${String(next).padStart(5, '0')}`;
}

async function writeActivity(input: {
  requestId: number;
  referenceNumber: string;
  action: string;
  actor: LaptopActor;
  notes?: string | null;
}): Promise<void> {
  await exec(
    `INSERT INTO laptop_activity_log (request_id, reference_number, action, actor_name, actor_email, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [input.requestId, input.referenceNumber, input.action, input.actor.name, input.actor.email, input.notes ?? null],
  );
}

function buildStats(requests: LaptopRequest[]) {
  const isAssigned = (s: string) => s === 'Assign from Inventory' || s === 'Assign from Inventory & Closed';
  return {
    total: requests.length,
    pending_review: requests.filter(r => isActiveApprovalStatus(r.status)).length,
    procure_new: requests.filter(r => r.status === 'Procure New' || r.status === 'Approved').length,
    assigned_inventory: requests.filter(r => isAssigned(r.status)).length,
    repaired: requests.filter(r => r.status === 'Repaired & Closed').length,
    rejected: requests.filter(r => r.status.startsWith('Rejected')).length,
    laptops: requests.filter(r => (r.type_of_device ?? '').toLowerCase() === 'laptop').length,
    desktops: requests.filter(r => (r.type_of_device ?? '').toLowerCase() === 'desktop').length,
  };
}

// Same stats as buildStats, but computed with SQL aggregates against an optional
// scope (WHERE clause + params) instead of pulling every matching row into JS first —
// for callers (admin panel, dashboard) that only need the counts, not the rows.
async function computeLaptopStats(whereClause: string, whereParams: QueryParams): Promise<LaptopDashboardStats> {
  const activePlaceholders = APPROVAL_ACTIVE_STATUSES.map(() => '?').join(', ');
  const rows = await sql<QueryResultRow[]>(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE status IN (${activePlaceholders}))::int AS pending_review,
       COUNT(*) FILTER (WHERE status IN ('Procure New', 'Approved'))::int AS procure_new,
       COUNT(*) FILTER (WHERE status IN ('Assign from Inventory', 'Assign from Inventory & Closed'))::int AS assigned_inventory,
       COUNT(*) FILTER (WHERE status = 'Repaired & Closed')::int AS repaired,
       COUNT(*) FILTER (WHERE status LIKE 'Rejected%')::int AS rejected,
       COUNT(*) FILTER (WHERE LOWER(type_of_device) = 'laptop')::int AS laptops,
       COUNT(*) FILTER (WHERE LOWER(type_of_device) = 'desktop')::int AS desktops
     FROM laptop_requests
     ${whereClause}`,
    [...APPROVAL_ACTIVE_STATUSES, ...whereParams],
  );
  const row = rows[0] ?? {};
  return {
    total: Number(row.total ?? 0),
    pending_review: Number(row.pending_review ?? 0),
    procure_new: Number(row.procure_new ?? 0),
    assigned_inventory: Number(row.assigned_inventory ?? 0),
    repaired: Number(row.repaired ?? 0),
    rejected: Number(row.rejected ?? 0),
    laptops: Number(row.laptops ?? 0),
    desktops: Number(row.desktops ?? 0),
  };
}

function buildMonthlyTrend(requests: LaptopRequest[]): LaptopMonthlyMetric[] {
  const map = new Map<string, number>();
  for (const r of requests) {
    const basis = r.requested_date || r.created_at;
    const d = new Date(basis);
    if (Number.isNaN(d.getTime())) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    map.set(month, (map.get(month) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([month, count]) => ({ month, count }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-18);
}

// Label describing who a request is currently waiting on (or its terminal outcome).
function getPendingWithLabel(status: LaptopRequestStatus): string {
  switch (status) {
    case 'Submitted':
    case 'IT Approval':
      return 'IT Team';
    case 'CM Approval':
      return 'Country Manager';
    case 'Procure New Details':
      return 'IT Team';
    case 'CM Confirm Device':
      return 'Country Manager';
    case 'IT Director Approval':
      return 'IT Director';
    case 'Supply Chain Director Approval':
      return 'Supply Chain Director';
    case 'Rejected':
    case 'Rejected by CM':
    case 'Rejected by ITD':
    case 'Rejected by SCD':
      return 'Rejected';
    case 'Cancelled':
      return 'Cancelled';
    default:
      return 'Closed';
  }
}

// Maps the stage being approved to the column that records its approval timestamp.
const STAGE_APPROVED_DATE_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'it_team_approved_date',
  'IT Approval': 'it_team_approved_date',
  'CM Approval': 'cm_approved_date',
  'IT Director Approval': 'itd_approved_date',
  'Supply Chain Director Approval': 'scd_approved_date',
};

// Maps the stage being decided to the column that records who acted on it.
const STAGE_APPROVER_NAME_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'it_manager',
  'IT Approval': 'it_manager',
  'CM Approval': 'country_manager',
  'IT Director Approval': 'it_director',
  'Supply Chain Director Approval': 'sc_director',
};

function revalidateLaptopPaths(): void {
  revalidatePath('/laptop-procurement');
  revalidatePath('/laptop-procurement/requests');
  revalidatePath('/laptop-procurement/requests/new');
  revalidatePath('/laptop-procurement/my-work');
  revalidatePath('/laptop-procurement/analytics');
  // Deliberately NOT revalidating '/admin': that shared shell's Server Component
  // fetches data for every admin tool in one Promise.all (ProcureGuard, SourceGuide,
  // TI-TE, ...), several of which fail against databases this environment can't
  // reach — revalidating it here made every laptop-procurement mutation pay for
  // those unrelated failures in the background. LaptopAdminClient manages its own
  // data after mount (see refreshAdminData) and no longer depends on this route's
  // cache being fresh, so the only cost of dropping this is that a laptop-related
  // tab elsewhere in the SAME shared shell (Analytics, Access Approvals) could show
  // stale data until that admin reloads — a much smaller cost than paying for three
  // broken database connections on every delete.
}

/* ── Device catalogue ─────────────────────────────────────────── */

export async function getLaptopDeviceOptions(): Promise<LaptopDeviceOption[]> {
  try {
    const rows = await sql<QueryResultRow[]>(
      `SELECT type_of_device, model FROM laptop_device_catalog WHERE active = TRUE ORDER BY type_of_device, model`,
    );
    return serialise<LaptopDeviceOption[]>(rows);
  } catch (err) {
    console.error('[getLaptopDeviceOptions]', err);
    return [];
  }
}

export async function addLaptopDevice(input: CreateLaptopDeviceInput): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData) return { success: false, error: 'Catalog management access is required.' };
    const typeOfDevice = requireText(input.type_of_device, 'Type of device');
    const model = requireText(input.model, 'Model');

    await exec(
      `INSERT INTO laptop_device_catalog (type_of_device, model, active) VALUES (?, ?, TRUE)`,
      [typeOfDevice, model],
    );
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    console.error('[addLaptopDevice]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to add device.' };
  }
}

export async function updateLaptopDevice(id: number, input: UpdateLaptopDeviceInput): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData) return { success: false, error: 'Catalog management access is required.' };

    const sets: string[] = [];
    const params: QueryParams = [];
    if (input.type_of_device !== undefined) { sets.push('type_of_device = ?'); params.push(requireText(input.type_of_device, 'Type of device')); }
    if (input.model !== undefined) { sets.push('model = ?'); params.push(requireText(input.model, 'Model')); }
    if (input.active !== undefined) { sets.push('active = ?'); params.push(input.active); }
    if (sets.length === 0) return { success: true };

    await exec(`UPDATE laptop_device_catalog SET ${sets.join(', ')} WHERE id = ?`, [...params, id]);
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopDevice]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update device.' };
  }
}

export async function deleteLaptopDevice(id: number): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManageData) return { success: false, error: 'Catalog management access is required.' };
    await exec(`DELETE FROM laptop_device_catalog WHERE id = ?`, [id]);
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopDevice]', err);
    return { success: false, error: 'Failed to delete device.' };
  }
}

/* ── Reads ────────────────────────────────────────────────────── */

export async function getLaptopRequestsData(): Promise<LaptopRequestListData | null> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_requests ${scope.where} ORDER BY created_at DESC, id DESC`,
      scope.params,
    );
    return { actor, requests: serialise<LaptopRequest[]>(rows) };
  } catch (err) {
    console.error('[getLaptopRequestsData]', err);
    return null;
  }
}

export async function getLaptopDashboardData(): Promise<LaptopDashboardData | null> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const scope = scopedWhere(actor);

    // Only the top 7 active-approval requests, in the same priority order the widget
    // displays them — avoids pulling every visible request (which can run into the
    // hundreds for a canViewAll actor) just to show a handful.
    const priorityRank = `CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 WHEN 'Normal' THEN 2 WHEN 'Low' THEN 3 ELSE 2 END`;
    const activePlaceholders = APPROVAL_ACTIVE_STATUSES.map(() => '?').join(', ');
    const pendingWhere = scope.where ? `${scope.where} AND status IN (${activePlaceholders})` : `WHERE status IN (${activePlaceholders})`;

    const [pendingRows, activityRows, stats] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_requests ${pendingWhere} ORDER BY ${priorityRank}, created_at DESC LIMIT 7`,
        [...scope.params, ...APPROVAL_ACTIVE_STATUSES],
      ),
      sql<QueryResultRow[]>(
        actor.permissions.canViewAll
          ? `SELECT * FROM laptop_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 12`
          : `SELECT a.* FROM laptop_activity_log a
             JOIN laptop_requests r ON a.request_id = r.id
             WHERE r.requested_by_email = ? AND a.request_id > 0 AND a.action NOT ILIKE '%seeded%'
             ORDER BY a.created_at DESC LIMIT 12`,
        actor.permissions.canViewAll ? [] : [actor.email],
      ),
      computeLaptopStats(scope.where, scope.params),
    ]);

    return {
      stats,
      pendingQueue: serialise<LaptopRequest[]>(pendingRows),
      activity: serialise<LaptopActivityRow[]>(activityRows),
      actor,
    };
  } catch (err) {
    console.error('[getLaptopDashboardData]', err);
    return null;
  }
}

export async function getLaptopRequestDetail(id: number): Promise<LaptopRequestDetailData | null> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return null;

    const request = serialise<LaptopRequest>(rows[0]);
    // Visible if EITHER the actor's own identity or any identity they hold via
    // delegation can see it — mirrors the list query (scopedWhere), which already
    // accounts for delegation. Every delegation grant already has canViewAll=true
    // (enforced in resolveLaptopDelegations), so only the actor's own identity ever
    // needs the "it's my own request" fallback.
    const canView = laptopActingIdentities(actor).some(id =>
      id.permissions.canViewAll
        ? (id.role === 'Admin' || anyMatrixCapabilityForCountry(id.matrixCapabilities, request.country))
        : id.email.toLowerCase() === request.requested_by_email?.toLowerCase(),
    );
    if (!canView) return null;

    const [activityRows, documentRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM laptop_activity_log WHERE request_id = ? ORDER BY created_at DESC`, [id]),
      sql<QueryResultRow[]>(
        `SELECT id, request_id, document_name, original_name, document_type, file_type, file_size,
                uploaded_by_name, uploaded_by_email, uploaded_at
         FROM laptop_documents WHERE request_id = ? ORDER BY uploaded_at DESC`,
        [id],
      ),
    ]);

    return {
      actor,
      request,
      activity: serialise<LaptopActivityRow[]>(activityRows),
      documents: serialise<LaptopDocument[]>(documentRows),
      actions: getScopedActions(actor, request),
    };
  } catch (err) {
    console.error('[getLaptopRequestDetail]', err);
    return null;
  }
}

export async function getLaptopWorkQueueData(): Promise<LaptopWorkQueueData | null> {
  try {
    const actor = await getActor();
    requireReviewerQueueAccess(actor);
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(
      `SELECT * FROM laptop_requests ${scope.where} ORDER BY created_at DESC, id DESC`,
      scope.params,
    );
    const requests = serialise<LaptopRequest[]>(rows);
    const items = requests
      .map(request => ({ request, actions: getScopedActions(actor, request) }))
      .filter(item => item.actions.canApprove || item.actions.canReject || item.actions.canAssignInventory || item.actions.canProcureNew || item.actions.canSubmitProcureDetails)
      .sort((a, b) => {
        const rank: Record<string, number> = { Critical: 0, High: 1, Normal: 2, Low: 3 };
        return (rank[a.request.priority] ?? 2) - (rank[b.request.priority] ?? 2)
          || new Date(a.request.created_at).getTime() - new Date(b.request.created_at).getTime();
      });

    return {
      actor,
      items,
      stats: {
        total: items.length,
        approval: items.filter(item => item.actions.canApprove).length,
        it_review: items.filter(item => IT_MANAGER_STATUSES.includes(item.request.status)).length,
      },
    };
  } catch (err) {
    console.error('[getLaptopWorkQueueData]', err);
    return null;
  }
}

// Everyone eligible to be picked as a delegation's "approver (delegator)": Admins from
// laptop_permissions, plus everyone named anywhere in the approver matrix (their real
// source of approval authority now). Deduped by email — an Admin who also happens to
// be named in the matrix is just shown as Admin, since that already covers everything.
const APPROVER_MATRIX_ROLE_SET: Set<string> = new Set(APPROVER_MATRIX_ROLES);

type MatrixApproverAcc = { email: string; name: string | null; stages: Map<LaptopApprovalStage, Set<string>> };

// Every person named anywhere in the active approver matrix, keyed by email, with the
// stage(s) and country(ies) they're the approver for — shared by the Delegations
// dropdown (buildDelegationApprovers) and the Permissions tab's merged list
// (buildMergedPermissionsList).
function accumulateMatrixApprovers(matrixRows: QueryResultRow[]): Map<string, MatrixApproverAcc> {
  const byEmail = new Map<string, MatrixApproverAcc>();
  const addApprover = (rawEmail: unknown, rawName: unknown, stage: LaptopApprovalStage, country: string) => {
    const email = String(rawEmail ?? '').trim();
    if (!email) return;
    const key = email.toLowerCase();
    let entry = byEmail.get(key);
    if (!entry) {
      entry = { email, name: null, stages: new Map() };
      byEmail.set(key, entry);
    }
    if (!entry.name && rawName) entry.name = String(rawName);
    if (!entry.stages.has(stage)) entry.stages.set(stage, new Set());
    entry.stages.get(stage)!.add(country);
  };
  for (const row of matrixRows) {
    const country = String(row.country ?? '').trim();
    if (!country) continue;
    addApprover(row.it_manager_email, row.it_manager_name, 'IT Manager', country);
    addApprover(row.it_manager_2_email, row.it_manager_2_name, 'IT Manager', country);
    addApprover(row.cm_email, row.cm_name, 'Country Manager', country);
    addApprover(row.itd_email, row.itd_name, 'IT Director', country);
    addApprover(row.scd_email, row.scd_name, 'Supply Chain Director', country);
  }
  return byEmail;
}

function summariseMatrixApprover(entry: MatrixApproverAcc): { role: string; country: string } {
  const stages = [...entry.stages.keys()];
  const countries = new Set<string>();
  for (const set of entry.stages.values()) for (const c of set) countries.add(c);
  const country = countries.size === 1 ? [...countries][0] : `${countries.size} countries`;
  return { role: stages.join(', '), country };
}

// Everyone eligible to be a delegation's "approver (delegator)": Admins from
// laptop_permissions, plus everyone named anywhere in the approver matrix (their real
// source of approval authority now). Deduped by email — an Admin who also happens to
// be named in the matrix is just shown as Admin, since that already covers everything.
function buildDelegationApprovers(
  permissionRows: QueryResultRow[],
  matrixRows: QueryResultRow[],
): Array<{ email: string; name: string | null; role: string; country: string | null }> {
  const byEmail = accumulateMatrixApprovers(matrixRows);
  const approvers = new Map<string, { email: string; name: string | null; role: string; country: string | null }>();
  for (const entry of byEmail.values()) {
    approvers.set(entry.email.toLowerCase(), { email: entry.email, name: entry.name, ...summariseMatrixApprover(entry) });
  }
  for (const row of permissionRows) {
    if (row.role !== 'Admin') continue;
    const email = String(row.email ?? '').trim();
    if (!email) continue;
    approvers.set(email.toLowerCase(), { email, name: (row.name as string | null) ?? null, role: 'Admin', country: null });
  }
  return [...approvers.values()].sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
}

// The Permissions tab's actual displayed list: Admin/Analyst/Read Only/Requester rows
// straight from laptop_permissions (source: 'permissions'), plus one synthesized row
// per (email, stage) named anywhere in the approver matrix (source: 'matrix') — split
// per stage, not merged per person, so someone holding several stages (like Aamil
// holding both Country Manager and Supply Chain Director) can have just one removed.
// Stale IT Manager/Country Manager/IT Director/Supply Chain Director rows left over in
// laptop_permissions from before the switch are intentionally excluded, since they no
// longer grant anything.
function buildMergedPermissionsList(
  permissionRows: QueryResultRow[],
  matrixRows: QueryResultRow[],
): LaptopPermissionListItem[] {
  const items: LaptopPermissionListItem[] = [];
  for (const row of permissionRows) {
    if (!APPROVER_MATRIX_ROLE_SET.has(String(row.role))) {
      items.push({
        source: 'permissions',
        email: String(row.email ?? ''),
        name: (row.name as string | null) ?? null,
        role: String(row.role ?? ''),
        country: (row.country as string | null) ?? null,
        segment: (row.segment as string | null) ?? null,
      });
    }
  }
  const byEmail = accumulateMatrixApprovers(matrixRows);
  for (const entry of byEmail.values()) {
    for (const [stage, countries] of entry.stages) {
      const country = countries.size === 1 ? [...countries][0] : `${countries.size} countries`;
      items.push({ source: 'matrix', email: entry.email, name: entry.name, role: stage, country, segment: null });
    }
  }
  return items.sort((a, b) => a.role.localeCompare(b.role) || a.email.localeCompare(b.email));
}

export async function getLaptopAdminData(requestsPage: number = 0): Promise<LaptopAdminData | null> {
  try {
    const actor = await requireAdminActor();
    await ensureLaptopDelegationTable();
    await expireStaleLaptopDelegations();
    const offset = Math.max(0, Math.floor(requestsPage)) * ADMIN_REQUESTS_PAGE_SIZE;
    const [requestRows, requestsCountRows, activityRows, permissionRows, delegationRows, deviceRows, matrixRows, stats] = await Promise.all([
      // Only the current page — the table only ever shows ADMIN_REQUESTS_PAGE_SIZE
      // rows at a time, so there's no reason to pull the entire (and ever-growing)
      // requests table on every admin panel load or action.
      sql<QueryResultRow[]>(`SELECT * FROM laptop_requests ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`, [ADMIN_REQUESTS_PAGE_SIZE, offset]),
      sql<QueryResultRow[]>(`SELECT COUNT(*)::int AS count FROM laptop_requests`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 100`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_permissions ORDER BY role, email`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_delegations ORDER BY is_active DESC, COALESCE(revoked_at, created_at) DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_device_catalog ORDER BY type_of_device, model`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_approver_matrix WHERE is_active = TRUE`),
      computeLaptopStats('', []),
    ]);
    const delegations = serialise<LaptopDelegationRow[]>(delegationRows);
    return {
      actor,
      requests: serialise<LaptopRequest[]>(requestRows),
      requestsTotal: Number(requestsCountRows[0]?.count ?? 0),
      activity: serialise<LaptopActivityRow[]>(activityRows),
      permissions: serialise<LaptopPermissionRow[]>(permissionRows),
      delegations,
      deviceCatalog: serialise<LaptopDeviceCatalogRow[]>(deviceRows),
      stats,
      approvers: buildDelegationApprovers(permissionRows, matrixRows),
      permissionsList: buildMergedPermissionsList(permissionRows, matrixRows),
    };
  } catch (err) {
    console.error('[getLaptopAdminData]', err);
    return null;
  }
}

export async function getLaptopAnalyticsData(): Promise<LaptopAnalyticsData | null> {
  try {
    const actor = await getActor();
    requireAnalyticsAccess(actor);
    const scope = scopedWhere(actor);
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests ${scope.where}`, scope.params);
    const requests = serialise<LaptopRequest[]>(rows);

    const tally = (key: (r: LaptopRequest) => string | null | undefined): LaptopAnalyticsMetric[] => {
      const map = new Map<string, number>();
      for (const r of requests) {
        const label = (key(r) ?? '').trim() || 'Unspecified';
        map.set(label, (map.get(label) ?? 0) + 1);
      }
      return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    };

    return {
      actor,
      stats: {
        ...buildStats(requests),
        active_requester_count: new Set(requests.map(r => r.requested_by_email.trim().toLowerCase()).filter(Boolean)).size,
        country_count: new Set(requests.map(r => (r.country ?? '').trim().toLowerCase()).filter(Boolean)).size,
      },
      status_breakdown: tally(r => r.status),
      request_type_breakdown: tally(r => r.request_type),
      device_breakdown: tally(r => r.type_of_device),
      country_breakdown: tally(r => r.country).slice(0, 12),
      segment_breakdown: tally(r => r.segment).slice(0, 12),
      top_models: tally(r => r.requested_model).slice(0, 10),
      monthly_trend: buildMonthlyTrend(requests),
      generated_at: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[getLaptopAnalyticsData]', err);
    return null;
  }
}

/* ── Create / update ──────────────────────────────────────────── */

function validateCreateInput(input: CreateLaptopRequestInput) {
  return {
    requestType: requireText(input.request_type, 'Type of request'),
    country: requireText(input.country, 'Country'),
    companyCode: requireText(input.company_code, 'Company Code'),
    companyName: requireText(input.company_name, 'Company Name'),
    costCenter: requireText(input.cost_center, 'Cost Center'),
    typeOfDevice: requireText(input.type_of_device, 'Type of device'),
    // No longer collected from the requester — the IT Team fills this in later, only if
    // the request is actually flagged for new-device procurement (see submitProcureNewDetails).
    requestedModel: blankToNull(input.requested_model),
    reason: requireText(input.special_requirements, 'Special requirements / justification'),
  };
}

async function insertRequest(input: CreateLaptopRequestInput & Partial<UpdateLaptopExistingDeviceInput>, opts: {
  reference: string;
  status: LaptopRequestStatus;
  requestedByName: string;
  requestedByEmail: string;
  validated: ReturnType<typeof validateCreateInput>;
}): Promise<number> {
  const v = opts.validated;
  // Existing Device fields are only ever set by an admin backfilling a request
  // (AdminCreateLaptopRequestInput) — the normal requester flow never collects
  // them; the IT Manager fills them in once the request reaches that stage.
  const result = await exec(
    `INSERT INTO laptop_requests
      (reference_number, employee_id, status, priority, request_type, indirect_request, pending_with, country,
       requested_by_name, requested_by_email, computer_for, computer_for_employee_id, department,
       company_code, company_name, cost_center, type_of_device, requested_model, special_requirements,
       unit_id, current_brand, current_model, serial_no, age_years, sap_number)
     VALUES (?, ?, ?, ?, ?, FALSE, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    [
      opts.reference,
      blankToNull(input.employee_id),
      opts.status,
      input.priority || 'Normal',
      v.requestType,
      getPendingWithLabel(opts.status),
      v.country,
      opts.requestedByName,
      opts.requestedByEmail,
      blankToNull(input.computer_for),
      blankToNull(input.computer_for_employee_id),
      blankToNull(input.department),
      v.companyCode,
      v.companyName,
      v.costCenter,
      v.typeOfDevice,
      v.requestedModel,
      v.reason,
      blankToNull(input.unit_id),
      blankToNull(input.current_brand),
      blankToNull(input.current_model),
      blankToNull(input.serial_no),
      blankToNull(input.age_years),
      blankToNull(input.sap_number),
    ],
  );
  return result.insertId;
}

export async function createLaptopRequest(input: CreateLaptopRequestInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    if (!actor.permissions.canCreateRequests) throw new Error('Request creation access is required.');
    const validated = validateCreateInput(input);
    const reference = await makeReference();
    const id = await insertRequest(input, {
      reference,
      status: 'Submitted',
      requestedByName: actor.name,
      requestedByEmail: actor.email,
      validated,
    });
    await writeActivity({ requestId: id, referenceNumber: reference, action: 'Request submitted', actor });
    revalidateLaptopPaths();
    await notifyNewLaptopRequest(id);
    return { success: true, data: { id }, reference_number: reference };
  } catch (err) {
    console.error('[createLaptopRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create laptop request.' };
  }
}

async function notifyNewLaptopRequest(id: number): Promise<void> {
  try {
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    if (rows[0]) await notifyLaptopNextApprover(serialise<LaptopRequest>(rows[0]));
  } catch (err) {
    console.error('[notifyNewLaptopRequest]', err);
  }
}

export async function updateLaptopRequest(id: number, input: CreateLaptopRequestInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const ownsRequest = String(row.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    if (!(ownsRequest || actor.permissions.canManageData)) {
      return { success: false, error: 'You can only edit your own requests.' };
    }
    if (!IT_MANAGER_STATUSES.includes(row.status as LaptopRequestStatus) && !actor.permissions.canManageData) {
      return { success: false, error: 'This request can no longer be edited because it has entered the approval chain.' };
    }

    const v = validateCreateInput(input);
    await exec(
      `UPDATE laptop_requests SET
         employee_id = ?, priority = ?, request_type = ?, country = ?, computer_for = ?, computer_for_employee_id = ?,
         department = ?, company_code = ?, company_name = ?, cost_center = ?,
         type_of_device = ?, requested_model = ?, special_requirements = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        blankToNull(input.employee_id), input.priority || 'Normal', v.requestType, v.country,
        blankToNull(input.computer_for), blankToNull(input.computer_for_employee_id), blankToNull(input.department),
        v.companyCode, v.companyName, v.costCenter,
        // Requested model isn't collected on this form — preserve whatever the IT Team may
        // have already filled in via submitProcureNewDetails rather than blanking it out.
        v.typeOfDevice, v.requestedModel ?? row.requested_model, v.reason, id,
      ],
    );
    await writeActivity({ requestId: id, referenceNumber: row.reference_number, action: 'Request updated', actor });
    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    return { success: true, data: { id }, reference_number: row.reference_number };
  } catch (err) {
    console.error('[updateLaptopRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update laptop request.' };
  }
}

/**
 * Existing Device details (the device being replaced/upgraded) are filled in by
 * the IT Manager once the request reaches them — never collected from the
 * requester. Restricted to whichever identity (own or delegated) owns the IT
 * Manager stage, and only while the request is actually at that stage.
 */
export async function updateLaptopExistingDevice(id: number, input: UpdateLaptopExistingDeviceInput): Promise<ActionResult> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    if (!IT_MANAGER_STATUSES.includes(currentStatus) && !actor.permissions.canManageData) {
      return { success: false, error: 'Existing Device details can only be edited while the request is with the IT Manager.' };
    }
    const canEdit = actor.permissions.canManageData || laptopActingIdentities(actor).some(identity =>
      identity.permissions.canReviewItManager && (identity.role === 'Admin' || stageHasCountry(identity.matrixCapabilities, 'IT Manager', row.country)),
    );
    if (!canEdit) {
      return { success: false, error: 'IT Manager access is required to edit Existing Device details.' };
    }

    await exec(
      `UPDATE laptop_requests SET
         unit_id = ?, current_brand = ?, current_model = ?, serial_no = ?, age_years = ?, sap_number = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        blankToNull(input.unit_id), blankToNull(input.current_brand), blankToNull(input.current_model),
        blankToNull(input.serial_no), blankToNull(input.age_years), blankToNull(input.sap_number), id,
      ],
    );
    await writeActivity({ requestId: id, referenceNumber: row.reference_number, action: 'Existing Device details updated', actor });
    revalidatePath(`/laptop-procurement/requests/${id}`);
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopExistingDevice]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update existing device details.' };
  }
}

export async function createAdminLaptopRequest(input: AdminCreateLaptopRequestInput): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await requireAdminActor();
    const validated = validateCreateInput(input);
    const reference = await makeReference();
    const id = await insertRequest(input, {
      reference,
      status: input.status ?? 'Submitted',
      requestedByName: input.requested_by_name?.trim() || actor.name,
      requestedByEmail: input.requested_by_email?.trim() || actor.email,
      validated,
    });
    await writeActivity({ requestId: id, referenceNumber: reference, action: 'Request created by admin', actor });
    revalidateLaptopPaths();
    await notifyNewLaptopRequest(id);
    return { success: true, data: { id }, reference_number: reference };
  } catch (err) {
    console.error('[createAdminLaptopRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create laptop request.' };
  }
}

/* ── Status transitions ───────────────────────────────────────── */

const STAGE_COMMENT_COLUMN: Partial<Record<LaptopRequestStatus, string>> = {
  Submitted: 'itm_comments',
  'IT Approval': 'itm_comments',
  'CM Approval': 'cm_comments',
  'IT Director Approval': 'itd_comments',
  'Supply Chain Director Approval': 'scd_comments',
};

// Human-readable name of whoever is rejecting, for the activity log — only stages with
// a reject option appear here (see getRejectStatusForStage).
const REJECTING_STAGE_LABEL: Partial<Record<LaptopRequestStatus, string>> = {
  'CM Approval': 'Country Manager',
  'CM Confirm Device': 'Country Manager',
  'IT Director Approval': 'IT Director',
  'Supply Chain Director Approval': 'Supply Chain Director',
};

/**
 * Every rejection bounces the request back to the IT Manager to fix and resend, rather
 * than ending it outright — the IT Manager themselves has no reject option (see
 * getRejectStatusForStage). Distinct from updateLaptopRequestStatus since the target
 * status is always the same regardless of which stage rejected, and a reason is always
 * required.
 */
export async function rejectLaptopRequest(id: number, reason: string): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    const stageLabel = REJECTING_STAGE_LABEL[currentStatus];
    const requiredPermission = getRequiredPermissionForStage(currentStatus);
    if (!stageLabel || !requiredPermission) {
      return { success: false, error: 'This request cannot be rejected at its current stage.' };
    }

    const acting = resolveLaptopActing(actor, requiredPermission, true, row);
    if (!acting.allowed) {
      if (acting.reason === 'reject') return { success: false, error: `${actor.role} cannot reject requests.` };
      if (acting.reason === 'scope') return { success: false, error: `${actor.role} access is limited to your assigned country / segment.` };
      return { success: false, error: `${actor.role} cannot reject this request.` };
    }

    const trimmedReason = requireText(reason, 'Rejection reason');
    const nextStatus: LaptopRequestStatus = 'IT Approval';
    const stageColumn = STAGE_COMMENT_COLUMN[currentStatus];

    const sets = [
      'status = ?', 'pending_with = ?', 'reviewed_by_name = ?', 'reviewed_by_email = ?',
      'reviewed_at = CURRENT_TIMESTAMP', 'rejection_reason = ?', 'review_comments = ?', 'updated_at = CURRENT_TIMESTAMP',
    ];
    const params: QueryParams = [nextStatus, getPendingWithLabel(nextStatus), actor.name, actor.email, trimmedReason, trimmedReason];
    if (stageColumn) { sets.push(`${stageColumn} = ?`); params.push(trimmedReason); }
    params.push(id);

    await exec(`UPDATE laptop_requests SET ${sets.join(', ')} WHERE id = ?`, params);
    await writeActivity({
      requestId: id,
      referenceNumber: row.reference_number,
      action: `Rejected by ${stageLabel} — returned to IT Manager`,
      actor,
      notes: trimmedReason,
    });
    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    await notifyLaptopNextApprover(serialise<LaptopRequest>({ ...row, status: nextStatus }));
    return { success: true };
  } catch (err) {
    console.error('[rejectLaptopRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to reject request.' };
  }
}

export async function updateLaptopRequestStatus(
  id: number,
  status: LaptopRequestStatus,
  notes?: string,
  assignedLaptop?: AssignExistingLaptopInput,
): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    const currentStatus = row.status as LaptopRequestStatus;
    const ownsRequest = String(row.requested_by_email).toLowerCase() === actor.email.toLowerCase();
    const comment = typeof notes === 'string' ? notes.trim() : '';

    const userCancellingOwnRequest = ownsRequest && status === 'Cancelled';
    let requiredPermission: LaptopPermissionKey | null = null;
    let onBehalfOf: string | null = null;
    const hasAssignedUnit = laptopHasAssignedUnit(row);
    const isProcureNewFlow = laptopIsProcureNewFlow(row);

    if (userCancellingOwnRequest && actor.permissions.canCreateRequests) {
      if (!IT_MANAGER_STATUSES.includes(currentStatus)) {
        return { success: false, error: 'This request can only be cancelled before approvals begin.' };
      }
    } else {
      // "Assign existing laptop" isn't a distinct transition anymore — it's the IT
      // Manager's normal approve-forward move, just with a specific unit attached (see
      // assignedLaptopAssignment below). Rejections are handled by rejectLaptopRequest,
      // never here.
      const isApproveMove = getNextApprovalStatus(currentStatus, hasAssignedUnit, isProcureNewFlow) === status;
      // Country Manager can flag a request as needing a brand new device procured instead
      // of approving it outright — routes to the IT Team for device details. Also how a CM
      // overrides an IT Manager's "Assign existing laptop" pick (see clearsAssignedUnit below).
      const isCmProcureNewMove = currentStatus === 'CM Approval' && status === 'Procure New Details';
      // Repair & Closed stays an IT-Manager-only outcome (only they assess the physical device).
      const isRepairMove = IT_MANAGER_STATUSES.includes(currentStatus) && status === 'Repaired & Closed';

      if (!isApproveMove && !isCmProcureNewMove && !isRepairMove) {
        return { success: false, error: `Cannot move ${row.reference_number} from ${currentStatus} to ${status}.` };
      }

      requiredPermission = getRequiredPermissionForStage(currentStatus);
      if (!requiredPermission) {
        return {
          success: false,
          error: `${actor.role} cannot move this request from ${currentStatus} to ${status}. Change your role in the admin panel.`,
        };
      }

      const acting = resolveLaptopActing(actor, requiredPermission, false, row);
      if (!acting.allowed) {
        if (acting.reason === 'scope') {
          return { success: false, error: `${actor.role} access is limited to your assigned country / segment.` };
        }
        return {
          success: false,
          error: `${actor.role} cannot move this request from ${currentStatus} to ${status}. Change your role in the admin panel.`,
        };
      }
      onBehalfOf = acting.onBehalfOf;
    }

    const stageColumn = STAGE_COMMENT_COLUMN[currentStatus];
    const setsReviewer = !userCancellingOwnRequest;

    // Stamp the stage approval timestamp when the current stage is signed off (not on cancellation).
    const stageDateColumn = !userCancellingOwnRequest ? STAGE_APPROVED_DATE_COLUMN[currentStatus] : undefined;
    const stageDateAssignment = stageDateColumn ? `, ${stageDateColumn} = CURRENT_TIMESTAMP` : '';
    // Build dynamic SET for the stage comment column when applicable.
    const stageCommentAssignment = stageColumn && comment ? `, ${stageColumn} = ?` : '';
    // Record who actually acted on this stage (approve, reject, or an alternate outcome) —
    // not just the timestamp, so "Assigned Approvers" shows a name instead of staying blank.
    const stageApproverColumn = setsReviewer ? STAGE_APPROVER_NAME_COLUMN[currentStatus] : undefined;
    const stageApproverAssignment = stageApproverColumn ? `, ${stageApproverColumn} = ?` : '';
    // "Assign existing laptop" hands over a specific second-hand unit — record which one,
    // separate from the current_brand/current_model/serial_no/age_years columns above,
    // which describe the OLD device being replaced.
    const assignedLaptopAssignment = assignedLaptop
      ? `, assigned_serial_no = ?, assigned_model = ?, assigned_age = ?`
      : '';
    // A CM choosing "Procure New" on a request that already has an assigned unit is
    // overriding the IT Manager's pick — clear it so hasAssignedUnit resets to false and
    // the rest of the chain (IT Director, SC Director) treats this as a genuine new-device
    // procurement rather than continuing the now-abandoned assign-from-inventory path.
    const clearsAssignedUnit = currentStatus === 'CM Approval' && status === 'Procure New Details' && hasAssignedUnit;
    const clearAssignedUnitAssignment = clearsAssignedUnit
      ? `, assigned_serial_no = NULL, assigned_model = NULL, assigned_age = NULL`
      : '';
    // Sticky flag: once the CM flags a request for a brand new device, it stays flagged
    // through the rest of the chain (see laptopIsProcureNewFlow) — even after resends —
    // so Supply Chain Director's final sign-off still lands on 'Procure New', not
    // 'Approved'.
    const flagsProcureNew = currentStatus === 'CM Approval' && status === 'Procure New Details';
    const procureNewFlagAssignment = flagsProcureNew ? `, procure_new_requested = TRUE` : '';

    const params: QueryParam[] = [
      status,
      getPendingWithLabel(status),
      setsReviewer ? actor.name : row.reviewed_by_name,
      setsReviewer ? actor.email : row.reviewed_by_email,
      setsReviewer,
      null,
      comment ? comment : row.review_comments,
    ];
    if (stageCommentAssignment) params.push(comment);
    if (stageApproverAssignment) params.push(actor.name);
    if (assignedLaptop) {
      params.push(
        blankToNull(assignedLaptop.serial_no),
        blankToNull(assignedLaptop.model),
        blankToNull(assignedLaptop.age),
      );
    }
    params.push(id);

    await exec(
      `UPDATE laptop_requests SET
         status = ?,
         pending_with = ?,
         reviewed_by_name = ?,
         reviewed_by_email = ?,
         reviewed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
         rejection_reason = ?,
         review_comments = ?${stageDateAssignment}${stageCommentAssignment}${stageApproverAssignment}${assignedLaptopAssignment}${clearAssignedUnitAssignment}${procureNewFlagAssignment},
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      params,
    );

    const activityNotes = [comment || null, onBehalfOf ? `On behalf of ${onBehalfOf}` : null]
      .filter(Boolean)
      .join(' — ') || null;

    await writeActivity({
      requestId: id,
      referenceNumber: row.reference_number,
      action: `Status updated to ${status}`,
      actor,
      notes: activityNotes,
    });

    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    await notifyLaptopNextApprover(serialise<LaptopRequest>({ ...row, status }));
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopRequestStatus]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update request status.' };
  }
}

/**
 * Country Manager flags a request as needing a brand new device instead of approving
 * it outright — it comes back here so the IT Team can specify exactly what to procure
 * (the requester never picks a model upfront). Submitting sends it back to the Country
 * Manager to confirm the specific device before it continues to IT Director.
 */
export async function submitProcureNewDetails(id: number, input: SubmitProcureNewDetailsInput): Promise<ActionResult> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Request not found.' };

    if (row.status !== 'Procure New Details' && !actor.permissions.canManageData) {
      return { success: false, error: 'Device details can only be submitted while the request is with the IT Team.' };
    }
    const canSubmit = actor.permissions.canManageData || laptopActingIdentities(actor).some(identity =>
      identity.permissions.canReviewItManager && (identity.role === 'Admin' || stageHasCountry(identity.matrixCapabilities, 'IT Manager', row.country)),
    );
    if (!canSubmit) {
      return { success: false, error: 'IT Manager access is required to submit device details.' };
    }

    const typeOfDevice = requireText(input.type_of_device, 'Type of device');
    const model = requireText(input.model, 'Model');
    const nextStatus: LaptopRequestStatus = 'CM Confirm Device';

    await exec(
      `UPDATE laptop_requests SET
         type_of_device = ?, requested_model = ?, status = ?, pending_with = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [typeOfDevice, model, nextStatus, getPendingWithLabel(nextStatus), id],
    );
    await writeActivity({ requestId: id, referenceNumber: row.reference_number, action: 'Device details submitted, sent to Country Manager for confirmation', actor });
    revalidateLaptopPaths();
    revalidatePath(`/laptop-procurement/requests/${id}`);
    await notifyLaptopNextApprover(serialise<LaptopRequest>({ ...row, status: nextStatus, type_of_device: typeOfDevice, requested_model: model }));
    return { success: true };
  } catch (err) {
    console.error('[submitProcureNewDetails]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to submit device details.' };
  }
}

export async function deleteLaptopRecord(recordType: 'request' | 'activity', id: number): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canDeleteRecords) return { success: false, error: 'Delete access is required.' };

    if (recordType === 'activity') {
      await exec(`DELETE FROM laptop_activity_log WHERE id = ?`, [id]);
      revalidateLaptopPaths();
      return { success: true };
    }

    const rows = await sql<QueryResultRow[]>(`SELECT reference_number FROM laptop_requests WHERE id = ? LIMIT 1`, [id]);
    if (!rows[0]) return { success: false, error: 'Record not found.' };
    await exec(`DELETE FROM laptop_requests WHERE id = ?`, [id]);
    await exec(`DELETE FROM laptop_documents WHERE request_id = ?`, [id]);
    await exec(`DELETE FROM laptop_activity_log WHERE request_id = ?`, [id]);
    revalidateLaptopPaths();
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopRecord]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to delete record.' };
  }
}

/* ── Documents ────────────────────────────────────────────────── */

export async function uploadLaptopDocument(formData: FormData): Promise<{ success: boolean; document?: LaptopDocument; error?: string }> {
  try {
    const actor = await getActor();
    requireOperationalAccess(actor);
    const requestId = Number(formData.get('request_id'));
    const file = formData.get('file') as File | null;
    const customName = ((formData.get('custom_name') as string) || '').trim() || (file ? fileBaseName(file.name) : 'Attachment');
    const documentType = ((formData.get('document_type') as string) || 'request_attachment').trim();

    if (!Number.isFinite(requestId) || requestId <= 0 || !file) {
      return { success: false, error: 'Missing required upload fields.' };
    }
    if (file.size > MAX_LAPTOP_FILE_BYTES) {
      return { success: false, error: 'File is too large. Maximum size is 10 MB.' };
    }

    const requestRows = await sql<QueryResultRow[]>(`SELECT id, reference_number, requested_by_email, country, segment FROM laptop_requests WHERE id = ? LIMIT 1`, [requestId]);
    if (!requestRows[0]) return { success: false, error: 'Request not found.' };
    const canView = laptopActingIdentities(actor).some(id =>
      id.permissions.canViewAll
        ? (id.role === 'Admin' || anyMatrixCapabilityForCountry(id.matrixCapabilities, requestRows[0].country))
        : id.email.toLowerCase() === requestRows[0].requested_by_email?.toLowerCase(),
    );
    if (!canView) {
      return { success: false, error: 'You can only upload files to your own requests.' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const insert = await exec(
      `INSERT INTO laptop_documents
         (request_id, document_name, original_name, document_type, file_type, file_size, file_content, uploaded_by_name, uploaded_by_email)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        requestId, customName, file.name !== customName ? file.name : null, documentType,
        detectMime(file), file.size, buffer, actor.name, actor.email,
      ],
    );

    const docs = await sql<QueryResultRow[]>(
      `SELECT id, request_id, document_name, original_name, document_type, file_type, file_size,
              uploaded_by_name, uploaded_by_email, uploaded_at
       FROM laptop_documents WHERE id = ? LIMIT 1`,
      [insert.insertId],
    );

    await writeActivity({ requestId, referenceNumber: requestRows[0].reference_number, action: 'Attachment uploaded', actor, notes: file.name });
    revalidatePath(`/laptop-procurement/requests/${requestId}`);
    return { success: true, document: serialise<LaptopDocument>(docs[0]) };
  } catch (err) {
    console.error('[uploadLaptopDocument]', err);
    return { success: false, error: 'Upload failed. Please try again.' };
  }
}

export async function deleteLaptopDocument(documentId: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    const docs = await sql<QueryResultRow[]>(
      `SELECT d.id, d.request_id, r.reference_number, r.requested_by_email
       FROM laptop_documents d JOIN laptop_requests r ON d.request_id = r.id
       WHERE d.id = ? LIMIT 1`,
      [documentId],
    );
    const doc = docs[0];
    if (!doc) return { success: false, error: 'Attachment not found.' };
    if (!actor.permissions.canManageData && doc.requested_by_email?.toLowerCase() !== actor.email.toLowerCase()) {
      return { success: false, error: 'You cannot remove this attachment.' };
    }
    await exec(`DELETE FROM laptop_documents WHERE id = ?`, [documentId]);
    await writeActivity({ requestId: doc.request_id, referenceNumber: doc.reference_number, action: 'Attachment removed', actor });
    revalidatePath(`/laptop-procurement/requests/${doc.request_id}`);
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopDocument]', err);
    return { success: false, error: 'Delete failed. Please try again.' };
  }
}

/* ── Permissions admin ────────────────────────────────────────── */

export async function updateLaptopPermission(input: UpdateLaptopPermissionInput): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    const email = requireText(input.email, 'Email').toLowerCase();
    const role = requireText(input.role, 'Role') as LaptopPermissionRole;
    if (!getPermissionProfile(role)) return { success: false, error: 'Unknown role.' };

    await exec(
      `INSERT INTO laptop_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, country = EXCLUDED.country,
         segment = EXCLUDED.segment, updated_at = CURRENT_TIMESTAMP`,
      [email, blankToNull(input.name), role, blankToNull(input.country), blankToNull(input.segment)],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopPermission]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update permission.' };
  }
}

export async function deleteLaptopPermission(email: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    await exec(`DELETE FROM laptop_permissions WHERE email = ?`, [email.toLowerCase()]);
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopPermission]', err);
    return { success: false, error: 'Failed to delete permission.' };
  }
}

/* ── Approver matrix admin ─────────────────────────────────────── */

export async function getLaptopApproverMatrix(): Promise<LaptopApproverMatrixRow[] | null> {
  try {
    await requireAdminActor();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_approver_matrix ORDER BY country`);
    return serialise<LaptopApproverMatrixRow[]>(rows);
  } catch (err) {
    console.error('[getLaptopApproverMatrix]', err);
    return null;
  }
}

export async function updateLaptopApproverMatrix(input: UpdateLaptopApproverMatrixInput): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };

    await exec(
      `UPDATE laptop_approver_matrix SET
         it_manager_name = ?, it_manager_email = ?,
         it_manager_2_name = ?, it_manager_2_email = ?,
         cm_name = ?, cm_email = ?,
         itd_name = ?, itd_email = ?,
         scd_name = ?, scd_email = ?,
         is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        blankToNull(input.it_manager_name), blankToNull(input.it_manager_email),
        blankToNull(input.it_manager_2_name), blankToNull(input.it_manager_2_email),
        blankToNull(input.cm_name), blankToNull(input.cm_email),
        blankToNull(input.itd_name), blankToNull(input.itd_email),
        blankToNull(input.scd_name), blankToNull(input.scd_email),
        input.is_active, input.id,
      ],
    );
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopApproverMatrix]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update approver matrix.' };
  }
}

const STAGE_TO_MATRIX_COLUMNS: Record<LaptopApprovalStage, { emailCol: string; nameCol: string }> = {
  'IT Manager': { emailCol: 'it_manager_email', nameCol: 'it_manager_name' },
  'Country Manager': { emailCol: 'cm_email', nameCol: 'cm_name' },
  'IT Director': { emailCol: 'itd_email', nameCol: 'itd_name' },
  'Supply Chain Director': { emailCol: 'scd_email', nameCol: 'scd_name' },
};

/**
 * Sets someone as the named approver for a stage in a given country — the "Add /
 * Update Permission" form's write path for IT Manager / Country Manager / IT
 * Director / Supply Chain Director, since that authority lives in
 * laptop_approver_matrix, not laptop_permissions (see buildEffectivePermissions).
 * Creates the country's matrix row if it doesn't exist yet; otherwise updates just
 * that one stage's email/name, leaving every other stage on the row untouched.
 */
export async function assignApproverMatrixRole(input: {
  email: string;
  name?: string;
  role: LaptopApprovalStage;
  country: string;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    const email = requireText(input.email, 'Email').toLowerCase();
    const country = requireText(input.country, 'Country');
    const cols = STAGE_TO_MATRIX_COLUMNS[input.role];
    if (!cols) return { success: false, error: 'Unknown approver role.' };

    const rows = await sql<QueryResultRow[]>(`SELECT id FROM laptop_approver_matrix WHERE country = ? LIMIT 1`, [country]);
    if (rows[0]) {
      await exec(
        `UPDATE laptop_approver_matrix SET ${cols.emailCol} = ?, ${cols.nameCol} = ?, is_active = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [email, blankToNull(input.name), rows[0].id],
      );
    } else {
      await exec(
        `INSERT INTO laptop_approver_matrix (country, ${cols.emailCol}, ${cols.nameCol}, is_active) VALUES (?, ?, ?, TRUE)`,
        [country, email, blankToNull(input.name)],
      );
    }
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[assignApproverMatrixRole]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to assign approver.' };
  }
}

/**
 * Clears someone as the named approver for a stage, across every country's matrix
 * row — the "Remove" action for a matrix-sourced row in the merged Permissions list.
 * Per-country adjustments (removing just one of several countries) still go through
 * the Approver Matrix tab directly. IT Manager can occupy either the primary or
 * secondary slot, so both are cleared.
 */
export async function removeApproverMatrixRole(input: { email: string; role: LaptopApprovalStage }): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    const email = input.email.trim().toLowerCase();
    if (!email) return { success: false, error: 'Email is required.' };

    if (input.role === 'IT Manager') {
      await exec(`UPDATE laptop_approver_matrix SET it_manager_email = NULL, it_manager_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE LOWER(it_manager_email) = ?`, [email]);
      await exec(`UPDATE laptop_approver_matrix SET it_manager_2_email = NULL, it_manager_2_name = NULL, updated_at = CURRENT_TIMESTAMP WHERE LOWER(it_manager_2_email) = ?`, [email]);
    } else {
      const cols = STAGE_TO_MATRIX_COLUMNS[input.role];
      if (!cols) return { success: false, error: 'Unknown approver role.' };
      await exec(`UPDATE laptop_approver_matrix SET ${cols.emailCol} = NULL, ${cols.nameCol} = NULL, updated_at = CURRENT_TIMESTAMP WHERE LOWER(${cols.emailCol}) = ?`, [email]);
    }
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[removeApproverMatrixRole]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to remove approver.' };
  }
}

/* ── Access requests (mirrors ProcureGuard's access-request queue) ───────── */

let laptopAccessRequestTableEnsured: Promise<void> | null = null;
async function ensureLaptopAccessRequestTable(): Promise<void> {
  if (laptopAccessRequestTableEnsured) return laptopAccessRequestTableEnsured;
  laptopAccessRequestTableEnsured = (async () => {
    async function execSchema(statement: string) {
      try {
        await exec(statement);
      } catch (err) {
        const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
        if (code !== '23505' && code !== '42P07' && code !== '42710') throw err;
      }
    }
    await execSchema(`
      CREATE TABLE IF NOT EXISTS laptop_access_requests (
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
    await execSchema(`CREATE INDEX IF NOT EXISTS idx_laptop_access_requests_status ON laptop_access_requests (status)`);
  })().catch((err) => {
    laptopAccessRequestTableEnsured = null;
    throw err;
  });
  return laptopAccessRequestTableEnsured;
}

function serialiseLaptopAccessRequest(row: QueryResultRow): LaptopAccessRequestRow {
  return {
    user_email: String(row.user_email),
    display_name: row.display_name ? String(row.display_name) : null,
    job_title: row.job_title ? String(row.job_title) : null,
    department: row.department ? String(row.department) : null,
    status: row.status as LaptopAccessRequestStatus,
    requested_role: row.requested_role as LaptopPermissionRole,
    approved_role: row.approved_role ? (row.approved_role as LaptopPermissionRole) : null,
    country: row.country ? String(row.country) : null,
    segment: row.segment ? String(row.segment) : null,
    requested_at: row.requested_at instanceof Date ? row.requested_at.toISOString() : String(row.requested_at),
    reviewed_at: row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : (row.reviewed_at ? String(row.reviewed_at) : null),
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    notes: row.notes ? String(row.notes) : null,
  };
}

export async function getLaptopAccessRequests(): Promise<LaptopAccessRequestRow[]> {
  try {
    await requireAdminActor();
    await ensureLaptopAccessRequestTable();
    const [requestRows, permissionRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_access_requests
         ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Approved' THEN 1 ELSE 2 END, requested_at DESC`,
      ),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_permissions ORDER BY updated_at DESC, email`),
    ]);

    const byEmail = new Map<string, LaptopAccessRequestRow>();
    for (const row of requestRows) {
      byEmail.set(String(row.user_email).toLowerCase(), serialiseLaptopAccessRequest(row));
    }
    for (const row of permissionRows) {
      const email = String(row.email).toLowerCase();
      if (byEmail.has(email)) continue;
      const role = row.role as LaptopPermissionRole;
      byEmail.set(email, {
        user_email: email,
        display_name: row.name ? String(row.name) : null,
        job_title: null,
        department: null,
        status: 'Approved',
        requested_role: role,
        approved_role: role,
        country: row.country ? String(row.country) : null,
        segment: row.segment ? String(row.segment) : null,
        requested_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
        reviewed_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
        reviewed_by: 'Laptop Procurement permissions',
        notes: null,
      });
    }

    return [...byEmail.values()].sort((a, b) => {
      const rank = (status: LaptopAccessRequestStatus) => (status === 'Pending' ? 0 : status === 'Approved' ? 1 : 2);
      return rank(a.status) - rank(b.status) || Date.parse(b.requested_at) - Date.parse(a.requested_at);
    });
  } catch (err) {
    console.error('[getLaptopAccessRequests]', err);
    return [];
  }
}

export async function getLaptopPendingAccessCount(): Promise<number> {
  try {
    await ensureLaptopAccessRequestTable();
    const rows = await sql<QueryResultRow[]>(`SELECT COUNT(*) AS cnt FROM laptop_access_requests WHERE status = 'Pending'`);
    return Number(rows[0]?.cnt ?? 0);
  } catch (err) {
    console.error('[getLaptopPendingAccessCount]', err);
    return 0;
  }
}

export async function approveLaptopAccess(input: {
  userEmail: string;
  approvedRole: LaptopPermissionRole;
  reviewedBy: string;
  country?: string | null;
  segment?: string | null;
  notes?: string | null;
}): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(input.userEmail, 'Email').toLowerCase();
    const role = requireText(input.approvedRole, 'Role') as LaptopPermissionRole;

    await exec(
      `INSERT INTO laptop_access_requests
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
      [email, email, role, role, blankToNull(input.country), blankToNull(input.segment), input.reviewedBy, blankToNull(input.notes)],
    );

    await exec(
      `INSERT INTO laptop_permissions (email, name, role, country, segment)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (email) DO UPDATE SET
         role = EXCLUDED.role, country = EXCLUDED.country, segment = EXCLUDED.segment, updated_at = CURRENT_TIMESTAMP`,
      [email, null, role, blankToNull(input.country), blankToNull(input.segment)],
    );

    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[approveLaptopAccess]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to approve Laptop Procurement access.' };
  }
}

export async function editLaptopAccess(input: {
  userEmail: string;
  approvedRole: LaptopPermissionRole;
  reviewedBy: string;
  country?: string | null;
  segment?: string | null;
}): Promise<ActionResult> {
  return approveLaptopAccess({ ...input, notes: 'Access edited by admin' });
}

export async function rejectLaptopAccess(userEmail: string, reviewedBy: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(
      `UPDATE laptop_access_requests
       SET status = 'Rejected', approved_role = NULL, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ?
       WHERE user_email = ?`,
      [reviewedBy, email],
    );
    if (!adminEmails().includes(email)) {
      await exec(`DELETE FROM laptop_permissions WHERE email = ?`, [email]);
    }
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[rejectLaptopAccess]', err);
    return { success: false, error: 'Failed to reject Laptop Procurement access.' };
  }
}

export async function revokeLaptopAccess(userEmail: string, reviewedBy: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(
      `INSERT INTO laptop_access_requests
         (user_email, display_name, status, requested_role, requested_at, reviewed_at, reviewed_by)
       VALUES (?, ?, 'Revoked', 'Requester', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?)
       ON CONFLICT (user_email) DO UPDATE SET
         status = 'Revoked', approved_role = NULL, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = EXCLUDED.reviewed_by`,
      [email, email, reviewedBy],
    );
    if (!adminEmails().includes(email)) {
      await exec(`DELETE FROM laptop_permissions WHERE email = ?`, [email]);
    }
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[revokeLaptopAccess]', err);
    return { success: false, error: 'Failed to revoke Laptop Procurement access.' };
  }
}

export async function deleteLaptopAccessRequest(userEmail: string): Promise<ActionResult> {
  try {
    const actor = await requireAdminActor();
    if (!actor.permissions.canManagePermissions) return { success: false, error: 'Permission management access is required.' };
    await ensureLaptopAccessRequestTable();
    const email = requireText(userEmail, 'Email').toLowerCase();
    await exec(`DELETE FROM laptop_access_requests WHERE user_email = ?`, [email]);
    if (!adminEmails().includes(email)) {
      await exec(`DELETE FROM laptop_permissions WHERE email = ?`, [email]);
    }
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopAccessRequest]', err);
    return { success: false, error: 'Failed to delete Laptop Procurement access record.' };
  }
}

/* ── Delegation (own table in laptop_procurement_db) ──────────────────────── */

const DELEGATION_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function getLaptopDelegationData(): Promise<LaptopDelegationData | null> {
  try {
    const actor = await getActor();
    await ensureLaptopDelegationTable();
    await expireStaleLaptopDelegations();
    const [grantedRows, receivedRows] = await Promise.all([
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_delegations WHERE LOWER(delegator_email) = ? ORDER BY is_active DESC, COALESCE(revoked_at, created_at) DESC`,
        [actor.email.toLowerCase()],
      ),
      sql<QueryResultRow[]>(
        `SELECT * FROM laptop_delegations
         WHERE LOWER(delegate_email) = ? AND is_active = TRUE
           AND (starts_at IS NULL OR starts_at <= CURRENT_TIMESTAMP)
           AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
         ORDER BY created_at DESC`,
        [actor.email.toLowerCase()],
      ),
    ]);
    return {
      actor,
      granted: serialise<LaptopDelegationRow[]>(grantedRows),
      received: serialise<LaptopDelegationRow[]>(receivedRows),
    };
  } catch (err) {
    console.error('[getLaptopDelegationData]', err);
    return null;
  }
}

export async function grantLaptopDelegation(input: {
  delegateEmail: string;
  delegateName?: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<ActionResult<{ id: number }>> {
  try {
    const actor = await getActor();
    if (!actor.permissions.canViewAll) {
      return { success: false, error: 'Only approvers can delegate their approval authority.' };
    }
    await ensureLaptopDelegationTable();
    const delegateEmail = requireText(input.delegateEmail, 'Delegate email').toLowerCase();
    if (!DELEGATION_EMAIL_RE.test(delegateEmail)) return { success: false, error: 'Enter a valid delegate email address.' };
    if (delegateEmail === actor.email.toLowerCase()) return { success: false, error: 'You cannot delegate to yourself.' };
    const startsAt = input.startsAt && input.startsAt.trim() ? input.startsAt.trim() : null;
    const expiresAt = input.endsAt && input.endsAt.trim() ? input.endsAt.trim() : null;
    if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
      return { success: false, error: 'End date must be after the start date.' };
    }

    // Replace any existing active delegation to the same person so there is only one live grant.
    await exec(
      `UPDATE laptop_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(delegator_email) = ? AND LOWER(delegate_email) = ? AND is_active = TRUE`,
      [actor.email.toLowerCase(), delegateEmail],
    );
    const result = await exec(
      `INSERT INTO laptop_delegations (delegator_email, delegator_name, delegate_email, delegate_name, starts_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [actor.email.toLowerCase(), actor.name, delegateEmail, blankToNull(input.delegateName), startsAt, expiresAt],
    );
    revalidatePath('/laptop-procurement/delegate');
    await sendLaptopDelegationNotification('granted', {
      delegatorEmail: actor.email,
      delegatorName: actor.name,
      delegateEmail,
      delegateName: input.delegateName?.trim() || null,
      expiresAt,
    });
    return { success: true, data: { id: result.insertId } };
  } catch (err) {
    console.error('[grantLaptopDelegation]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create delegation.' };
  }
}

export async function revokeLaptopDelegation(id: number): Promise<ActionResult> {
  try {
    const actor = await getActor();
    await ensureLaptopDelegationTable();
    const rows = await sql<QueryResultRow[]>(`SELECT * FROM laptop_delegations WHERE id = ? LIMIT 1`, [id]);
    const row = rows[0];
    if (!row) return { success: false, error: 'Delegation not found.' };
    const isOwner = String(row.delegator_email).toLowerCase() === actor.email.toLowerCase();
    if (!isOwner && !actor.permissions.canManagePermissions) {
      return { success: false, error: 'You can only revoke delegations you created.' };
    }
    if (row.is_active) {
      await exec(
        `UPDATE laptop_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [id],
      );
      await sendLaptopDelegationNotification('revoked', {
        delegatorEmail: String(row.delegator_email),
        delegatorName: (row.delegator_name as string) || actor.name,
        delegateEmail: String(row.delegate_email),
        delegateName: (row.delegate_name as string | null) ?? null,
        expiresAt: null,
      });
    }
    revalidatePath('/laptop-procurement/delegate');
    revalidatePath('/admin');
    return { success: true };
  } catch (err) {
    console.error('[revokeLaptopDelegation]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to revoke delegation.' };
  }
}

// Admin-managed delegation: an admin sets up a delegation on behalf of any approver
// (delegator → delegate), rather than the delegator delegating their own authority
// via /laptop-procurement/delegate.
export async function adminGrantLaptopDelegation(input: {
  delegatorEmail: string;
  delegateEmail: string;
  delegateName?: string;
  startsAt?: string | null;
  endsAt?: string | null;
}): Promise<ActionResult<{ id: number }>> {
  try {
    await requireAdminActor();
    await ensureLaptopDelegationTable();
    const delegatorEmail = requireText(input.delegatorEmail, 'Approver email').toLowerCase();
    const delegateEmail = requireText(input.delegateEmail, 'Delegate email').toLowerCase();
    if (!DELEGATION_EMAIL_RE.test(delegatorEmail)) return { success: false, error: 'Enter a valid approver email address.' };
    if (!DELEGATION_EMAIL_RE.test(delegateEmail)) return { success: false, error: 'Enter a valid delegate email address.' };
    if (delegatorEmail === delegateEmail) return { success: false, error: 'Approver and delegate must be different people.' };

    const delegatorRow = await getPermissionRowForEmail(delegatorEmail);
    const delegatorRole = (delegatorRow?.role ?? (adminEmails().includes(delegatorEmail) ? 'Admin' : 'Requester')) as LaptopPermissionRole;
    const delegatorProfile = getPermissionProfile(delegatorRole);
    if (!delegatorProfile.canViewAll) {
      return { success: false, error: 'The selected approver has no approval authority to delegate.' };
    }
    const delegatorName = delegatorRow?.name || delegatorEmail;
    const startsAt = input.startsAt && input.startsAt.trim() ? input.startsAt.trim() : null;
    const expiresAt = input.endsAt && input.endsAt.trim() ? input.endsAt.trim() : null;
    if (startsAt && expiresAt && new Date(startsAt) >= new Date(expiresAt)) {
      return { success: false, error: 'End date must be after the start date.' };
    }

    // Replace any existing active delegation for this same pair so there is only one live grant.
    await exec(
      `UPDATE laptop_delegations SET is_active = FALSE, revoked_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(delegator_email) = ? AND LOWER(delegate_email) = ? AND is_active = TRUE`,
      [delegatorEmail, delegateEmail],
    );
    const result = await exec(
      `INSERT INTO laptop_delegations (delegator_email, delegator_name, delegate_email, delegate_name, starts_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?) RETURNING id`,
      [delegatorEmail, delegatorName, delegateEmail, blankToNull(input.delegateName), startsAt, expiresAt],
    );
    revalidatePath('/admin');
    revalidatePath('/laptop-procurement/delegate');
    await sendLaptopDelegationNotification('granted', {
      delegatorEmail,
      delegatorName,
      delegateEmail,
      delegateName: input.delegateName?.trim() || null,
      expiresAt,
    });
    return { success: true, data: { id: result.insertId } };
  } catch (err) {
    console.error('[adminGrantLaptopDelegation]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create delegation.' };
  }
}
