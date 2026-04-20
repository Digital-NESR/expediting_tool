'use server';

import pool from '@/lib/db';

/* ─── Types ──────────────────────────────────────────────── */

export interface ExpediteLineRow {
  po_number: string;
  po_line: string;
  current_status: string | null;
  new_delivery_date: string | null;
  supplier_comments: string | null;
  item_description: string | null;
  sap_mat_id: string | null;
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

export async function submitSupplierUpdates(
  token: string,
  updates: LineUpdate[]
): Promise<{ success: boolean; error?: string }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const u of updates) {
      /* Get the row id */
      const idResult = await client.query<{ id: number }>(
        `SELECT id FROM active_expediting
         WHERE expedite_token = $1 AND po_number = $2 AND po_line = $3`,
        [token, u.po_number, u.po_line]
      );

      if (idResult.rows.length === 0) continue;
      const activeExpId = idResult.rows[0].id;

      /* Update active_expediting — sets workflow_state = 'Submitted' (expires the link) */
      await client.query(
        `UPDATE active_expediting SET
           current_status     = $1,
           new_delivery_date  = $2,
           supplier_comments  = $3,
           workflow_state     = 'Submitted',
           updated_at         = NOW()
         WHERE id = $4`,
        [
          u.delivery_status_code,
          u.new_delivery_date || null,
          u.supplier_comments || null,
          activeExpId,
        ]
      );

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
    console.error('[submitSupplierUpdates]', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    client.release();
  }
}
