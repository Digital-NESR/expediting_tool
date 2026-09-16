'use server';

import pool from '@/lib/db';
import { SELECTABLE_DS_CODES } from '@/lib/ds-codes';
import { ensurePoExpeditingSchema } from '@/lib/po-expediting-schema';
import { logger } from '@/lib/logger';

const log = logger('supplier-portal');

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
  /** The token genuinely is not in the table. */
  | { notFound: true }
  /** The lookup itself failed (database down, schema error). Distinct from
      `notFound` so the portal can say "try again" instead of telling a supplier
      with a perfectly good link that it does not exist. */
  | { failed: true }
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
      [token],
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
      [token],
    );

    if (result.rows.length === 0) return { notFound: true };

    const first = result.rows[0];
    return {
      supplier_name: first.supplier_name ?? 'Unknown Supplier',
      buyer_name: first.buyer_name ?? 'Unknown Buyer',
      lines: result.rows,
    };
  } catch (err) {
    /* A read failure is NOT a missing token: report it as a failure so the page
       renders an error state rather than "Link Not Found". */
    log.error('token_lookup.failed', err);
    return { failed: true };
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
  updates: LineUpdate[],
): Promise<{ success: boolean; error?: string; expired?: boolean }> {
  /* ── Validate the payload before opening a transaction ── */
  if (typeof token !== 'string' || !token.trim() || token.length > 200) {
    return { success: false, error: GENERIC_SUBMIT_ERROR };
  }
  if (!Array.isArray(updates) || updates.length === 0 || updates.length > 5000) {
    return { success: false, error: GENERIC_SUBMIT_ERROR };
  }

  /* Selectable only: a retired code exists so history still renders, never to be chosen again. */
  const validCodes = new Set(SELECTABLE_DS_CODES.map((c) => c.code));
  const cleaned: LineUpdate[] = [];
  /* The old row-at-a-time loop updated the first copy of a repeated (po, line)
     and then silently no-opped on the rest, because the first update had already
     flipped workflow_state to 'Submitted'. The set-based UPDATE below has no such
     ordering, so keep first-wins explicit here. Validation still runs over EVERY
     entry, so a bad code in a duplicate still rejects the whole submission. */
  const seenLines = new Set<string>();

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

    const po_number = String(u?.po_number ?? '').slice(0, 100);
    const po_line = String(u?.po_line ?? '').slice(0, 100);
    const key = `${po_number}\u0000${po_line}`;
    if (seenLines.has(key)) continue;
    seenLines.add(key);

    cleaned.push({
      po_number,
      po_line,
      delivery_status_code: code,
      new_delivery_date: date,
      supplier_comments: comments,
    });
  }

  /* `responded_at` must exist before the UPDATE below writes it. Memoised, and
     deliberately outside the transaction (DDL on a second connection would block
     on the transaction's row locks). */
  try {
    await ensurePoExpeditingSchema();
  } catch (err) {
    log.error('submit.schema_check_failed', err);
    return { success: false, error: GENERIC_SUBMIT_ERROR };
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
      [token],
    );

    if (open.rowCount === 0) {
      await client.query('ROLLBACK');
      return {
        success: false,
        expired: true,
        error: 'This link has already been used. Please contact your NESR buyer for changes.',
      };
    }

    /* One statement for the whole submission instead of an UPDATE + an INSERT per
       line: over the tunnelled database each round trip cost more than the work.
       Every guard the loop applied is still applied, now as a join condition —
       the update is scoped to this token AND to rows that are still open, so a
       stale or already-submitted line can never be rewritten, and a line the
       token does not own matches nothing and is skipped exactly as before.
       The audit rows are written from the UPDATE's own RETURNING, so only lines
       that really changed are logged, in payload order. */
    await client.query(
      `WITH v AS (
         SELECT * FROM unnest($2::text[], $3::text[], $4::text[], $5::date[], $6::text[])
                WITH ORDINALITY AS t(po, line, code, dt, cmt, ord)
       ), updated AS (
         UPDATE active_expediting ae SET
           current_status     = v.code,
           new_delivery_date  = v.dt,
           supplier_comments  = v.cmt,
           workflow_state     = 'Submitted',
           /* The ONLY writer of responded_at. The response-time charts and the
              "Last Response" columns read it instead of updated_at, which
              saveBuyerComment also bumps — a buyer note used to make the
              supplier's response time look better than it was. */
           responded_at       = NOW(),
           updated_at         = NOW()
         FROM v
         WHERE ae.expedite_token = $1
           AND ae.po_number      = v.po
           AND ae.po_line        = v.line
           AND ae.workflow_state <> 'Submitted'
         RETURNING ae.id, v.code, v.dt, v.cmt, v.ord
       )
       INSERT INTO expediting_audit_log
         (active_expediting_id, status_submitted, new_delivery_date, comments, submitted_by, submitted_at)
       SELECT u.id, u.code, u.dt, u.cmt, 'Supplier', NOW()
         FROM updated u
        ORDER BY u.ord`,
      [
        token,
        cleaned.map((u) => u.po_number),
        cleaned.map((u) => u.po_line),
        cleaned.map((u) => u.delivery_status_code),
        cleaned.map((u) => u.new_delivery_date || null),
        cleaned.map((u) => u.supplier_comments || null),
      ],
    );

    /* ── Update expediting_sessions response stats ── */
    const sessionRefResult = await client.query<{ session_ref: string }>(
      `SELECT session_ref FROM active_expediting
       WHERE expedite_token = $1 AND session_ref IS NOT NULL
       LIMIT 1`,
      [token],
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
        [sessionRef],
      );
    }

    await client.query('COMMIT');
    return { success: true };
  } catch (err) {
    await client.query('ROLLBACK');
    /* Real cause stays server-side; the supplier only sees a generic message. */
    log.error('submit.failed', err);
    return { success: false, error: GENERIC_SUBMIT_ERROR };
  } finally {
    client.release();
  }
}
