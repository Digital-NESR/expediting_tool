'use server';

import { revalidatePath } from 'next/cache';
import type { QueryResultRow } from 'pg';
import { AccessError } from '@/lib/require-access';
import { logger } from '@/lib/logger';
import { withTransaction } from '@/lib/db/tx';
import {
  approvesStep,
  requireCommunicationAccess,
  requireSafeSignAnyone,
  type SafeSignActor,
} from '@/lib/safesign/access';
import { approversAt } from '@/lib/safesign/approvals';
import { safesignPool, ensureSafeSignSchema } from '@/lib/safesign/db';
import { approvalRequestMail, approvedMail, rejectedMail, sendSafeSignMail } from '@/lib/safesign/notify';
import { appBase } from '@/lib/safesign/supplier-access';

/**
 * The approval chain (see src/lib/safesign/approvals.ts). Every export is a public POST, so each
 * checks who is calling: submitting is the sender's (their country), deciding is the approver's
 * (their step, never their own communication, never twice).
 */

const log = logger('safesign-approvals');

export type ApprovalResult = { success: boolean; error?: string; message?: string };

function fail(err: unknown, event: string): ApprovalResult {
  if (err instanceof AccessError) return { success: false, error: err.message };
  log.error(event, err);
  return { success: false, error: 'Something went wrong. Try again.' };
}

const reviewUrl = (id: number) => `${appBase()}/safesign/approvals/${id}`;
const commUrl = (id: number) => `${appBase()}/safesign/communications/${id}`;

interface CommRow {
  id: number;
  countryId: string;
  countryName: string;
  title: string;
  createdBy: string;
  approval: string;
  scmDecidedBy: string | null;
  suppliers: number;
}

async function loadComm(id: number): Promise<CommRow | null> {
  const { rows } = await safesignPool.query<QueryResultRow>(
    `SELECT c.id, c.country_id, k.name AS country_name, c.title, c.created_by, c.approval,
            c.scm_decided_by, c.status,
            (SELECT COUNT(*) FROM ss_requests r WHERE r.communication_id = c.id)::int AS suppliers
       FROM ss_communications c JOIN ss_countries k ON k.id = c.country_id WHERE c.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r || r.status !== 'draft') return null;
  return {
    id: Number(r.id),
    countryId: String(r.country_id),
    countryName: String(r.country_name),
    title: String(r.title),
    createdBy: String(r.created_by).toLowerCase(),
    approval: String(r.approval),
    scmDecidedBy: r.scm_decided_by ? String(r.scm_decided_by).toLowerCase() : null,
    suppliers: Number(r.suppliers),
  };
}

/** Email the people at the next step. Failure is logged, not fatal: the page still shows it. */
async function notifyStep(c: CommRow, step: 'scm' | 'final', exclude: string[]): Promise<boolean> {
  const to = (await approversAt(step, c.countryId)).map((a) => a.email).filter((e) => !exclude.includes(e));
  if (!to.length) return false;
  const sent = await sendSafeSignMail(
    approvalRequestMail({
      to,
      step,
      countryName: c.countryName,
      title: c.title,
      sender: c.createdBy,
      suppliers: c.suppliers,
      url: reviewUrl(c.id),
    }),
  );
  return sent.ok;
}

async function event(id: number, kind: string, actor: string, detail: Record<string, unknown> = {}) {
  await safesignPool.query(
    `INSERT INTO ss_events (communication_id, kind, actor, detail) VALUES ($1, $2, $3, $4)`,
    [id, kind, actor, JSON.stringify(detail)],
  );
}

/**
 * Send a saved communication into the chain (again, after a rejection). When the sender is the
 * country's SCM, their own step is skipped and it goes straight to final approval.
 */
export async function submitForApproval(id: number): Promise<ApprovalResult> {
  try {
    const actor = await requireCommunicationAccess(id);
    await ensureSafeSignSchema();
    const c = await loadComm(id);
    if (!c) return { success: false, error: 'Only a communication that has not been sent can be submitted.' };
    if (c.approval !== 'not_submitted' && c.approval !== 'rejected') {
      return { success: false, error: 'This communication is already in approval.' };
    }
    const me = actor.email.toLowerCase();
    const scm = await approversAt('scm', c.countryId);
    const final = (await approversAt('final', c.countryId)).filter((a) => a.email !== me);
    if (!final.length) return { success: false, error: 'No final approver is set up. Ask an administrator.' };
    const selfScm = scm.some((a) => a.email === me);
    if (!scm.length && !selfScm) {
      return {
        success: false,
        error: `No supply chain manager is set up for ${c.countryName}. Ask an administrator to add one.`,
      };
    }

    const next = selfScm ? 'pending_final' : 'pending_scm';
    await safesignPool.query(
      `UPDATE ss_communications
          SET approval = $2, submitted_at = NOW(),
              scm_decided_by = $3, scm_decided_at = CASE WHEN $3::text IS NULL THEN NULL ELSE NOW() END,
              final_decided_by = NULL, final_decided_at = NULL,
              rejection_step = NULL, rejection_comment = NULL
        WHERE id = $1`,
      [id, next, selfScm ? me : null],
    );
    await event(id, 'approval.submitted', actor.email);
    if (selfScm) await event(id, 'approval.scm_approved', actor.email, { comment: 'Submitted by the country SCM.' });

    const mailed = await notifyStep(c, selfScm ? 'final' : 'scm', [me]);
    revalidatePath('/safesign', 'layout');
    return {
      success: true,
      message: selfScm
        ? `Submitted. As ${c.countryName}'s SCM your step is done; it is with the final approvers now.`
        : `Submitted to ${scm.map((a) => a.name).join(', ')} for approval.` +
          (mailed ? '' : ' (The email to them could not be sent; let them know.)'),
    };
  } catch (err) {
    return fail(err, 'submitForApproval.failed');
  }
}

