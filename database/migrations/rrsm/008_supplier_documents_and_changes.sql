-- RRSM 008: supplier documents and supplier-proposed rates.
--
-- Two things a supplier now does on their submission page, and what the buyer chooses about them.
--
-- 1. DOCUMENTS. A Delivery Note and a Timesheet, one of each per supplier per month (per link).
--    Which of them are mandatory is the buyer's choice when sending that invitation, so it lives on
--    the link, not on the supplier: the same supplier may owe a timesheet one month and not the
--    next. The files themselves are stored in the row as BYTEA, the pattern SOA and Catalog Manager
--    already use; there is no blob store. One row per (link, kind): uploading again replaces it.
--
-- 2. RATE AND PRICING UNIT. The supplier sees the line's rate, pricing unit and cost and may
--    propose others. The proposal is kept beside the agreed values rather than written over them,
--    because it is a claim until a buyer accepts it:
--      supplier_rate / supplier_uom   what the supplier proposed (NULL = no change proposed)
--      change_status                  pending until a buyer decides; Ops cannot validate a line
--                                     while it is pending
--      uom                            this month's pricing unit when a buyer accepted a different
--                                     one; NULL means the register's
--    Accepting sets this month's `rate` (and `uom`). Updating the register as well is a separate
--    choice the buyer makes at the same moment, and is logged in rrsm_register_log.

ALTER TABLE rrsm_supplier_links
  ADD COLUMN IF NOT EXISTS requires_delivery_note BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS requires_timesheet     BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS rrsm_submission_documents (
  id           SERIAL PRIMARY KEY,
  link_id      INTEGER NOT NULL REFERENCES rrsm_supplier_links(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('delivery_note', 'timesheet')),
  file_name    TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes   INTEGER NOT NULL CHECK (size_bytes > 0),
  content      BYTEA NOT NULL,
  uploaded_by  TEXT NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (link_id, kind)
);

ALTER TABLE rrsm_cycle_lines
  ADD COLUMN IF NOT EXISTS uom               TEXT REFERENCES rrsm_uoms(code),
  ADD COLUMN IF NOT EXISTS supplier_rate     NUMERIC(14, 3),
  ADD COLUMN IF NOT EXISTS supplier_uom      TEXT REFERENCES rrsm_uoms(code),
  ADD COLUMN IF NOT EXISTS change_status     TEXT
                           CHECK (change_status IN ('pending', 'accepted', 'rejected')),
  ADD COLUMN IF NOT EXISTS change_decided_by TEXT,
  ADD COLUMN IF NOT EXISTS change_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS change_note       TEXT;

CREATE INDEX IF NOT EXISTS rrsm_cycle_lines_change_pending
  ON rrsm_cycle_lines (cycle_id) WHERE change_status = 'pending';
