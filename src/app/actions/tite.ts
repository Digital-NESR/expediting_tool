'use server';

import titePool from '@/lib/db-tite';
import type { Shipment, ShipmentStats } from '@/types/tite';

const SELECT_COLS = `
  id, reference_number, segment, from_country, to_country,
  invoice_number, invoice_value, bayan_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_sar, deposit_usd, comments, status, alert_level,
  created_at::text AS created_at,
  updated_at::text AS updated_at,
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

export async function getShipmentStats(): Promise<ShipmentStats | null> {
  try {
    const { rows } = await titePool.query(`
      SELECT
        COUNT(*)                    FILTER (WHERE status != 'Closed')                               AS active_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'overdue')                          AS overdue_count,
        COUNT(*)                    FILTER (WHERE alert_level = 'urgent')                           AS urgent_count,
        COUNT(*)                    FILTER (WHERE alert_level IN ('action','plan'))                 AS action_count,
        COALESCE(SUM(deposit_sar)   FILTER (WHERE status != 'Closed'), 0)                          AS total_deposit_sar,
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
      total_deposit_sar: Number(r.total_deposit_sar),
      total_deposit_usd: Number(r.total_deposit_usd),
      import_count:      Number(r.import_count),
      export_count:      Number(r.export_count),
    };
  } catch (err) {
    console.error('[TI-TE] getShipmentStats error:', err);
    return null;
  }
}
