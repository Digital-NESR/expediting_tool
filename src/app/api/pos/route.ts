import pool from '@/lib/db';
import { getPoExpeditingAccess } from '@/lib/po-access';

export const dynamic = 'force-dynamic';

/**
 * The dashboard's rows.
 *
 * Written once rather than twice. The admin and the country-scoped reads were byte-identical
 * eighteen-column lists differing only in a WHERE, which is how a column gets added to one of
 * them and not the other.
 *
 * "Last Expedited" is the newest dispatch for THIS po_number and po_line, not for the PO: a PO
 * with ten lines is rarely chased whole, and showing the PO's date against a line nobody has
 * written about would claim work that was never done for it. 5,836 of the 22,031 open lines have
 * one; the rest have never been expedited and say so rather than showing a blank that could mean
 * either.
 */
const SELECT_POS = `
  SELECT
    s.po_number           AS "PO Number",
    s.po_line             AS "PO Line",
    s.supplier_name       AS "Supplier Name",
    s.supplier_id         AS "Supplier ID",
    s.buyer_name          AS "Buyer Name",
    s.item_description    AS "Item Description",
    s.sap_mat_id          AS "SAP MAT ID",
    s.open_qty            AS "Open QTY",
    s.open_po_value_usd   AS "Open PO Value USD",
    s.delivery_date       AS "Delivery Date",
    s.delivery_code       AS "Delivery Code",
    s.country             AS "Country",
    s.po_release_date     AS "PO Release Date",
    s.delivery_comments   AS "Delivery Comments",
    s.buyer_email         AS "Buyer Email",
    s.p_group             AS "P Group",
    s.segment             AS "Segment",
    s.account_classification_description AS "Account Classification Description",
    e.last_expedited      AS "Last Expedited",
    COALESCE(e.times_expedited, 0) AS "Times Expedited"
  FROM sap_open_po_master s
  LEFT JOIN LATERAL (
    SELECT MAX(ae.dispatched_at) AS last_expedited, COUNT(*) AS times_expedited
      FROM active_expediting ae
     WHERE ae.po_number = s.po_number AND ae.po_line = s.po_line
  ) e ON TRUE`;

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
      result = await pool.query(`${SELECT_POS} ORDER BY s.delivery_date ASC`);
    } else if (access.approved && access.approvedCountries.length) {
      // Approved users see only POs from their approved countries
      result = await pool.query(
        `${SELECT_POS} WHERE s.country = ANY($1) ORDER BY s.delivery_date ASC`,
        [access.approvedCountries],
      );
    } else {
      return Response.json({ error: 'Access denied' }, { status: 403 });
    }

    /* When SAP data last landed, which is a different fact from when this request ran. The
       dashboard's own "last updated" is the latter and reads like the former, so a buyer looking
       at a stale report sees a recent time and has no reason to doubt it.

       Scoped the same way the rows are: an approved user sees the freshness of the countries
       they can see, not of a country they cannot. In practice the loader writes them all in one
       pass, so the two are the same timestamp. */
    const freshness = access.isAdmin
      ? await pool.query<{ loaded_at: string | null }>(
          `SELECT MAX(loaded_at) AS loaded_at FROM sap_open_po_master`,
        )
      : await pool.query<{ loaded_at: string | null }>(
          `SELECT MAX(loaded_at) AS loaded_at FROM sap_open_po_master WHERE country = ANY($1)`,
          [access.approvedCountries],
        );

    return Response.json({ data: result.rows, loadedAt: freshness.rows[0]?.loaded_at ?? null });
  } catch (error) {
    console.error('[/api/pos] Database query failed:', error);
    return Response.json({ error: 'Failed to fetch purchase orders.' }, { status: 500 });
  }
}
