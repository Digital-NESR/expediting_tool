/* ─── The column lists each read projects, kept together so a new column is added in one place
   rather than three, and the tool's logger. ─── */

import { logger } from '@/lib/logger';

export const log = logger('ti-te');

/* ─── SELECT columns ──────────────────────────────────────────── */

export const SELECT_COLS = `
  id, reference_number, segment, from_country, to_country,
  invoice_number, invoice_value_usd, customs_reference_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_usd, comments, customs_docs_location, status, alert_level,
  country, created_by,
  created_at::text AS created_at
`;

/* ─── getShipmentsForList ─────────────────────────────────────── */

/* Twenty columns instead of twenty-four, for the shipment register. The
   register filters and paginates in the browser, so every row it is sent is
   serialised into the page payload — and it reads none of invoice_value_usd,
   comments, customs_docs_location or created_at. Ordering and the alert_level
   recalculation are deliberately identical to getAllShipments: the table
   renders rows in the order they arrive. */
export const LIST_COLS = `
  id, reference_number, segment, from_country, to_country,
  invoice_number, customs_reference_number, description,
  mot, awb_number, po_number, movement_type,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  deposit_usd, status, alert_level,
  country, created_by
`;

/* ─── getShipmentsForAnalytics ────────────────────────────────── */

/* Fourteen columns instead of twenty-four. The admin analytics panel does all
   of its filtering client-side, so every row it gets is serialised into the
   page payload — and it reads none of description, comments, invoice_number,
   invoice_value_usd, mot, awb_number, po_number, customs_docs_location or
   from/to_country. Ordering and the alert_level recalculation below are
   deliberately identical to getAllShipments: the report tables render rows in
   the order they arrive. */
export const ANALYTICS_COLS = `
  id, reference_number, customs_reference_number, segment, movement_type,
  deposit_usd, status, alert_level, country, created_by,
  import_date::text   AS import_date,
  expiry_date::text   AS expiry_date,
  extended_date::text AS extended_date,
  created_at::text    AS created_at
`;
