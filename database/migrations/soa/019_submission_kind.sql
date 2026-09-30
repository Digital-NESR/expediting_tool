-- A statement does not always arrive as the template.
--
-- Some suppliers reply to the request with the workbook attached to an email, or answer in the
-- body of the mail itself. The champion cannot upload through the supplier's own link, which
-- belongs to whoever can read the vendor's mailbox, so they file the correspondence instead: the
-- saved email, with whatever the supplier sent inside it.
--
-- That is evidence of a reply and counts towards coverage, but nothing in it can be parsed into
-- invoice rows, so the consolidated workbook carries a line pointing AP at the attachment rather
-- than pretending the invoices were read. `kind` is what tells the two apart.
--
-- A CHECK rather than an enum: two values, no ordering, and an enum would cost a second
-- no-transaction migration to add a third later.
ALTER TABLE soa_submissions
  ADD COLUMN IF NOT EXISTS kind VARCHAR(16) NOT NULL DEFAULT 'workbook';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'soa_submissions_kind_check'
  ) THEN
    ALTER TABLE soa_submissions
      ADD CONSTRAINT soa_submissions_kind_check CHECK (kind IN ('workbook', 'email'));
  END IF;
END $$;

COMMENT ON COLUMN soa_submissions.kind IS
  'workbook: parsed into invoice rows. email: correspondence filed as evidence, nothing parsed.';
