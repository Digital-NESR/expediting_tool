/* ─── Aggregations behind the admin console and the analytics panel: who is assigned to each stage,
   which roles can be delegated, and the merged permission list. ─── */

import { asSerialised } from '@/lib/db/sql';
import { APPROVER_MATRIX_ROLES, getLaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type { LaptopApprovalStage } from '@/lib/laptopProcurement-utils';
import type {
  LaptopActor,
  LaptopAnalyticsData,
  LaptopAnalyticsMetric,
  LaptopDelegatableRole,
  LaptopPermissionListItem,
  LaptopRequest,
  LaptopStageAssignee,
} from '@/types/laptopProcurement';
import type { QueryResultRow } from 'pg';
import { APPROVAL_STAGES, getActiveApproverMatrixForCountry } from '@/lib/laptop-procurement/actor';
import { sql } from '@/lib/laptop-procurement/db';
import { loadLaptopDelegationChain } from '@/lib/laptop-procurement/delegation';
import { buildMonthlyTrend, computeLaptopStats } from '@/lib/laptop-procurement/internals';

// Which named individual (following any active delegation) is currently responsible
// for each stage on this specific request — so the detail page can show exactly who
// to poke if it's stuck, and grey out whoever already acted. Completed stages show
// who actually acted (the historical it_manager/country_manager/it_director/sc_director
// columns), since the live matrix assignment may have changed since; pending/upcoming
// stages show the live, delegation-resolved assignee, since that's who needs to act now.
export async function resolveStageAssignees(
  request: LaptopRequest,
): Promise<LaptopStageAssignee[]> {
  const [matrix, delegations] = await Promise.all([
    getActiveApproverMatrixForCountry(request.country),
    loadLaptopDelegationChain(request.country),
  ]);
  const currentStage = getLaptopApprovalStage(request.status);
  const currentIndex = currentStage ? APPROVAL_STAGES.indexOf(currentStage) : -1;
  // Assign-from-inventory / plain-approved requests now end at Country Manager — IT
  // Director and Supply Chain Director never see them, so don't show those two as
  // having "Approved" once the request is done.
  const endedAtCountryManager =
    !request.procure_new_requested &&
    (request.status === 'Assign from Inventory' ||
      request.status === 'Assign from Inventory & Closed' ||
      request.status === 'Approved');

  function liveNameFor(
    matrixEmail: unknown,
    matrixName: unknown,
    stage: LaptopApprovalStage,
  ): string | null {
    const email = String(matrixEmail ?? '').trim();
    if (!email) return null;
    const delegate = delegations.resolve(email, stage);
    if (delegate) return delegate.name ?? delegate.email;
    return String(matrixName ?? '').trim() || email;
  }

  function stateFor(
    stage: LaptopApprovalStage,
    hasAssignee: boolean,
  ): LaptopStageAssignee['state'] {
    if (!hasAssignee) return 'none';
    if (endedAtCountryManager && (stage === 'IT Director' || stage === 'Supply Chain Director'))
      return 'none';
    // Terminal status (approved/rejected/cancelled/...) — nothing is "pending" anymore.
    if (currentIndex === -1) return 'done';
    const stageIndex = APPROVAL_STAGES.indexOf(stage);
    if (stageIndex < currentIndex) return 'done';
    if (stageIndex === currentIndex) return 'pending';
    return 'upcoming';
  }

  const slots: Array<{
    label: LaptopStageAssignee['label'];
    stage: LaptopApprovalStage;
    matrixEmail: unknown;
    matrixName: unknown;
    actedName: string | null;
  }> = [
    {
      label: 'IT Manager',
      stage: 'IT Manager',
      matrixEmail: matrix?.it_manager_email,
      matrixName: matrix?.it_manager_name,
      actedName: request.it_manager,
    },
    {
      label: 'IT Manager 2',
      stage: 'IT Manager',
      matrixEmail: matrix?.it_manager_2_email,
      matrixName: matrix?.it_manager_2_name,
      actedName: null,
    },
    {
      label: 'IT Manager 3',
      stage: 'IT Manager',
      matrixEmail: matrix?.it_manager_3_email,
      matrixName: matrix?.it_manager_3_name,
      actedName: null,
    },
    {
      label: 'Country Manager',
      stage: 'Country Manager',
      matrixEmail: matrix?.cm_email,
      matrixName: matrix?.cm_name,
      actedName: request.country_manager,
    },
    {
      label: 'IT Director',
      stage: 'IT Director',
      matrixEmail: matrix?.itd_email,
      matrixName: matrix?.itd_name,
      actedName: request.it_director,
    },
    {
      label: 'Supply Chain Director',
      stage: 'Supply Chain Director',
      matrixEmail: matrix?.scd_email,
      matrixName: matrix?.scd_name,
      actedName: request.sc_director,
    },
  ];

  return slots.map((slot) => {
    const hasAssignee = Boolean(String(slot.matrixEmail ?? '').trim()) || Boolean(slot.actedName);
    const state = stateFor(slot.stage, hasAssignee);
    const name =
      state === 'done'
        ? slot.actedName || liveNameFor(slot.matrixEmail, slot.matrixName, slot.stage)
        : liveNameFor(slot.matrixEmail, slot.matrixName, slot.stage);
    return { label: slot.label, name: name || null, state };
  });
}

// Everyone eligible to be picked as a delegation's "approver (delegator)": Admins from
// laptop_permissions, plus everyone named anywhere in the approver matrix (their real
// source of approval authority now). Deduped by email — an Admin who also happens to
// be named in the matrix is just shown as Admin, since that already covers everything.
export const APPROVER_MATRIX_ROLE_SET: Set<string> = new Set(APPROVER_MATRIX_ROLES);

// stages maps a functional stage to slot-number -> countries, since IT Manager alone
// can have up to 3 named slots (co-managers) for the same country — every other stage
// only ever populates slot 1.
export type MatrixApproverAcc = {
  email: string;
  name: string | null;
  stages: Map<LaptopApprovalStage, Map<number, Set<string>>>;
};

// Every person named anywhere in the active approver matrix, keyed by email, with the
// stage(s)/slot(s) and country(ies) they're the approver for — shared by the
// Delegations tab's delegatable-roles list (buildDelegatableRoles) and the Permissions
// tab's merged list (buildMergedPermissionsList).
export function accumulateMatrixApprovers(
  matrixRows: QueryResultRow[],
): Map<string, MatrixApproverAcc> {
  const byEmail = new Map<string, MatrixApproverAcc>();
  const addApprover = (
    rawEmail: unknown,
    rawName: unknown,
    stage: LaptopApprovalStage,
    slot: number,
    country: string,
  ) => {
    const email = String(rawEmail ?? '').trim();
    if (!email) return;
    const key = email.toLowerCase();
    let entry = byEmail.get(key);
    if (!entry) {
      entry = { email, name: null, stages: new Map() };
      byEmail.set(key, entry);
    }
    if (!entry.name && rawName) entry.name = String(rawName);
    if (!entry.stages.has(stage)) entry.stages.set(stage, new Map());
    const slots = entry.stages.get(stage)!;
    if (!slots.has(slot)) slots.set(slot, new Set());
    slots.get(slot)!.add(country);
  };
  for (const row of matrixRows) {
    const country = String(row.country ?? '').trim();
    if (!country) continue;
    addApprover(row.it_manager_email, row.it_manager_name, 'IT Manager', 1, country);
    addApprover(row.it_manager_2_email, row.it_manager_2_name, 'IT Manager', 2, country);
    addApprover(row.it_manager_3_email, row.it_manager_3_name, 'IT Manager', 3, country);
    addApprover(row.cm_email, row.cm_name, 'Country Manager', 1, country);
    addApprover(row.itd_email, row.itd_name, 'IT Director', 1, country);
    addApprover(row.scd_email, row.scd_name, 'Supply Chain Director', 1, country);
  }
  return byEmail;
}

// Every specific (email, stage, country) role delegatable from the Delegations tab —
// one entry per approver-matrix slot, not per person or per stage, so picking a row
// unambiguously identifies exactly the one role a delegation would hand over. Admin
// (laptop_permissions) isn't included — that's account-level access, not an
// approval-chain role, and isn't something role-based delegation hands over.
// Delegation is stage-scoped, not slot-scoped (an IT Manager 2 holder delegates "IT
// Manager" authority for that country same as anyone else in that stage), so slots are
// flattened here — countries are unioned across whichever slot(s) this email occupies.
export function buildDelegatableRoles(matrixRows: QueryResultRow[]): LaptopDelegatableRole[] {
  const byEmail = accumulateMatrixApprovers(matrixRows);
  const roles: LaptopDelegatableRole[] = [];
  for (const entry of byEmail.values()) {
    for (const [stage, slots] of entry.stages) {
      const countries = new Set<string>();
      for (const countrySet of slots.values()) for (const c of countrySet) countries.add(c);
      for (const country of countries) {
        roles.push({ email: entry.email, name: entry.name, stage, country });
      }
    }
  }
  return roles.sort(
    (a, b) =>
      a.email.localeCompare(b.email) ||
      a.stage.localeCompare(b.stage) ||
      a.country.localeCompare(b.country),
  );
}

// The Permissions tab's actual displayed list: Admin/Requester rows
// straight from laptop_permissions (source: 'permissions'), plus one synthesized row
// per (email, stage) named anywhere in the approver matrix (source: 'matrix') — split
// per stage, not merged per person, so someone holding several stages (like Aamil
// holding both Country Manager and Supply Chain Director) can have just one removed.
// Stale IT Manager/Country Manager/IT Director/Supply Chain Director rows left over in
// laptop_permissions from before the switch are intentionally excluded, since they no
// longer grant anything.
export function buildMergedPermissionsList(
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
        countries: [],
      });
    }
  }
  // One row per (email, stage, slot) rather than one merged row per email — Remove/Edit
  // need an unambiguous single stage+slot to act on, and someone like Aamil holding
  // both Country Manager and Supply Chain Director needs to be able to manage just one,
  // same as an IT Manager 2 holder needs to manage just their own slot.
  const byEmail = accumulateMatrixApprovers(matrixRows);
  for (const entry of byEmail.values()) {
    for (const [stage, slots] of entry.stages) {
      for (const [slot, countrySet] of slots) {
        const countries = [...countrySet].sort();
        items.push({
          source: 'matrix',
          email: entry.email,
          name: entry.name,
          role: stage,
          matrixSlot: slot,
          country: countries.join(', '),
          segment: null,
          countries,
        });
      }
    }
  }
  return items.sort(
    (a, b) =>
      a.role.localeCompare(b.role) ||
      (a.matrixSlot ?? 1) - (b.matrixSlot ?? 1) ||
      a.email.localeCompare(b.email),
  );
}

