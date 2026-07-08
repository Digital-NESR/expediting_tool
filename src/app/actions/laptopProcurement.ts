'use server';

import type { QueryResultRow } from 'pg';
import { revalidatePath } from 'next/cache';
import { getProcureGuardUser } from '@/lib/auth';
import { getDelegatorsForApp } from '@/app/actions/delegation';
import laptopProcurementPool from '@/lib/db-laptop';
import {
  canUseLaptopAdmin,
  canUseLaptopAnalytics,
  canUseLaptopOperationalPages,
  canUseLaptopReviewerQueue,
  getLaptopAccessView,
  getLaptopAvailableActions,
  getNextApprovalStatus,
  getPermissionProfile,
  getRejectStatusForStage,
  getRequiredPermissionForStage,
  IT_MANAGER_STATUSES,
  isActiveApprovalStatus,
} from '@/lib/laptopProcurement-utils';
import type { LaptopPermissionKey } from '@/lib/laptopProcurement-utils';
import type {
  ActionResult,
  AdminCreateLaptopRequestInput,
  CreateLaptopRequestInput,
  LaptopActivityRow,
  LaptopActor,
  LaptopDelegationGrant,
  LaptopAdminData,
  LaptopAnalyticsData,
  LaptopAnalyticsMetric,
  LaptopDashboardData,
  LaptopDeviceOption,
  LaptopDocument,
  LaptopMonthlyMetric,
  LaptopPermissionRole,
  LaptopPermissionRow,
  LaptopRequest,
  LaptopRequestDetailData,
  LaptopRequestListData,
  LaptopRequestStatus,
  LaptopWorkQueueData,
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

async function getActor(): Promise<LaptopActor> {
  const user = await getProcureGuardUser();
  const email = user?.email ?? '';
  if (!email) throw new Error('You must be signed in to use Laptop Procurement.');

  const permissionRow = await getPermissionRowForEmail(email);
  const fallbackRole: LaptopPermissionRole = adminEmails().includes(email.toLowerCase()) ? 'Admin' : 'Requester';
  const role = (permissionRow?.role ?? fallbackRole) as LaptopPermissionRole;
  const permissions = getPermissionProfile(role);
  const delegatedFrom = await resolveLaptopDelegations(email);

  return {
    email,
    name: permissionRow?.name ?? user?.name ?? email,
    department: user?.department ?? null,
    jobTitle: user?.jobTitle ?? null,
    isAdmin: permissions.role === 'Admin',
    role: permissions.role,
    permissions,
    country: permissionRow?.country ?? null,
    segment: permissionRow?.segment ?? null,
    delegatedFrom,
  };
}

/**
 * Resolve active delegations TO `email` for Laptop Procurement. Each delegator
 * is expanded into their own role/permissions/scope (from this DB's permission
 * table). Only delegators who are reviewers/approvers (canViewAll) are inherited.
 * Fail-safe: returns [] if delegation_db is unavailable.
 */
async function resolveLaptopDelegations(email: string): Promise<LaptopDelegationGrant[]> {
  const delegators = await getDelegatorsForApp(email, 'laptop');
  if (!delegators.length) return [];

  const grants: LaptopDelegationGrant[] = [];
  for (const d of delegators) {
    const row = await getPermissionRowForEmail(d.email);
    if (!row?.role) continue;
    const grantPermissions = getPermissionProfile(row.role as LaptopPermissionRole);
    if (!grantPermissions.canViewAll) continue; // only reviewers/approvers carry delegatable authority
    grants.push({
      email: d.email,
      name: row.name ?? d.name ?? d.email,
      role: grantPermissions.role,
      permissions: grantPermissions,
      country: row.country ?? null,
      segment: row.segment ?? null,
    });
  }
  return grants;
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
  return Boolean(permissionRow);
}

/* ── Scoping ──────────────────────────────────────────────────── */

// Build a single scope group (country/segment AND-ed). Returns null when the
// scope is unrestricted (a view-all role with no country/segment = sees all).
function laptopScopeGroup(country?: string | null, segment?: string | null): { clause: string; params: string[] } | null {
  const filters: string[] = [];
  const params: string[] = [];
  if (country) {
    filters.push('country = ?');
    params.push(country);
  }
  if (segment) {
    filters.push('segment = ?');
    params.push(segment);
  }
  if (!filters.length) return null;
  return { clause: `(${filters.join(' AND ')})`, params };
}

function scopedWhere(actor: LaptopActor): { where: string; params: string[] } {
  const delegated = (actor.delegatedFrom ?? []).filter(d => d.permissions.canViewAll);

  if (actor.role === 'Admin' || delegated.some(d => d.role === 'Admin')) {
    if (actor.permissions.canViewAll || delegated.length) return { where: '', params: [] };
  }

  const orGroups: string[] = [];
  const params: string[] = [];

  if (actor.permissions.canViewAll) {
    const g = laptopScopeGroup(actor.country, actor.segment);
    if (!g) return { where: '', params: [] };
    orGroups.push(g.clause);
    params.push(...g.params);
  } else {
    orGroups.push('requested_by_email = ?');
    params.push(actor.email);
  }

  for (const d of delegated) {
    const g = laptopScopeGroup(d.country, d.segment);
    if (!g) return { where: '', params: [] };
    orGroups.push(g.clause);
    params.push(...g.params);
  }

  return { where: orGroups.length ? `WHERE ${orGroups.join(' OR ')}` : '', params };
}

function normaliseScopeValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function scopeMatches(
  role: LaptopPermissionRole,
  country: string | null | undefined,
  segment: string | null | undefined,
  request: { country?: string | null; segment?: string | null },
): boolean {
  if (role === 'Admin') return true;
  const countryOk = !country || normaliseScopeValue(country) === normaliseScopeValue(request.country);
  const segmentOk = !segment || normaliseScopeValue(segment) === normaliseScopeValue(request.segment);
  return countryOk && segmentOk;
}

function actorCanAccessRequestScope(actor: LaptopActor, request: { country?: string | null; segment?: string | null }): boolean {
  return scopeMatches(actor.role, actor.country, actor.segment, request);
}

// Identities (self + delegators) the actor can act through, each with its own scope.
function laptopActingIdentities(actor: LaptopActor): LaptopDelegationGrant[] {
  return [
    { email: actor.email, name: actor.name, role: actor.role, permissions: actor.permissions, country: actor.country, segment: actor.segment },
    ...(actor.delegatedFrom ?? []),
  ];
}

function getScopedActions(actor: LaptopActor, request: { status: LaptopRequestStatus; country?: string | null; segment?: string | null }) {
  const base = getLaptopAvailableActions(actor.permissions, request.status);
  // Merge action capability across every identity whose scope matches this request.
  const merged = { ...base, canApprove: false, canReject: false, canAssignInventory: false, canMarkRepaired: false };
  for (const id of laptopActingIdentities(actor)) {
    if (!scopeMatches(id.role, id.country, id.segment, request)) continue;
    const a = getLaptopAvailableActions(id.permissions, request.status);
    merged.canApprove ||= a.canApprove;
    merged.canReject ||= a.canReject;
    merged.canAssignInventory ||= a.canAssignInventory;
    merged.canMarkRepaired ||= a.canMarkRepaired;
  }
  return merged;
}

/**
 * Decide whether the actor may perform a stage transition needing
 * `requiredPermission` (and, when rejecting, canReject) on `request` — using
 * their OWN authority first, then any delegated authority scoped to the
 * delegator's country/segment. Returns the "on behalf of" label to record.
 */
function resolveLaptopActing(
  actor: LaptopActor,
  requiredPermission: LaptopPermissionKey,
  needsReject: boolean,
  request: { country?: string | null; segment?: string | null },
): { allowed: boolean; reason: 'permission' | 'reject' | 'scope' | null; onBehalfOf: string | null } {
  let sawPermission = false;
  let sawReject = true;
  const identities = laptopActingIdentities(actor);
  for (let i = 0; i < identities.length; i++) {
    const id = identities[i];
    if (!id.permissions[requiredPermission]) continue;
    sawPermission = true;
    if (needsReject && !id.permissions.canReject) {
      sawReject = false;
      continue;
    }
    if (scopeMatches(id.role, id.country, id.segment, request)) {
      return { allowed: true, reason: null, onBehalfOf: i === 0 ? null : id.name };
    }
  }
  if (!sawPermission) return { allowed: false, reason: 'permission', onBehalfOf: null };
  if (!sawReject) return { allowed: false, reason: 'reject', onBehalfOf: null };
  return { allowed: false, reason: 'scope', onBehalfOf: null };
}

function requireOperationalAccess(actor: LaptopActor): void {
  if (!canUseLaptopOperationalPages(getLaptopAccessView(actor.role))) {
    throw new Error('Operational Laptop Procurement access is required.');
  }
}

function requireAnalyticsAccess(actor: LaptopActor): void {
  if (!canUseLaptopAnalytics(getLaptopAccessView(actor.role))) {
    throw new Error('Analytics access is required.');
  }
}

function requireReviewerQueueAccess(actor: LaptopActor): void {
  if (!canUseLaptopReviewerQueue(getLaptopAccessView(actor.role))) {
    throw new Error('Reviewer access is required.');
  }
}

async function requireAdminActor(): Promise<LaptopActor> {
  const actor = await getActor();
  if (!canUseLaptopAdmin(getLaptopAccessView(actor.role))) {
    throw new Error('Admin access is required.');
  }
  return actor;
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

function revalidateLaptopPaths(): void {
  revalidatePath('/laptop-procurement');
  revalidatePath('/laptop-procurement/requests');
  revalidatePath('/laptop-procurement/my-work');
  revalidatePath('/laptop-procurement/analytics');
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

    const [requestRows, activityRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM laptop_requests ${scope.where} ORDER BY created_at DESC, id DESC`, scope.params),
      sql<QueryResultRow[]>(
        actor.permissions.canViewAll
          ? `SELECT * FROM laptop_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 12`
          : `SELECT a.* FROM laptop_activity_log a
             JOIN laptop_requests r ON a.request_id = r.id
             WHERE r.requested_by_email = ? AND a.request_id > 0 AND a.action NOT ILIKE '%seeded%'
             ORDER BY a.created_at DESC LIMIT 12`,
        actor.permissions.canViewAll ? [] : [actor.email],
      ),
    ]);

    const requests = serialise<LaptopRequest[]>(requestRows);
    return {
      stats: buildStats(requests),
      requests,
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
    if (!actor.permissions.canViewAll && request.requested_by_email?.toLowerCase() !== actor.email.toLowerCase()) {
      return null;
    }
    if (actor.permissions.canViewAll && !actorCanAccessRequestScope(actor, request)) {
      return null;
    }

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
      .filter(item => item.actions.canApprove || item.actions.canReject || item.actions.canAssignInventory)
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

export async function getLaptopAdminData(): Promise<LaptopAdminData | null> {
  try {
    const actor = await requireAdminActor();
    const [requestRows, activityRows, permissionRows] = await Promise.all([
      sql<QueryResultRow[]>(`SELECT * FROM laptop_requests ORDER BY created_at DESC, id DESC`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_activity_log WHERE ${MEANINGFUL_ACTIVITY_WHERE} ORDER BY created_at DESC LIMIT 100`),
      sql<QueryResultRow[]>(`SELECT * FROM laptop_permissions ORDER BY role, email`),
    ]);
    const requests = serialise<LaptopRequest[]>(requestRows);
    return {
      actor,
      requests,
      activity: serialise<LaptopActivityRow[]>(activityRows),
      permissions: serialise<LaptopPermissionRow[]>(permissionRows),
      stats: buildStats(requests),
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
    segment: requireText(input.segment, 'Segment'),
    typeOfDevice: requireText(input.type_of_device, 'Type of device'),
    requestedModel: requireText(input.requested_model, 'Requested model'),
    reason: requireText(input.special_requirements, 'Special requirements / justification'),
  };
}

