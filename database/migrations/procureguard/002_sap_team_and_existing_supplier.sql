-- Two changes to the adhoc flow: a SAP Team verification step, and adhoc requests raised
-- against a supplier who already exists in SAP but is centrally blocked.

-- ── 1. The SAP Team verification step ───────────────────────────────────────────────────────
--
-- The adhoc chain was Submitted -> Approved by SCM -> Approved, where the final step is the
-- Supply Chain Director's. SAP Team verification goes between those two, so the Director signs
-- off on something SAP has already confirmed is set up correctly.
--
-- `ADD VALUE` inside a transaction is allowed from Postgres 12 and this server is 18.6, with one
-- condition: the new label must not be USED in the same transaction that adds it. Nothing below
-- writes a row carrying it, so the migration runner's BEGIN/COMMIT is safe here. A later
-- migration that wanted to backfill rows to this status would need its own.
ALTER TYPE procure_guard_status ADD VALUE IF NOT EXISTS 'Verified by SAP Team' AFTER 'Approved by SCM';


-- ── 2. Which kind of supplier an adhoc request is for ───────────────────────────────────────
--
-- An adhoc request now has two shapes. The original is a supplier with no SAP record at all,
-- identified by a tax registration number. The new one is a supplier who IS in SAP, usually
-- centrally blocked, where a buyer needs a single urgent purchase without unblocking them: there
-- the identifier is the SAP supplier ID and there is no TRN to collect.
--
-- An explicit column rather than inferring the shape from which identifier happens to be filled.
-- The inference would read "vendor_tax_id is empty, so this must be an existing supplier", which
-- is true today and silently wrong the first time somebody saves a request without a TRN for any
-- other reason. It is also what the approval email and the request detail read to decide whether
-- to label the identifier "Vendor Tax ID" or "SAP Supplier ID", and a mislabelled identifier on
-- an approval is exactly the kind of thing nobody notices until it matters.
--
-- Every existing row is `adhoc`: all 121 of them carry a tax id, which is what that shape means.
ALTER TABLE procure_guard_adhoc_payments
  ADD COLUMN IF NOT EXISTS supplier_source TEXT NOT NULL DEFAULT 'adhoc';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'procure_guard_adhoc_payments'::regclass
       AND conname = 'procure_guard_adhoc_supplier_source_check'
  ) THEN
    ALTER TABLE procure_guard_adhoc_payments
      ADD CONSTRAINT procure_guard_adhoc_supplier_source_check
      CHECK (supplier_source IN ('adhoc', 'existing_avl'));
  END IF;
END $$;

COMMENT ON COLUMN procure_guard_adhoc_payments.supplier_source IS
  'adhoc = a supplier with no SAP record, identified by vendor_tax_id. '
  'existing_avl = a supplier already in SAP (usually centrally blocked), identified by '
  'vendor_code holding their SAP supplier ID, with vendor_tax_id left empty.';
