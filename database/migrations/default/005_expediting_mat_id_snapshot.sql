-- The SAP material number joins the dispatch-time snapshot.
--
-- WHAT WENT WRONG. `001_baseline` snapshotted country, p_group, item_description, open_qty,
-- open_po_value_usd and delivery_date onto active_expediting, precisely so a line would still
-- read correctly after its PO left `sap_open_po_master` — which that table does nightly, keeping
-- only POs that are still open. `sap_mat_id` was left out. So every analytics drill-down reads it
-- as `s.sap_mat_id` off the LEFT JOIN, and the moment a PO is goods-received the material number
-- becomes a dash, even on lines whose description, quantity and value survive.
--
-- The count today: 5,337 lines carry a full snapshot but a blank material number because their
-- PO has since closed. A further 7,456 predate the snapshot entirely and are blank in every
-- column; nothing can be done for those, and the screens now say so rather than showing a row
-- of dashes that reads as a rendering fault.
--
-- WHY A BACKFILL, AND WHY IT IS PARTIAL. The 6,319 lines whose PO is still open can be filled
-- from the master right now, and that is the whole point: it protects them for the day their PO
-- closes. The 5,337 already-closed lines cannot be recovered — the master no longer holds them,
-- and neither does `open_po_report_shipwaves_db`, which is also a current-open snapshot. Their
-- material numbers are gone. This migration makes the problem stop growing and repairs what is
-- still repairable; it does not pretend to repair the rest.
--
-- The join is `COALESCE(s.po_line, '') = ae.po_line`, matching what dispatch itself joins on in
-- expediteDispatch.ts. Neither side carries a NULL or blank po_line today, so it is identical to
-- the bare form, but the bare form is the one that would silently stop matching if that changed.

ALTER TABLE active_expediting ADD COLUMN IF NOT EXISTS sap_mat_id TEXT;

UPDATE active_expediting ae
   SET sap_mat_id = s.sap_mat_id
  FROM sap_open_po_master s
 WHERE s.po_number = ae.po_number
   AND COALESCE(s.po_line, '') = ae.po_line
   AND ae.sap_mat_id IS NULL
   AND s.sap_mat_id IS NOT NULL
   AND TRIM(s.sap_mat_id) <> '';
