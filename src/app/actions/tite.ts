'use server';

import titePool from '@/lib/db-tite';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Shipment, ShipmentStats } from '@/types/tite';

export interface CreateShipmentInput {
  movement_type: 'Temporary Import' | 'Temporary Export';
  segment?: string;
  description?: string;
  from_country?: string;
  to_country?: string;
  mot?: string;
  invoice_number?: string;
  invoice_value?: number;
  bayan_number?: string;
  awb_number?: string;
  po_number?: string;
  import_date?: string;
  expiry_date?: string;
  extended_date?: string;
  deposit_local?: number;
  deposit_usd?: number;
  comments?: string;
  status: 'Active' | 'Closed';
  contacts?: Array<{ name: string; email: string; role: string }>;
}

function calcAlertLevel(
  expiryDate: string | undefined,
  extendedDate: string | undefined,
  status: string,
): string {
  if (status === 'Closed') return 'closed';
  const effective = extendedDate || expiryDate;
  if (!effective) return 'info';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil(
    (new Date(effective).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days < 0)   return 'overdue';
  if (days <= 7)  return 'urgent';
  if (days <= 14) return 'action';
  if (days <= 30) return 'plan';
  if (days <= 60) return 'info';
  return 'ok';
}

const SELECT_COLS = `
  id, reference_number, segment, from_country, to_country,
  invoice_number, invoice_value, bayan_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_local, deposit_usd, comments, status, alert_level,
  created_by
`;

export async function getAllShipments(): Promise<Shipment[] | null> {
  try {
    const { rows } = await titePool.query<Shipment>(`
      SELECT ${SELECT_COLS}
      FROM shipments
      ORDER BY
        CASE alert_level
          WHEN 'overdue' THEN 1
          WHEN 'urgent'  THEN 2
          WHEN 'action'  THEN 3
          WHEN 'plan'    THEN 4
          WHEN 'info'    THEN 5
          WHEN 'ok'      THEN 6
          WHEN 'closed'  THEN 7
          ELSE 8
        END,
        COALESCE(extended_date, expiry_date) ASC NULLS LAST
    `);
    console.log(`[TI-TE] getAllShipments: ${rows.length} rows returned`);
    return rows;
  } catch (err) {
    console.error('[TI-TE] getAllShipments error:', err);
    return null;
  }
}

export async function getShipmentById(id: number): Promise<Shipment | null> {
  try {
    const { rows } = await titePool.query<Shipment>(
      `SELECT ${SELECT_COLS} FROM shipments WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  } catch (err) {
    console.error('[TI-TE] getShipmentById error:', err);
    return null;
  }
}

export async function createShipment(
  input: CreateShipmentInput,
): Promise<{ id: number } | null> {
  try {
    const session = await getServerSession(authOptions);
    const createdBy = session?.user?.name ?? null;

    const alert_level = calcAlertLevel(input.expiry_date, input.extended_date, input.status);

    /* ── Generate reference number ── */
    const { rows: countRows } = await titePool.query<{ next_num: string }>(
      `SELECT LPAD((COUNT(*) + 1)::text, 4, '0') AS next_num FROM shipments`,
    );
    const reference_number = `TI-${countRows[0].next_num}`;

    /* ── Insert shipment ── */
    const { rows } = await titePool.query<{ id: number }>(
      `INSERT INTO shipments (
        reference_number, segment, from_country, to_country,
        invoice_number, invoice_value, bayan_number, description,
        mot, awb_number, po_number, movement_type,
        import_date, expiry_date, extended_date,
        deposit_local, deposit_usd, comments, status, alert_level, created_by
      ) VALUES (
        $1,$2,$3,$4,
        $5,$6,$7,$8,
        $9,$10,$11,$12,
        $13,$14,$15,
        $16,$17,$18,$19,$20,$21
      ) RETURNING id`,
      [
        reference_number,
        input.segment       ?? null,
        input.from_country  ?? null,
        input.to_country    ?? null,
        input.invoice_number ?? null,
        input.invoice_value  ?? null,
        input.bayan_number  ?? null,
        input.description   ?? null,
        input.mot           ?? null,
        input.awb_number    ?? null,
        input.po_number     ?? null,
        input.movement_type,
        input.import_date   ?? null,
        input.expiry_date   ?? null,
        input.extended_date ?? null,
        input.deposit_local ?? null,
        input.deposit_usd   ?? null,
        input.comments      ?? null,
        input.status,
        alert_level,
        createdBy,
      ],
    );
    const shipmentId = rows[0].id;

    /* ── Notification contacts (non-critical) ── */
    if (input.contacts && input.contacts.length > 0) {
      try {
        for (const c of input.contacts) {
          if (!c.name && !c.email) continue;
          await titePool.query(
            `INSERT INTO shipment_notification_contacts (shipment_id, name, email, role)
             VALUES ($1, $2, $3, $4)`,
            [shipmentId, c.name || null, c.email || null, c.role || null],
          );
        }
      } catch (contactErr) {
        console.warn('[TI-TE] createShipment: could not insert contacts:', contactErr);
      }
    }

    /* ── Activity log (non-critical) ── */
    try {
      await titePool.query(
        `INSERT INTO shipment_activity_log (shipment_id, action, details, performed_by)
         VALUES ($1, 'created', 'Shipment created via portal', $2)`,
        [shipmentId, createdBy],
      );
    } catch (logErr) {
      console.warn('[TI-TE] createShipment: could not insert activity log:', logErr);
    }

    return { id: shipmentId };
  } catch (err) {
    console.error('[TI-TE] createShipment error:', err);
    return null;
  }
}

export async function getShipmentStats(): Promise<ShipmentStats | null> {
  try {
    const { rows } = await titePool.query(`
      SELECT
        COUNT(*)                    FILTER (WHERE status != 'Closed')                               AS active_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'overdue')                          AS overdue_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'urgent')                           AS urgent_count,
        COUNT(*)                    FILTER (WHERE alert_level IN ('action','plan'))                 AS action_count,
        COALESCE(SUM(deposit_local) FILTER (WHERE status != 'Closed'), 0)                          AS total_deposit_local,
        COALESCE(SUM(deposit_usd)   FILTER (WHERE status != 'Closed'), 0)                          AS total_deposit_usd,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%import%' AND status != 'Closed') AS import_count,
        COUNT(*)                    FILTER (WHERE movement_type ILIKE '%export%' AND status != 'Closed') AS export_count
      FROM shipments
    `);
    const r = rows[0];
    return {
      active_count:      Number(r.active_count),
      overdue_count:     Number(r.overdue_count),
      urgent_count:      Number(r.urgent_count),
      action_count:      Number(r.action_count),
      total_deposit_local: Number(r.total_deposit_local),
      total_deposit_usd: Number(r.total_deposit_usd),
      import_count:      Number(r.import_count),
      export_count:      Number(r.export_count),
    };
  } catch (err) {
    console.error('[TI-TE] getShipmentStats error:', err);
    return null;
  }
}
