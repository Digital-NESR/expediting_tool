-- RRSM 018: the supplier's Invoice, a third monthly document beside the Delivery Note and the
-- Timesheet (user decision, 24 Nov 2026). It works exactly like the other two (008, 009):
--
--   rrsm_suppliers.requires_invoice        the supplier's remembered default, TRUE like the others
--   rrsm_supplier_links.requires_invoice   what this cycle's invitation asks for, FALSE until a
--                                           buyer sends (or re-sends) it, so a link already out does
--                                           not start owing a document nobody asked for
--   rrsm_submission_documents.kind         now also 'invoice'; one per link, re-upload replaces it

ALTER TABLE rrsm_suppliers
  ADD COLUMN IF NOT EXISTS requires_invoice BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE rrsm_supplier_links
  ADD COLUMN IF NOT EXISTS requires_invoice BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE rrsm_submission_documents
  DROP CONSTRAINT IF EXISTS rrsm_submission_documents_kind_check;
ALTER TABLE rrsm_submission_documents
  ADD CONSTRAINT rrsm_submission_documents_kind_check
  CHECK (kind IN ('delivery_note', 'timesheet', 'invoice'));