// Every breakdown is a GROUP BY now rather than `SELECT *` followed by six passes over
// the whole table in JS: same labels ('Unspecified' for blank/NULL), same descending
// count order, same slice sizes — as LIMIT — but Postgres returns a dozen rows instead of
// the entire requests table. `tally()` and its full-table fetch are gone with it.
//
// monthly_trend deliberately stays in JS. Bucketing dates into YYYY-MM in SQL would do it
// in the database's timezone rather than the Node process's, which can move a request
// either side of a month boundary and change a figure on the chart — so it keeps
// buildMonthlyTrend and its exact semantics, and only the two date columns it actually
// reads are fetched for it instead of every column of every row.
export async function computeLaptopAnalytics(
  actor: LaptopActor,
  where: string,
  params: string[],
): Promise<LaptopAnalyticsData> {
  // COALESCE(NULLIF(TRIM(col), ''), 'Unspecified') is exactly the old
  // `(value ?? '').trim() || 'Unspecified'`. The label tiebreak is new only in that it is
  // now deterministic — equal counts previously came back in whatever order the rows
  // happened to arrive in.
  const breakdown = (column: string, limit?: number) =>
    sql<QueryResultRow[]>(
      `SELECT COALESCE(NULLIF(TRIM(${column}), ''), 'Unspecified') AS label, COUNT(*)::int AS count
     FROM laptop_requests ${where}
     GROUP BY 1
     ORDER BY count DESC, label ASC${limit ? ` LIMIT ${limit}` : ''}`,
      params,
    );
  const toMetrics = (rows: QueryResultRow[]): LaptopAnalyticsMetric[] =>
    rows.map((r) => ({ label: String(r.label), count: Number(r.count ?? 0) }));

  const [
    stats,
    countRows,
    statusRows,
    requestTypeRows,
    deviceRows,
    countryRows,
    segmentRows,
    modelRows,
    trendRows,
  ] = await Promise.all([
    // The same stats the old in-JS buildStats() produced. pending_review is identical
    // too: it counts requests actionable by this actor, and getScopedActions can
    // only ever return an actionable move for a status that has an approval stage — which
    // is exactly APPROVAL_ACTIVE_STATUSES, the set computeLaptopStats filters to.
    computeLaptopStats(actor, where, params),
    sql<QueryResultRow[]>(
      `SELECT
         COUNT(DISTINCT LOWER(TRIM(requested_by_email))) FILTER (WHERE TRIM(requested_by_email) <> '')::int AS active_requester_count,
         COUNT(DISTINCT LOWER(TRIM(country))) FILTER (WHERE TRIM(country) <> '')::int AS country_count
       FROM laptop_requests ${where}`,
      params,
    ),
    breakdown('status'),
    breakdown('request_type'),
    breakdown('type_of_device'),
    breakdown('country', 12),
    breakdown('segment', 12),
    breakdown('requested_model', 10),
    sql<QueryResultRow[]>(
      `SELECT requested_date, created_at FROM laptop_requests ${where}`,
      params,
    ),
  ]);

  const counts = countRows[0] ?? {};

  return {
    actor,
    stats: {
      ...stats,
      active_requester_count: Number(counts.active_requester_count ?? 0),
      country_count: Number(counts.country_count ?? 0),
    },
    status_breakdown: toMetrics(statusRows),
    request_type_breakdown: toMetrics(requestTypeRows),
    device_breakdown: toMetrics(deviceRows),
    country_breakdown: toMetrics(countryRows),
    segment_breakdown: toMetrics(segmentRows),
    top_models: toMetrics(modelRows),
    monthly_trend: buildMonthlyTrend(
      asSerialised<Array<Pick<LaptopRequest, 'requested_date' | 'created_at'>>>(trendRows),
    ),
    generated_at: new Date().toISOString(),
  };
}
