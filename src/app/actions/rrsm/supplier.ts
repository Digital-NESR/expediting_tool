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
import { sendRrsmMail, supplierCodeMail, supplierSubmittedMail } from '@/lib/rrsm/notify';
import {
  DOC_KINDS,
  NO_DOCS,
  checkDoc,
  docList,
  missingDocs,
  proposalAgainst,
  type DocKind,
  type DocRequirements,
} from '@/lib/rrsm/submission';

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
  /** The agreed rate for this month, which the cost is worked out from. */
  rate: number | null;
  /** What the supplier has proposed instead, if anything; null for no change. */
  supplierRate: number | null;
  supplierUom: string | null;
  /** Set once the supplier has submitted a proposal, and again when a buyer decides on it. */
  changeStatus: 'pending' | 'accepted' | 'rejected' | null;
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
  currency: string;
  /** Pricing units a supplier may choose from. */
  uoms: { code: string; label: string }[];
  /** Which documents this invitation asks for, and what is uploaded. Only after verification. */
  requires: DocRequirements;
  documents: { kind: DocKind; fileName: string; uploadedAt: string }[];
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
  currency: '',
  uoms: [],
  requires: NO_DOCS,
  documents: [],
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
      currency: verifiedAs ? t.currency : '',
      uoms: verifiedAs ? await uomOptions() : [],
      ...(verifiedAs ? await documentsFor(t.linkId) : { requires: DENIED.requires, documents: [] }),
    };
  } catch (err) {
    log.error('getRrsmSubmission.failed', err);
    return DENIED;
  }
}

async function linesFor(t: SubmissionTarget): Promise<SupplierLine[]> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT l.id, l.qty, l.days, l.on_hire, l.stage, COALESCE(l.remarks, '') AS remarks,
            l.rate, l.supplier_rate, l.supplier_uom, l.change_status,
            s.description, COALESCE(s.asset_ref, '') AS asset_ref,
            COALESCE(l.uom, s.uom) AS uom,
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
    rate: r.rate === null ? null : Number(r.rate),
    supplierRate: r.supplier_rate === null ? null : Number(r.supplier_rate),
    supplierUom: r.supplier_uom ? String(r.supplier_uom) : null,
    changeStatus: r.change_status
      ? (String(r.change_status) as SupplierLine['changeStatus'])
      : null,
  }));
}

async function uomOptions(): Promise<{ code: string; label: string }[]> {
  const { rows } = await rrsmPool.query<QueryResultRow>(
    `SELECT code, label FROM rrsm_uoms WHERE active ORDER BY sort_order, label`,
  );
  return rows.map((r) => ({ code: String(r.code), label: String(r.label) }));
}

