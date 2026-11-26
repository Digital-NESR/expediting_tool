import type { QueryResultRow } from 'pg';
import { ensureSafeSignSchema, safesignPool } from './db';
import type { SafeSignActor } from './access';
import type { ResponseType } from './model';
import { dateOnly } from './supplier-access';

/**
 * The approval chain a communication goes through before it can be emailed:
 *
 *   not_submitted ─submit─▶ pending_scm ─SCM approves─▶ pending_final ─final approves─▶ approved
 *                                │                            │
 *                                └────────── reject ──────────┴──▶ rejected ─submit again─▶ …
 *
 * pending_scm: the country's supply chain manager (ss_approvers step 'scm').
 * pending_final: any one of the final approvers (step 'final').
 * Nobody approves their own communication, and nobody approves the same one twice: when the
 * sender is the country's SCM the first step is skipped, and the final approval must come from
 * someone other than the sender and the SCM who approved it.
 *
 * A plain module: callers check access first.
 */

export type ApprovalState = 'not_submitted' | 'pending_scm' | 'pending_final' | 'approved' | 'rejected';

export const APPROVAL_LABEL: Record<ApprovalState, string> = {
  not_submitted: 'Not submitted',
  pending_scm: 'Awaiting SCM',
  pending_final: 'Awaiting final approval',
  approved: 'Approved',
  rejected: 'Rejected',
};

export interface ApproverPerson {
  id: number;
  step: 'scm' | 'final';
  countryId: string | null;
  email: string;
  name: string;
}

export async function listApprovers(): Promise<ApproverPerson[]> {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT id, step, country_id, email, COALESCE(name, email) AS name
       FROM ss_approvers ORDER BY step DESC, country_id, name`,
  );
  return rows.map((r) => ({
    id: Number(r.id),
    step: r.step === 'final' ? 'final' : 'scm',
    countryId: r.country_id ? String(r.country_id) : null,
    email: String(r.email).toLowerCase(),
    name: String(r.name),
  }));
}

/** Who approves at a step: the country's SCMs, or the final approvers. */
export async function approversAt(step: 'scm' | 'final', countryId: string): Promise<ApproverPerson[]> {
  const all = await listApprovers();
  return all.filter((a) => a.step === step && (step === 'final' || a.countryId === countryId));
}

export interface ApprovalInfo {
  state: ApprovalState;
  submittedAt: string | null;
  scmDecidedBy: string | null;
  scmDecidedAt: string | null;
  finalDecidedBy: string | null;
  finalDecidedAt: string | null;
  rejectionStep: 'scm' | 'final' | null;
  rejectionComment: string | null;
  scm: ApproverPerson[];
  final: ApproverPerson[];
  history: { kind: string; actor: string; at: string; comment: string | null }[];
}

const iso = (v: unknown): string | null =>
  v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v);

/** Where one communication is in the chain, who is involved, and what happened so far. */
export async function approvalInfo(communicationId: number): Promise<ApprovalInfo | null> {
  await ensureSafeSignSchema();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT country_id, approval, submitted_at, scm_decided_by, scm_decided_at, final_decided_by,
            final_decided_at, rejection_step, rejection_comment
       FROM ss_communications WHERE id = $1`,
    [communicationId],
  );
  const c = rows[0];
  if (!c) return null;
  const [scm, final, { rows: events }] = await Promise.all([
    approversAt('scm', String(c.country_id)),
    approversAt('final', String(c.country_id)),
    safesignPool.query<QueryResultRow>(
      `SELECT kind, actor, at, detail FROM ss_events
        WHERE communication_id = $1 AND kind LIKE 'approval.%' ORDER BY at`,
      [communicationId],
    ),
  ]);
  return {
    state: String(c.approval) as ApprovalState,
    submittedAt: iso(c.submitted_at),
    scmDecidedBy: c.scm_decided_by ?? null,
    scmDecidedAt: iso(c.scm_decided_at),
    finalDecidedBy: c.final_decided_by ?? null,
    finalDecidedAt: iso(c.final_decided_at),
    rejectionStep: c.rejection_step === 'scm' || c.rejection_step === 'final' ? c.rejection_step : null,
    rejectionComment: c.rejection_comment ?? null,
    scm,
    final,
    history: events.map((e) => ({
      kind: String(e.kind),
      actor: String(e.actor),
      at: iso(e.at) ?? '',
      comment: (e.detail as { comment?: string } | null)?.comment ?? null,
    })),
  };
}