/** The step this person may decide on this communication now, or an error saying why not. */
function stepFor(actor: SafeSignActor, c: CommRow): 'scm' | 'final' {
  const me = actor.email.toLowerCase();
  if (c.createdBy === me) throw new AccessError('You cannot approve your own communication.');
  if (c.approval === 'pending_scm' && approvesStep(actor, 'scm', c.countryId)) return 'scm';
  if (c.approval === 'pending_final' && approvesStep(actor, 'final', c.countryId)) {
    if (c.scmDecidedBy === me) throw new AccessError('You already approved this one as SCM; another final approver must.');
    return 'final';
  }
  throw new AccessError('This communication is not waiting for your approval.');
}

export async function approveCommunication(id: number, comment?: string): Promise<ApprovalResult> {
  try {
    const actor = await requireSafeSignAnyone();
    await ensureSafeSignSchema();
    const c = await loadComm(id);
    if (!c) return { success: false, error: 'That communication is not waiting for approval.' };
    const step = stepFor(actor, c);
    const note = String(comment ?? '').trim().slice(0, 2000);

    const moved = await withTransaction(safesignPool, async (client) => {
      const { rowCount } = await client.query(
        step === 'scm'
          ? `UPDATE ss_communications SET approval = 'pending_final', scm_decided_by = $2, scm_decided_at = NOW()
              WHERE id = $1 AND approval = 'pending_scm'`
          : `UPDATE ss_communications SET approval = 'approved', final_decided_by = $2, final_decided_at = NOW()
              WHERE id = $1 AND approval = 'pending_final'`,
        [id, actor.email],
      );
      if (!rowCount) return false;
      await client.query(
        `INSERT INTO ss_events (communication_id, kind, actor, detail) VALUES ($1, $2, $3, $4)`,
        [id, `approval.${step}_approved`, actor.email, JSON.stringify(note ? { comment: note } : {})],
      );
      return true;
    });
    if (!moved) return { success: false, error: 'Someone else has just decided this one.' };

    if (step === 'scm') {
      await notifyStep(c, 'final', [c.createdBy, actor.email.toLowerCase()]);
    } else {
      await sendSafeSignMail(approvedMail({ to: [c.createdBy], title: c.title, approvedBy: actor.name, url: commUrl(id) }));
    }
    revalidatePath('/safesign', 'layout');
    return {
      success: true,
      message: step === 'scm' ? 'Approved. It goes to the final approvers now.' : 'Approved. The sender has been told they can send it.',
    };
  } catch (err) {
    return fail(err, 'approveCommunication.failed');
  }
}

export async function rejectCommunication(id: number, comment: string): Promise<ApprovalResult> {
  try {
    const actor = await requireSafeSignAnyone();
    await ensureSafeSignSchema();
    const note = String(comment ?? '').trim().slice(0, 2000);
    if (!note) return { success: false, error: 'Say why it is rejected, so the sender knows what to fix.' };
    const c = await loadComm(id);
    if (!c) return { success: false, error: 'That communication is not waiting for approval.' };
    const step = stepFor(actor, c);

    const { rowCount } = await safesignPool.query(
      `UPDATE ss_communications
          SET approval = 'rejected', rejection_step = $2, rejection_comment = $3,
              ${step === 'scm' ? 'scm_decided_by = $4, scm_decided_at = NOW()' : 'final_decided_by = $4, final_decided_at = NOW()'}
        WHERE id = $1 AND approval = $5`,
      [id, step, note, actor.email, step === 'scm' ? 'pending_scm' : 'pending_final'],
    );
    if (!rowCount) return { success: false, error: 'Someone else has just decided this one.' };
    await event(id, `approval.${step}_rejected`, actor.email, { comment: note });

    const mail = await sendSafeSignMail(
      rejectedMail({ to: [c.createdBy], title: c.title, rejectedBy: actor.name, step, comment: note, url: commUrl(id) }),
    );
    revalidatePath('/safesign', 'layout');
    return {
      success: true,
      message: mail.ok ? 'Rejected. The sender has been emailed your reason.' : 'Rejected, but the email to the sender could not be sent.',
    };
  } catch (err) {
    return fail(err, 'rejectCommunication.failed');
  }
}
