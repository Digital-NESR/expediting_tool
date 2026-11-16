'use server';

import type { QueryResultRow } from 'pg';
import rrsmPool from '@/lib/db-rrsm';
import { logger } from '@/lib/logger';
import { lineValue } from '@/lib/rrsm/cycle';
import {
  CODE_TTL_SECONDS,
  issueCode,
  maskEmail,
  sessionEmailFor,
  targetForToken,
  verifyCode,
  type SubmissionTarget,
} from '@/lib/rrsm/supplier-access';
import { notifyRrsm } from '@/lib/rrsm/notify';

/**
 * The supplier's half of the cycle, reached by an emailed link and no NESR account.
 *
 * EVERY EXPORT HERE IS A PUBLIC POST ENDPOINT THAT ANYONE ON THE INTERNET CAN CALL, with no
 * session behind it. `/rrsm/submit` is in `PUBLIC_PATHS` in src/proxy.ts, so nothing upstream
 * stands between a stranger and these functions.
 *
 * So each one re-derives everything from the token it is handed. The token resolves to a
 * supplier and a cycle; the session token proves the holder read one of that supplier's own
 * addresses; and every row touched is re-checked as belonging to that link rather than trusted
 * from an id in the payload. A line id from a browser proves nothing at all.
 *
 * Nothing here reveals why a token failed. A missing link, a closed cycle and a supplier that
 * has been deactivated all come back the same way, because the difference is information about
 * somebody else's account.
 */

const log = logger('rrsm-supplier');

export interface SupplierLine {
  id: number;
  description: string;
  assetRef: string;
  uom: string;
  onHire: boolean;
  days: number | null;
  qty: number;
  /** Last cycle's confirmed quantity, so the supplier is correcting rather than typing blind. */
  previousQty: number | null;
  stage: string;
  remarks: string;
}

export interface SupplierView {
  ok: boolean;
  supplierName: string;
  countryName: string;
  period: string;
  closesOn: string;
  accepting: boolean;
  alreadySubmitted: boolean;
  /** Masked, in the order `requestRrsmCode` expects to be given an index. */
  contacts: string[];
  /** Set once a code has been verified. */
  verifiedAs: string | null;
  lines: SupplierLine[];
  codeTtlSeconds: number;
}

const DENIED: SupplierView = {
  ok: false,
  supplierName: '',
  countryName: '',
  period: '',
  closesOn: '',
  accepting: false,
  alreadySubmitted: false,
  contacts: [],
  verifiedAs: null,
  lines: [],
  codeTtlSeconds: CODE_TTL_SECONDS,
};

/** Resolve the link, and the lines only once a session proves who is holding it. */
export async function getRrsmSubmission(
  token: string,
  sessionToken?: string,
): Promise<SupplierView> {
  try {
    const t = await targetForToken(token);
    if (!t) return DENIED;

    const verifiedAs = await sessionEmailFor(t.linkId, sessionToken);

    return {
      ok: true,
      supplierName: t.supplierName,
      countryName: t.countryName,
      period: t.period,
      closesOn: t.closesOn,
      accepting: t.accepting,
      alreadySubmitted: t.alreadySubmitted,
      contacts: t.contacts.map(maskEmail),
      verifiedAs,
      /* Lines only after verification. Before it, the page shows the supplier's own name and the
         month and nothing else — enough for them to recognise the request, not enough for a
         stranger with a forwarded link to learn what NESR hires from them or at what quantity. */
      lines: verifiedAs ? await linesFor(t) : [],
      codeTtlSeconds: CODE_TTL_SECONDS,
    };
  } catch (err) {
    log.error('getRrsmSubmission.failed', err);
    return DENIED;
  }
}

