import pool from '@/lib/db';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    const status = session?.user?.accessStatus;

    let result;

    if (status === 'admin') {
      // Admin sees all POs
      result = await pool.query(
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
          po_release_date     AS "PO Release Date",
          delivery_comments   AS "Delivery Comments",
          buyer_email         AS "Buyer Email",
          p_group             AS "P Group",
          segment             AS "Segment",
          account_classification_description AS "Account Classification Description"
         FROM sap_open_po_master
         ORDER BY delivery_date ASC`
      );
    } else if (status === 'approved' && session?.user?.approvedCountries?.length) {
      // Approved users see only POs from their approved countries
      result = await pool.query(
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
          po_release_date     AS "PO Release Date",
          delivery_comments   AS "Delivery Comments",
          buyer_email         AS "Buyer Email",
          p_group             AS "P Group",
          segment             AS "Segment",
          account_classification_description AS "Account Classification Description"
         FROM sap_open_po_master
         WHERE country = ANY($1)
         ORDER BY delivery_date ASC`,
        [session.user.approvedCountries]
      );
    } else {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    return Response.json({ data: result.rows });
  } catch (error) {
    console.error('[/api/pos] Database query failed:', error);
    return Response.json(
      { error: 'Failed to fetch purchase orders.' },
      { status: 500 }
    );
  }
}
