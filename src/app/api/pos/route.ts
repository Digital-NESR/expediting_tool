import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const result = await pool.query(
      `SELECT
        po_number           AS "PO Number",
        po_line             AS "PO Line",
        supplier_name       AS "Supplier Name",
        supplier_id         AS "Supplier ID",
        buyer_name          AS "Buyer Name",
        item_description    AS "Item Description",
        sap_mat_id          AS "SAP MAT ID",
        open_qty            AS "Open QTY",
        open_po_value_usd   AS "Open PO Value USD",
        delivery_date       AS "Delivery Date",
        delivery_code       AS "Delivery Code",
        country             AS "Country",
        delivery_comments   AS "Delivery Comments"
       FROM sap_open_po_master
       ORDER BY delivery_date ASC`
    );
    return Response.json({ data: result.rows });
  } catch (error) {
    console.error('[/api/pos] Database query failed:', error);
    return Response.json(
      { error: 'Failed to fetch purchase orders.' },
      { status: 500 }
    );
  }
}