async function insertRequest(input: CreateLaptopRequestInput, opts: {
  reference: string;
  status: LaptopRequestStatus;
  requestedByName: string;
  requestedByEmail: string;
  validated: ReturnType<typeof validateCreateInput>;
}): Promise<number> {
  const v = opts.validated;
  const result = await exec(
    `INSERT INTO laptop_requests
      (reference_number, employee_id, status, priority, request_type, indirect_request, pending_with, country,
       requested_by_name, requested_by_email, computer_for, segment, department, position,
       company_code, company_name, cost_center, type_of_device, requested_model, special_requirements,
       unit_id, current_brand, current_model, serial_no, age_years)
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
      v.segment,
      blankToNull(input.department),
      blankToNull(input.position),
      blankToNull(input.company_code),
      blankToNull(input.company_name),
      blankToNull(input.cost_center),
      v.typeOfDevice,
      v.requestedModel,
      v.reason,
      blankToNull(input.unit_id),
      blankToNull(input.current_brand),
      blankToNull(input.current_model),
      blankToNull(input.serial_no),
      blankToNull(input.age_years),
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
    return { success: true, data: { id }, reference_number: reference };
  } catch (err) {
    console.error('[createLaptopRequest]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to create laptop request.' };
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
         employee_id = ?, priority = ?, request_type = ?, country = ?, computer_for = ?, segment = ?,
         department = ?, position = ?, company_code = ?, company_name = ?, cost_center = ?,
         type_of_device = ?, requested_model = ?, special_requirements = ?,
         unit_id = ?, current_brand = ?, current_model = ?, serial_no = ?, age_years = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        blankToNull(input.employee_id), input.priority || 'Normal', v.requestType, v.country,
        blankToNull(input.computer_for), v.segment, blankToNull(input.department), blankToNull(input.position),
        blankToNull(input.company_code), blankToNull(input.company_name), blankToNull(input.cost_center),
        v.typeOfDevice, v.requestedModel, v.reason,
        blankToNull(input.unit_id), blankToNull(input.current_brand), blankToNull(input.current_model),
        blankToNull(input.serial_no), blankToNull(input.age_years), id,
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

export async function updateLaptopRequestStatus(
  id: number,
  status: LaptopRequestStatus,
  notes?: string,
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

    if (userCancellingOwnRequest && actor.permissions.canCreateRequests) {
      if (!IT_MANAGER_STATUSES.includes(currentStatus)) {
        return { success: false, error: 'This request can only be cancelled before approvals begin.' };
      }
    } else {
      const isApproveMove = getNextApprovalStatus(currentStatus) === status;
      const isRejectMove = getRejectStatusForStage(currentStatus) === status;
      const isItOutcomeMove = IT_MANAGER_STATUSES.includes(currentStatus)
        && (status === 'Assign from Inventory' || status === 'Assign from Inventory & Closed' || status === 'Repaired & Closed');

      if (!isApproveMove && !isRejectMove && !isItOutcomeMove) {
        return { success: false, error: `Cannot move ${row.reference_number} from ${currentStatus} to ${status}.` };
      }

      requiredPermission = getRequiredPermissionForStage(currentStatus);
      if (!requiredPermission) {
        return {
          success: false,
          error: `${actor.role} cannot move this request from ${currentStatus} to ${status}. Change your role in the admin panel.`,
        };
      }

      const acting = resolveLaptopActing(actor, requiredPermission, isRejectMove, row);
      if (!acting.allowed) {
        if (acting.reason === 'reject') {
          return { success: false, error: `${actor.role} cannot reject requests.` };
        }
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

    const isRejection = status.startsWith('Rejected');
    if (isRejection && !comment) {
      return { success: false, error: 'Add a comment before rejecting this request.' };
    }

    const stageColumn = STAGE_COMMENT_COLUMN[currentStatus];
    const setsReviewer = !userCancellingOwnRequest;
    const rejectionReason = isRejection ? blankToNull(comment) : null;

    // Stamp the stage approval timestamp when the current stage is signed off (not on rejection / cancellation).
    const stageDateColumn = (!isRejection && !userCancellingOwnRequest) ? STAGE_APPROVED_DATE_COLUMN[currentStatus] : undefined;
    const stageDateAssignment = stageDateColumn ? `, ${stageDateColumn} = CURRENT_TIMESTAMP` : '';
    // Build dynamic SET for the stage comment column when applicable.
    const stageCommentAssignment = stageColumn && comment ? `, ${stageColumn} = ?` : '';

    const params: QueryParam[] = [
      status,
      getPendingWithLabel(status),
      setsReviewer ? actor.name : row.reviewed_by_name,
      setsReviewer ? actor.email : row.reviewed_by_email,
      setsReviewer,
      rejectionReason,
      comment ? comment : row.review_comments,
    ];
    if (stageCommentAssignment) params.push(comment);
    params.push(id);

    await exec(
      `UPDATE laptop_requests SET
         status = ?,
         pending_with = ?,
         reviewed_by_name = ?,
         reviewed_by_email = ?,
         reviewed_at = CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE reviewed_at END,
         rejection_reason = ?,
         review_comments = ?${stageDateAssignment}${stageCommentAssignment},
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
    return { success: true };
  } catch (err) {
    console.error('[updateLaptopRequestStatus]', err);
    return { success: false, error: err instanceof Error ? err.message : 'Failed to update request status.' };
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

    const requestRows = await sql<QueryResultRow[]>(`SELECT id, reference_number, requested_by_email FROM laptop_requests WHERE id = ? LIMIT 1`, [requestId]);
    if (!requestRows[0]) return { success: false, error: 'Request not found.' };
    if (!actor.permissions.canViewAll && requestRows[0].requested_by_email?.toLowerCase() !== actor.email.toLowerCase()) {
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
    revalidatePath('/laptop-procurement/admin');
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
    revalidatePath('/laptop-procurement/admin');
    return { success: true };
  } catch (err) {
    console.error('[deleteLaptopPermission]', err);
    return { success: false, error: 'Failed to delete permission.' };
  }
}