export interface ApprovalItem {
  id: number;
  countryId: string;
  countryName: string;
  title: string;
  topicName: string;
  responseType: ResponseType;
  deadline: string;
  createdBy: string;
  submittedAt: string | null;
  suppliers: number;
  state: ApprovalState;
  /** This person may decide it now. */
  mine: boolean;
}

/**
 * Communications this person approves: the ones waiting on them now, and the ones they decided
 * in the last 60 days.
 */
export async function approvalsFor(actor: SafeSignActor): Promise<ApprovalItem[]> {
  await ensureSafeSignSchema();
  const me = actor.email.toLowerCase();
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT c.id, c.country_id, k.name AS country_name, c.title, t.name AS topic_name,
            c.response_type, c.deadline, c.created_by, c.submitted_at, c.approval,
            c.scm_decided_by, c.final_decided_by,
            (SELECT COUNT(*) FROM ss_requests r WHERE r.communication_id = c.id)::int AS suppliers
       FROM ss_communications c
       JOIN ss_topics t ON t.id = c.topic_id
       JOIN ss_countries k ON k.id = c.country_id
      WHERE (c.approval = 'pending_scm' AND c.country_id = ANY($1::text[]))
         OR (c.approval = 'pending_final' AND $2::boolean)
         OR ((LOWER(c.scm_decided_by) = $3 OR LOWER(c.final_decided_by) = $3)
             AND COALESCE(c.final_decided_at, c.scm_decided_at) > NOW() - INTERVAL '60 days')
      ORDER BY c.submitted_at DESC NULLS LAST`,
    [actor.approver.scm, actor.approver.final, me],
  );
  return rows.map((r) => {
    const state = String(r.approval) as ApprovalState;
    const createdBy = String(r.created_by).toLowerCase();
    const scmBy = String(r.scm_decided_by ?? '').toLowerCase();
    const mine =
      createdBy !== me &&
      ((state === 'pending_scm' && actor.approver.scm.includes(String(r.country_id))) ||
        (state === 'pending_final' && actor.approver.final && scmBy !== me));
    return {
      id: Number(r.id),
      countryId: String(r.country_id),
      countryName: String(r.country_name),
      title: String(r.title),
      topicName: String(r.topic_name),
      responseType: String(r.response_type) as ResponseType,
      deadline: dateOnly(r.deadline),
      createdBy: String(r.created_by),
      submittedAt: iso(r.submitted_at),
      suppliers: Number(r.suppliers),
      state,
      mine,
    };
  });
}

/** How many are waiting on this person, for the sidebar badge. */
export async function pendingApprovalCount(actor: SafeSignActor): Promise<number> {
  if (!actor.approver.final && !actor.approver.scm.length) return 0;
  return (await approvalsFor(actor)).filter((a) => a.mine).length;
}

/** May this person see a communication because they approve it (now, or did before)? */
export async function approverCanView(actor: SafeSignActor, communicationId: number): Promise<boolean> {
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT country_id, approval, scm_decided_by, final_decided_by FROM ss_communications WHERE id = $1`,
    [communicationId],
  );
  const c = rows[0];
  if (!c) return false;
  const me = actor.email.toLowerCase();
  if ([c.scm_decided_by, c.final_decided_by].some((e) => String(e ?? '').toLowerCase() === me)) return true;
  if (c.approval === 'not_submitted') return false;
  return actor.approver.final || actor.approver.scm.includes(String(c.country_id));
}
