'use server';

import pool from '@/lib/db';

/* ─── Types ──────────────────────────────────────────────────── */

export interface LineData {
  po_number: string;
  po_line: string;
  item_description: string | null;
  sap_mat_id: string | null;
  account_classification_description: string | null;
  open_qty: number | null;
  open_po_value_usd: number | null;
  delivery_date: string | null;        // original from sap_open_po_master
  current_status: string | null;       // DS code from active_expediting
  new_delivery_date: string | null;    // from active_expediting
  supplier_comments: string | null;
  buyer_comments: string | null;
  workflow_state: string;
}

export interface SupplierGroup {
  supplier_name: string;
  expedite_token: string;
  workflow_state: string;  // 'Submitted' if all lines submitted, else 'Email Sent'
  lines: LineData[];
}

export interface SessionData {
  session_ref: string;
  dispatched_at: string;   // ISO string
  total_suppliers: number;
  total_lines: number;
  responded_lines: number;
  response_rate: number;
  total_emails_sent: number;
  suppliers: SupplierGroup[];
}

/* ─── getMyExpeditingSessions ────────────────────────────────── */

export async function getMyExpeditingSessions(
  userEmail: string,
): Promise<SessionData[]> {
  if (!userEmail) return [];

  try {
    const result = await pool.query(
      `SELECT
         ae.session_ref,
         ae.dispatched_at,
         ae.expedite_token,
         ae.po_number,
         ae.po_line,
         ae.workflow_state,
         ae.current_status,
         ae.new_delivery_date,
         ae.supplier_comments,
         ae.buyer_comments,
         s.item_description,
         s.sap_mat_id,
         s.account_classification_description,
         s.open_qty,
         s.open_po_value_usd,
         s.delivery_date,
         s.supplier_name,
         COALESCE(es.total_emails_sent, 0) AS total_emails_sent
       FROM active_expediting ae
       LEFT JOIN sap_open_po_master s
         ON ae.po_number = s.po_number AND ae.po_line = s.po_line
       LEFT JOIN expediting_sessions es
         ON ae.session_ref = es.session_ref
       WHERE ae.dispatched_by = $1
         AND ae.session_ref IS NOT NULL
       ORDER BY ae.dispatched_at DESC, ae.session_ref, ae.expedite_token,
                ae.po_number, ae.po_line`,
      [userEmail],
    );

    const sessionMap = new Map<string, SessionData>();
    const sessionOrder: string[] = [];

    const toStr = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      if (v instanceof Date) return v.toISOString();
      return String(v);
    };

    for (const row of result.rows) {
      const ref = String(row.session_ref);

      if (!sessionMap.has(ref)) {
        sessionOrder.push(ref);
        sessionMap.set(ref, {
          session_ref: ref,
          dispatched_at: row.dispatched_at instanceof Date
            ? row.dispatched_at.toISOString()
            : String(row.dispatched_at),
          total_suppliers: 0,
          total_lines: 0,
          responded_lines: 0,
          response_rate: 0,
          total_emails_sent: Number(row.total_emails_sent) || 0,
          suppliers: [],
        });
      }

      const session = sessionMap.get(ref)!;
      let supplier = session.suppliers.find(s => s.expedite_token === row.expedite_token);

      if (!supplier) {
        supplier = {
          supplier_name: row.supplier_name ?? 'Unknown Supplier',
          expedite_token: String(row.expedite_token),
          workflow_state: 'Email Sent',
          lines: [],
        };
        session.suppliers.push(supplier);
      }

      supplier.lines.push({
        po_number:          String(row.po_number),
        po_line:            String(row.po_line ?? ''),
        item_description:   toStr(row.item_description),
        sap_mat_id:                        toStr(row.sap_mat_id),
        account_classification_description: toStr(row.account_classification_description),
        open_qty:           row.open_qty != null ? Number(row.open_qty) : null,
        open_po_value_usd:  row.open_po_value_usd != null ? Number(row.open_po_value_usd) : null,
        delivery_date:      toStr(row.delivery_date),
        current_status:     toStr(row.current_status),
        new_delivery_date:  toStr(row.new_delivery_date),
        supplier_comments:  toStr(row.supplier_comments),
        buyer_comments:     toStr(row.buyer_comments),
        workflow_state:     String(row.workflow_state),
      });
    }

    // Compute session-level stats
    for (const ref of sessionOrder) {
      const session = sessionMap.get(ref)!;
      session.total_suppliers = session.suppliers.length;
      session.total_lines = session.suppliers.reduce((s, g) => s + g.lines.length, 0);
      session.responded_lines = session.suppliers.reduce(
        (s, g) => s + g.lines.filter(l => l.workflow_state === 'Submitted').length, 0,
      );
      session.response_rate = session.total_lines > 0
        ? Math.round((session.responded_lines / session.total_lines) * 100)
        : 0;

      for (const sup of session.suppliers) {
        sup.workflow_state = sup.lines.every(l => l.workflow_state === 'Submitted')
          ? 'Submitted'
          : 'Email Sent';
      }
    }

    return sessionOrder.map(ref => sessionMap.get(ref)!);
  } catch (err) {
    console.error('[getMyExpeditingSessions]', err);
    return [];
  }
}

/* ─── saveBuyerComment ───────────────────────────────────────── */

export async function saveBuyerComment(
  po_number: string,
  po_line: string,
  expedite_token: string,
  comment: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await pool.query(
      `UPDATE active_expediting
       SET buyer_comments = $1, updated_at = NOW()
       WHERE po_number = $2 AND po_line = $3 AND expedite_token = $4`,
      [comment.trim() || null, po_number, po_line, expedite_token],
    );
    return { success: true };
  } catch (err) {
    console.error('[saveBuyerComment]', err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}