async function documentsFor(linkId: number): Promise<{
  requires: DocRequirements;
  documents: { kind: DocKind; fileName: string; uploadedAt: string }[];
}> {
  const [link, docs] = await Promise.all([
    rrsmPool.query<QueryResultRow>(
      `SELECT requires_delivery_note, requires_timesheet, requires_invoice
         FROM rrsm_supplier_links WHERE id = $1`,
      [linkId],
    ),
    rrsmPool.query<QueryResultRow>(
      `SELECT kind, file_name, uploaded_at FROM rrsm_submission_documents
        WHERE link_id = $1 ORDER BY kind`,
      [linkId],
    ),
  ]);
  return {
    requires: {
      deliveryNote: Boolean(link.rows[0]?.requires_delivery_note),
      timesheet: Boolean(link.rows[0]?.requires_timesheet),
      invoice: Boolean(link.rows[0]?.requires_invoice),
    },
    documents: docs.rows.map((d) => ({
      kind: String(d.kind) as DocKind,
      fileName: String(d.file_name),
      uploadedAt: d.uploaded_at instanceof Date ? d.uploaded_at.toISOString().slice(0, 10) : '',
    })),
  };
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
    const sent = await sendRrsmMail(
      supplierCodeMail({
        email: issued.email,
        supplierName: t.supplierName,
        countryName: t.countryName,
        period: t.period,
        code: issued.code,
        expiresInSeconds: CODE_TTL_SECONDS,
      }),
    );
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
  lines: {
    id: number;
    qty: number;
    days: number | null;
    onHire: boolean;
    remarks?: string;
    /** The rate and pricing unit the supplier says apply. Equal to the agreed ones = no change. */
    rate?: number | null;
    uom?: string;
  }[],
): Promise<SupplierResult> {
  try {
    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };
    const email = await sessionEmailFor(t.linkId, sessionToken);
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };

    const uoms = new Set((await uomOptions()).map((u) => u.code));

    for (const line of lines ?? []) {
      const qty = Number(line?.qty);
      if (!Number.isFinite(qty) || qty < 0) {
        return { success: false, error: 'Quantities must be zero or more.' };
      }
      const days = line?.days === null || line?.days === undefined ? null : Number(line.days);
      if (days !== null && (!Number.isFinite(days) || days < 0 || days > 31)) {
        return { success: false, error: 'Days must be between 0 and 31.' };
      }
      const rate = line?.rate === null || line?.rate === undefined ? null : Number(line.rate);
      if (rate !== null && (!Number.isFinite(rate) || rate < 0)) {
        return { success: false, error: 'A rate must be a number, zero or more.' };
      }
      const uom = String(line?.uom ?? '').trim();
      if (uom && !uoms.has(uom)) {
        return { success: false, error: 'Pick a pricing unit from the list.' };
      }

      /* The proposal is stored only where it differs from what was agreed for this month, so a
         supplier who saves without touching the rate proposes nothing. The agreed terms are read
         from the row, never taken from the browser. */
      const { rows: agreedRows } = await rrsmPool.query<QueryResultRow>(
        `SELECT l.rate, COALESCE(l.uom, s.uom) AS uom
           FROM rrsm_cycle_lines l JOIN rrsm_service_lines s ON s.id = l.service_line_id
          WHERE l.id = $1 AND l.cycle_id = $2 AND s.supplier_code = $3`,
        [Number(line.id), t.cycleId, t.supplierCode],
      );
      const agreed = agreedRows[0];
      if (!agreed) continue;
      const proposal = proposalAgainst(
        { rate: agreed.rate === null ? null : Number(agreed.rate), uom: String(agreed.uom) },
        { rate, uom: uom || String(agreed.uom) },
      );

      await rrsmPool.query(
        `UPDATE rrsm_cycle_lines l
            SET qty = $4, days = $5, on_hire = $6, remarks = NULLIF($7, ''),
                submitted_by = $8, supplier_rate = $9, supplier_uom = $10,
                change_status = NULL, updated_at = NOW()
           FROM rrsm_service_lines s
          WHERE l.id = $1 AND l.service_line_id = s.id
            AND l.cycle_id = $2 AND s.supplier_code = $3
            AND (l.stage = 'awaiting_supplier'
                 OR (l.stage = 'returned' AND l.returned_to = 'supplier'))`,
        [
          Number(line.id),
          t.cycleId,
          t.supplierCode,
          qty,
          days,
          Boolean(line.onHire),
          String(line?.remarks ?? '').trim(),
          email,
          proposal.rate,
          proposal.uom,
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

    /* The documents this invitation asked for come first: a submission without them is not one. */
    const { requires, documents } = await documentsFor(t.linkId);
    const missing = missingDocs(
      requires,
      documents.map((d) => d.kind),
    );
    if (missing.length) {
      return {
        success: false,
        error: `Upload ${docList(missing)} before submitting.`,
      };
    }

    /* A line carrying a proposed rate or pricing unit goes to a buyer before anything else. The
       rest go to Ops, or straight to "validated" in a country that does not run Ops validation. */
    const { rows: stepRows } = await rrsmPool.query<QueryResultRow>(
      `SELECT ops_validation FROM rrsm_countries WHERE code = $1`,
      [t.countryCode],
    );
    const opsStep =
      stepRows[0]?.ops_validation === undefined ? true : Boolean(stepRows[0].ops_validation);
    const { rows } = await rrsmPool.query<QueryResultRow>(
      `UPDATE rrsm_cycle_lines l
          SET stage = CASE WHEN l.supplier_rate IS NOT NULL OR l.supplier_uom IS NOT NULL OR $4
                           THEN 'submitted' ELSE 'validated' END,
              validated_by = CASE WHEN l.supplier_rate IS NULL AND l.supplier_uom IS NULL AND NOT $4
                                  THEN $3 ELSE l.validated_by END,
              validated_at = CASE WHEN l.supplier_rate IS NULL AND l.supplier_uom IS NULL AND NOT $4
                                  THEN NOW() ELSE l.validated_at END,
              returned_to = NULL,
              change_status = CASE WHEN l.supplier_rate IS NOT NULL OR l.supplier_uom IS NOT NULL
                                   THEN 'pending' ELSE NULL END,
              submitted_by = $3, submitted_at = NOW(), updated_at = NOW()
         FROM rrsm_service_lines s
        WHERE l.service_line_id = s.id
          AND l.cycle_id = $1 AND s.supplier_code = $2
          /* A line returned to the buyer or to Ops is theirs now; a supplier re-submitting
             their month must not quietly pick it up (24 Nov 2026). */
          AND (l.stage = 'awaiting_supplier'
               OR (l.stage = 'returned' AND l.returned_to = 'supplier'))
        RETURNING l.id, l.qty, l.rate, l.change_status, l.stage`,
      /* Every parameter is used: Postgres refuses one it cannot type, which is how this statement
         failed outright while it was passed the link id it never read. */
      [t.cycleId, t.supplierCode, email, opsStep],
    );

    await rrsmPool.query(
      `UPDATE rrsm_supplier_links SET submitted_at = NOW(), submitted_by = $2 WHERE id = $1`,
      [t.linkId, email],
    );

    for (const r of rows) {
      await rrsmPool.query(
        `INSERT INTO rrsm_activity_log (cycle_line_id, cycle_id, actor, action, to_stage, note)
         VALUES ($1, $2, $3, 'submitted', $5, $4)`,
        [
          Number(r.id),
          t.cycleId,
          email,
          r.change_status === 'pending'
            ? 'Submitted by the supplier with a different rate or pricing unit, for buyer review'
            : 'Submitted by the supplier',
          String(r.stage),
        ],
      );
    }

    const total = rows.reduce((n, r) => n + lineValue(Number(r.qty), Number(r.rate)), 0);

    /* Who hears about it: everyone holding a grant in this country, which is the people who can
       act on it. Resolved here rather than in the workflow, so the recipient list is a database
       question rather than something n8n has to know about roles. */
    const { rows: watchers } = await rrsmPool.query<QueryResultRow>(
      `SELECT DISTINCT email FROM rrsm_users WHERE active AND country_code = $1`,
      [t.countryCode],
    );
    const to = watchers.map((w) => String(w.email));

    /* Best effort, unlike the code mail: the submission is already saved, so a mail that does not
       go out is a chase problem rather than a lost submission. Logged inside sendRrsmMail. */
    if (to.length) {
      await sendRrsmMail(
        supplierSubmittedMail({
          to,
          supplierName: t.supplierName,
          countryName: t.countryName,
          period: t.period,
          lines: rows.length,
          total,
          currency: t.currency,
          submittedBy: email,
        }),
      );
    }

    return { success: true, moved: rows.length };
  } catch (err) {
    log.error('submitRrsmCycle.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}

/* ─── documents ──────────────────────────────────────────────────────────────────────────── */

/**
 * Upload the Delivery Note, the Timesheet or the Invoice for this month. One of each per invitation; uploading
 * again replaces it. Takes FormData because it carries a file.
 *
 * Every check a public endpoint needs: the token resolves, the session proves a verified address,
 * the link is still accepting, and the file is a permitted type and size (judged by its extension,
 * not by what the browser claims).
 */
export async function uploadRrsmDocument(form: FormData): Promise<SupplierResult> {
  try {
    const token = String(form.get('token') ?? '');
    const sessionToken = String(form.get('sessionToken') ?? '');
    const kind = String(form.get('kind') ?? '') as DocKind;
    const file = form.get('file');

    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };
    const email = await sessionEmailFor(t.linkId, sessionToken);
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };
    if (!DOC_KINDS.includes(kind)) {
      return { success: false, error: 'Unknown document.' };
    }
    if (!(file instanceof File)) return { success: false, error: 'Choose a file to upload.' };

    const ok = checkDoc({ name: file.name, size: file.size });
    if (!ok.ok) return { success: false, error: ok.error };

    const bytes = Buffer.from(await file.arrayBuffer());
    await rrsmPool.query(
      `INSERT INTO rrsm_submission_documents
         (link_id, kind, file_name, content_type, size_bytes, content, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (link_id, kind) DO UPDATE
         SET file_name = EXCLUDED.file_name, content_type = EXCLUDED.content_type,
             size_bytes = EXCLUDED.size_bytes, content = EXCLUDED.content,
             uploaded_by = EXCLUDED.uploaded_by, uploaded_at = NOW()`,
      [t.linkId, kind, ok.name, ok.contentType, bytes.length, bytes, email],
    );
    return { success: true };
  } catch (err) {
    log.error('uploadRrsmDocument.failed', err);
    return { success: false, error: 'The upload did not go through. Try again.' };
  }
}

/** Remove an uploaded document before submitting. */
export async function removeRrsmDocument(
  token: string,
  sessionToken: string,
  kind: DocKind,
): Promise<SupplierResult> {
  try {
    const t = await targetForToken(token);
    if (!t || !t.accepting) return { success: false, error: 'That link is no longer open.' };
    const email = await sessionEmailFor(t.linkId, sessionToken);
    if (!email) return { success: false, error: 'Your session has expired. Request a new code.' };
    await rrsmPool.query(`DELETE FROM rrsm_submission_documents WHERE link_id = $1 AND kind = $2`, [
      t.linkId,
      String(kind),
    ]);
    return { success: true };
  } catch (err) {
    log.error('removeRrsmDocument.failed', err);
    return { success: false, error: 'Something went wrong. Try again.' };
  }
}
