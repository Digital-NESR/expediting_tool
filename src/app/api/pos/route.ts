import pool from '@/lib/db';
import { getPoExpeditingAccess } from '@/lib/po-access';

export const dynamic = 'force-dynamic';

/**
 * Access is read from the access row, not from the session cookie.
 *
 * It used to come from `session.user.toolAccess.po_expediting`, which is resolved once into the
 * JWT and can only be refreshed by the browser. So a user approved a minute ago got an empty
 * dashboard from here even after the page let them in, and nothing distinguished that from
 * genuinely having no POs. Same lookup the layout gate uses, memoised per request, so the two
 * cannot disagree about who is approved for what.
 */
export async function GET() {
  try {
    const access = await getPoExpeditingAccess();

    let result;

    if (access.isAdmin) {
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
         ORDER BY delivery_date ASC`,
      );
    } else if (access.approved && access.approvedCountries.length) {
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
        [access.approvedCountries],
      );
    } else {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    return Response.json({ data: result.rows });
  } catch (error) {
    console.error('[/api/pos] Database query failed:', error);
    return Response.json({ error: 'Failed to fetch purchase orders.' }, { status: 500 });
  }
}
