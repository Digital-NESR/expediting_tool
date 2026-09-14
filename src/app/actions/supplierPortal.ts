'use server';

import pool from '@/lib/db';
import { DS_DESCRIPTIONS } from '@/lib/constants';

/* ─── Types ──────────────────────────────────────────────── */

export interface ExpediteLineRow {
  po_number: string;
  po_line: string;
  current_status: string | null;
  new_delivery_date: string | null;
  supplier_comments: string | null;
  item_description: string | null;
  sap_mat_id: string | null;
  account_classification_description: string | null;
  open_qty: number | null;
  open_po_value_usd: number | null;
  delivery_date: string | null;
  supplier_name: string | null;
  buyer_name: string | null;
  country: string | null;
}

export interface PortalData {
  supplier_name: string;
  buyer_name: string;
  lines: ExpediteLineRow[];
}

export type GetTokenResult =
  | { expired: true }
  | { notFound: true }
  | PortalData;

export interface LineUpdate {
  po_number: string;
  po_line: string;
  delivery_status_code: string;
  new_delivery_date: string | null;
  supplier_comments: string;
}

/* ─── getExpediteByToken ─────────────────────────────────── */

export async function getExpediteByToken(token: string): Promise<GetTokenResult> {
  try {
    /* 1. Does this token exist at all? */
    const check = await pool.query<{ workflow_state: string }>(
      `SELECT workflow_state FROM active_expediting WHERE expedite_token = $1`,
      [token]
    );

    if (check.rows.length === 0) return { notFound: true };

    /* 2. Already submitted? */
    if (check.rows.some((r) => r.workflow_state === 'Submitted')) {
      return { expired: true };
    }

    /* 3. Full data with JOIN */
    const result = await pool.query<ExpediteLineRow>(
      `SELECT
         ae.po_number,
         ae.po_line,
         ae.current_status,
         ae.new_delivery_date,
         ae.supplier_comments,
         s.item_description,
         s.sap_mat_id,
         s.account_classification_description,
         s.open_qty,
         s.open_po_value_usd,
         s.delivery_date,
         s.supplier_name,
         s.buyer_name,
         s.country
       FROM active_expediting ae
       LEFT JOIN sap_open_po_master s
         ON ae.po_number = s.po_number
        AND ae.po_line   = s.po_line
       WHERE ae.expedite_token = $1
       ORDER BY ae.po_number, ae.po_line`,
      [token]
    );

    if (result.rows.length === 0) return { notFound: true };

    const first = result.rows[0];
    return {
      supplier_name: first.supplier_name ?? 'Unknown Supplier',
      buyer_name: first.buyer_name ?? 'Unknown Buyer',
      lines: result.rows,
    };
  } catch (err) {
    console.error('[getExpediteByToken]', err);
    return { notFound: true };
  }
}

/* ─── submitSupplierUpdates ──────────────────────────────── */

/** Longest supplier comment we persist. Anything longer is rejected outright. */
const MAX_SUPPLIER_COMMENT_LEN = 2000;

/** Generic message handed to the supplier — never leaks database detail. */
const GENERIC_SUBMIT_ERROR =
  'We could not save your updates. Please try again, or contact your NESR buyer.';

/**
 * Normalise a supplier-supplied date. Returns `null` for "not provided",
 * the ISO `YYYY-MM-DD` form when it parses, and `undefined` when the value is
 * not a date at all (caller rejects the whole submission).
 */
function normalizeSupplierDate(value: string | null): string | null | undefined {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (raw.length > 40) return undefined;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.valueOf())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

/**
 * DELIBERATELY PUBLIC AND UNAUTHENTICATED: suppliers reach this through a
 * tokenised link and have no NESR account. The bearer token is the only
 * credential, so everything else must be validated here — the token is
 * re-checked as still open inside the transaction, the status code must be a
 * known DS code, free text is capped, and database errors never reach the
 * supplier.
 */