async function linesFor(t: SubmissionTarget): Promise<SupplierLine[]> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT l.id, l.qty, l.days, l.on_hire, l.stage, COALESCE(l.remarks, '') AS remarks,
            s.description, COALESCE(s.asset_ref, '') AS asset_ref, s.uom,
            prev.qty AS prev_qty
       FROM rrsm_cycle_lines l
       JOIN rrsm_service_lines s ON s.id = l.service_line_id
       LEFT JOIN LATERAL (
            SELECT p.qty FROM rrsm_cycle_lines p
              JOIN rrsm_cycles pc ON pc.id = p.cycle_id
             WHERE p.service_line_id = l.service_line_id
               AND pc.country_code = $3 AND pc.period < $4
             ORDER BY pc.period DESC LIMIT 1
       ) prev ON TRUE
      WHERE l.cycle_id = $1 AND s.supplier_code = $2
      ORDER BY s.segment, s.description`,
    [t.cycleId, t.supplierCode, t.countryCode, t.period],
  );

  return rows.map((r) => ({
    id: Number(r.id),
    description: String(r.description),
    assetRef: String(r.asset_ref ?? ''),
    uom: String(r.uom),
    onHire: Boolean(r.on_hire),
    days: r.days === null ? null : Number(r.days),
    qty: Number(r.qty ?? 0),
    previousQty: r.prev_qty === null || r.prev_qty === undefined ? null : Number(r.prev_qty),
    stage: String(r.stage),
    remarks: String(r.remarks ?? ''),
  }));
}

export type SupplierResult = { success: boolean; error?: string; retryAfterSeconds?: number };

/**
 * Send a code to one of the supplier's addresses, chosen by position.
 *
 * `contactIndex`, never an address: the page must not be able to test whether a guessed address
 * belongs to this supplier.
 */
export async function requestRrsmCode(
  token: string,
  contactIndex: number,
): Promise<SupplierResult> {
  try {
    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };

    const issued = await issueCode(t.linkId, t.contacts, Number(contactIndex));
    if (!issued.ok) {
      return { success: false, error: issued.reason, retryAfterSeconds: issued.retryAfterSeconds };
    }

    /* The code leaves by the same path as every other RRSM mail. If that path is not configured
       the supplier never receives it, so a failure here is returned rather than logged and
       swallowed: a page that says "code sent" when nothing was sent is worse than an error. */
    const sent = await notifyRrsm({
      event: 'supplier.code_requested',
      to: [issued.email],
      supplierName: t.supplierName,
      countryName: t.countryName,
      period: t.period,
      code: issued.code,
      expiresInSeconds: CODE_TTL_SECONDS,
    });
    if (!sent.ok) {
      return {
        success: false,
        error: 'The code could not be sent. Reply to the invitation and ask your NESR contact.',
      };
    }

    return { success: true };
  } catch (err) {
    log.error('requestRrsmCode.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

/** Check a code. Returns the session token the page then carries. */
export async function verifyRrsmCode(
  token: string,
  attempt: string,
): Promise<SupplierResult & { sessionToken?: string }> {
  try {
    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };

    const v = await verifyCode(t.linkId, attempt);
    if (!v.ok) return { success: false, error: v.reason };
    return { success: true, sessionToken: v.sessionToken };
  } catch (err) {
    log.error('verifyRrsmCode.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

/**
 * Save what the supplier has entered, without submitting it.
 *
 * Every line id is checked against the link's own cycle and supplier in the WHERE clause, so an
 * id belonging to another supplier updates nothing rather than being rejected with a message
 * that confirms it exists.
 */
export async function saveRrsmSupplierLines(
  token: string,
  sessionToken: string,
  lines: { id: number; qty: number; days: number | null; onHire: boolean; remarks?: string }[],
): Promise<SupplierResult> {
  try {
    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };
    const email = await sessionEmailFor(t.linkId, sessionToken);
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };

    for (const line of lines ?? []) {
      const qty = Number(line?.qty);
      if (!Number.isFinite(qty) || qty < 0) {
        return { success: false, error: 'Quantities must be zero or more.' };
      }
      const days = line?.days === null || line?.days === undefined ? null : Number(line.days);
      if (days !== null && (!Number.isFinite(days) || days < 0 || days > 31)) {
        return { success: false, error: 'Days must be between 0 and 31.' };
      }

      await rrsmPool.query(
        `UPDATE rrsm_cycle_lines l
            SET qty = $4, days = $5, on_hire = $6, remarks = NULLIF($7, ''),
                submitted_by = $8, updated_at = NOW()
           FROM rrsm_service_lines s
          WHERE l.id = $1 AND l.service_line_id = s.id
            AND l.cycle_id = $2 AND s.supplier_code = $3
            AND l.stage IN ('awaiting_supplier', 'returned')`,
        [
          Number(line.id),
          t.cycleId,
          t.supplierCode,
          qty,
          days,
          Boolean(line.onHire),
          String(line?.remarks ?? '').trim(),
          email,
        ],
      );
    }

    return { success: true };
  } catch (err) {
    log.error('saveRrsmSupplierLines.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

/**
 * Submit the cycle: every open line moves to `submitted` and the link is closed.
 *
 * One statement rather than a loop, so a supplier cannot end up half submitted, and the link is
 * stamped in the same breath. After this the link stops accepting — a correction is a return
 * from Ops, not a second submission nobody was told about.
 */
export async function submitRrsmCycle(
  token: string,
  sessionToken: string,
): Promise<SupplierResult & { moved?: number }> {
  try {
    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };
    const email = await sessionEmailFor(t.linkId, sessionToken);
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };

    const { rows } = await rrsmPool.query<QueryResultRow>(
      `UPDATE rrsm_cycle_lines l
          SET stage = 'submitted', returned_to = NULL,
              submitted_by = $4, submitted_at = NOW(), updated_at = NOW()
         FROM rrsm_service_lines s
        WHERE l.service_line_id = s.id
          AND l.cycle_id = $1 AND s.supplier_code = $2
          AND l.stage IN ('awaiting_supplier', 'returned')
        RETURNING l.id, l.qty, l.rate`,
      [t.cycleId, t.supplierCode, t.linkId, email],
    );

    await rrsmPool.query(
      `UPDATE rrsm_supplier_links SET submitted_at = NOW(), submitted_by = $2 WHERE id = $1`,
      [t.linkId, email],
    );

    for (const r of rows) {
      await rrsmPool.query(
        `INSERT INTO rrsm_activity_log (cycle_line_id, cycle_id, actor, action, to_stage, note)
         VALUES ($1, $2, $3, 'submitted', 'submitted', 'Submitted by the supplier')`,
        [Number(r.id), t.cycleId, email],
      );
    }

    const total = rows.reduce((n, r) => n + lineValue(Number(r.qty), Number(r.rate)), 0);
    /* Best effort: the submission is already saved, so a mail that does not go out is a chase
       problem rather than a lost submission. Logged inside notifyRrsm either way. */
    await notifyRrsm({
      event: 'supplier.submitted',
      supplierName: t.supplierName,
      countryName: t.countryName,
      period: t.period,
      lines: rows.length,
      total,
      currency: t.currency,
      submittedBy: email,
    });

    return { success: true, moved: rows.length };
  } catch (err) {
    log.error('submitRrsmCycle.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}
