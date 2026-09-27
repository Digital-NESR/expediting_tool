-- Parsed invoice lines from a supplier's returned statement.
--
-- Until now a statement was bytes: stored, downloadable, and completely opaque. A champion could
-- see that something arrived but not what was in it, the invoice count was whatever they typed by
-- hand, and the consolidated file for AP had to be rebuilt from the attachments one workbook at a
-- time. The lines are parsed on upload and kept here, so the review screen, the invoice count and
-- the AP consolidation all read the same rows.
--
-- The original file is still kept in soa_submissions. Parsed rows are an interpretation; the
-- document is the evidence, and the first audit question is "show me the statement".
CREATE TABLE IF NOT EXISTS soa_submission_lines (
  id             SERIAL PRIMARY KEY,
  submission_id  INTEGER NOT NULL REFERENCES soa_submissions(id) ON DELETE CASCADE,
  line_no        INTEGER NOT NULL,

  -- Stamped by us, not typed by the supplier: we know who returned the file, so asking them to
  -- repeat their own name and number on every row only creates a way for it to disagree.
  vendor_no      TEXT NOT NULL,
  vendor_name    TEXT NOT NULL,
  country_id     TEXT REFERENCES countries(id),
  month_year     TEXT,

  -- As supplied. Amounts are NUMERIC and dates DATE where they parsed cleanly; the raw cell is
  -- kept alongside whenever it did not, so a champion reviewing a rejected row can see what the
  -- supplier actually wrote rather than a silent null.
  legal_entity       TEXT,
  invoice_number     TEXT,
  invoice_date       DATE,
  invoice_date_raw   TEXT,
  po_number          TEXT,
  service_type       TEXT,
  currency           TEXT,
  tax_amount         NUMERIC(18, 2),
  total_amount       NUMERIC(18, 2),
  outstanding_amount NUMERIC(18, 2),
  outstanding_days   INTEGER,
  remarks            TEXT,

  -- Problems found while parsing this row, e.g. an unreadable date or a missing invoice number.
  -- Empty means the row parsed cleanly. A row is never dropped for being wrong.
  issues         TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, line_no)
);

CREATE INDEX IF NOT EXISTS soa_submission_lines_submission ON soa_submission_lines (submission_id);
CREATE INDEX IF NOT EXISTS soa_submission_lines_vendor ON soa_submission_lines (vendor_no);

-- How the parse went, so a champion sees "24 of 26 rows read" rather than a number with no
-- provenance. Null on rows predating this, which is different from zero.
ALTER TABLE soa_submissions ADD COLUMN IF NOT EXISTS parsed_line_count INTEGER;
ALTER TABLE soa_submissions ADD COLUMN IF NOT EXISTS parse_error TEXT;