export async function submitSupplierUpdates(
  token: string,
  updates: LineUpdate[]
): Promise<{ success: boolean; error?: string; expired?: boolean }> {
  /* ── Validate the payload before opening a transaction ── */
  if (typeof token !== 'string' || !token.trim() || token.length > 200) {
    return { success: false, error: GENERIC_SUBMIT_ERROR };
  }
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 5000) {
    return { success: false, error: GENERIC_SUBMIT_ERROR };
  }

  const validCodes = new Set(Object.keys(DS_DESCRIPTIONS));
  const cleaned: LineUpdate[] = [];

  for (const u of updates) {
    const code = String(u?.delivery_status_code ?? '').trim();
    if (!validCodes.has(code)) {
      return { success: false, error: 'Please choose a valid delivery status for every line.' };
    }

    const date = normalizeSupplierDate(u?.new_delivery_date ?? null);
    if (date === undefined) {
      return { success: false, error: 'Please enter a valid delivery date.' };
    }

    const comments = String(u?.supplier_comments ?? '').trim();
    if (comments.length > MAX_SUPPLIER_COMMENT_LEN) {
      return {
        success: false,
        error: `Comments must be ${MAX_SUPPLIER_COMMENT_LEN} characters or fewer.`,
      };
    }

    cleaned.push({
      po_number: String(u?.po_number ?? '').slice(0, 100),
      po_line: String(u?.po_line ?? '').slice(0, 100),
      delivery_status_code: code,
      new_delivery_date: date,
      supplier_comments: comments,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    /* The link is single-use: re-check inside the transaction (and lock the
       rows) so a replayed or concurrent submit cannot overwrite a response. */
    const open = await client.query(
      `SELECT id FROM active_expediting
       WHERE expedite_token = $1 AND workflow_state <> 'Submitted'
       FOR UPDATE`,
      [token]
    );

    if (open.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        expired: true,
        error: 'This link has already been used. Please contact your NESR buyer for changes.',
      };
    }

    for (const u of cleaned) {
      /* Update active_expediting — sets workflow_state = 'Submitted' (expires the link).
         Scoped to the token AND still-open rows so a stale line can never be rewritten. */
      const updated = await client.query<{ id: number }>(
        `UPDATE active_expediting SET
           current_status     = $1,
           new_delivery_date  = $2,
           supplier_comments  = $3,
           workflow_state     = 'Submitted',
           updated_at         = NOW()
         WHERE expedite_token = $4
           AND po_number      = $5
           AND po_line        = $6
           AND workflow_state <> 'Submitted'
         RETURNING id`,
        [
          u.delivery_status_code,
          u.new_delivery_date || null,
          u.supplier_comments || null,
          token,
          u.po_number,
          u.po_line,
        ]
      );

      if (updated.rows.length === 0) continue;
      const activeExpId = updated.rows[0].id;

      /* Insert audit log */
      await client.query(
        `INSERT INTO expediting_audit_log
           (active_expediting_id, status_submitted, new_delivery_date, comments, submitted_by, submitted_at)
         VALUES ($1, $2, $3, $4, 'Supplier', NOW())`,
        [
          activeExpId,
          u.delivery_status_code,
          u.new_delivery_date || null,
          u.supplier_comments || null,
        ]
      );
    }

    /* ── Update expediting_sessions response stats ── */
    const sessionRefResult = await client.query<{ session_ref: string }>(
      `SELECT session_ref FROM active_expediting
       WHERE expedite_token = $1 AND session_ref IS NOT NULL
       LIMIT 1`,
      [token]
    );

    if (sessionRefResult.rows.length > 0) {
      const sessionRef = sessionRefResult.rows[0].session_ref;
      await client.query(
        `WITH stats AS (
           SELECT
             COUNT(*) FILTER (WHERE workflow_state = 'Submitted')
               AS lines_responded,
             COUNT(DISTINCT expedite_token) FILTER (WHERE workflow_state = 'Submitted')
               AS suppliers_responded
           FROM active_expediting
           WHERE session_ref = $1
         )
         UPDATE expediting_sessions es SET
           suppliers_responded = stats.suppliers_responded,
           lines_responded     = stats.lines_responded,
           response_rate_pct   = ROUND(
             stats.lines_responded * 100.0 / NULLIF(es.total_po_lines, 0), 2),
           fully_closed = stats.lines_responded >= es.total_po_lines,
           closed_at = CASE
             WHEN stats.lines_responded >= es.total_po_lines THEN NOW()
             ELSE NULL
           END
         FROM stats
         WHERE es.session_ref = $1`,
        [sessionRef]
      );
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    /* Real cause stays server-side; the supplier only sees a generic message. */
    console.error('[submitSupplierUpdates]', err);
    return { success: false, error: GENERIC_SUBMIT_ERROR };
  } finally {
    client.release();
  }
}
