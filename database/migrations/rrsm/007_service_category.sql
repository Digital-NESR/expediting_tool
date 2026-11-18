-- What kind of service a register line is: Equipment Rental, Transportation, Accommodation...
--
-- The UAE team's monthly PO workbook files every PO under a CATEGORY, and it is the first thing
-- anybody filters that workbook by. The register is loaded from it, so the column comes with it.
--
-- Free text rather than a lookup table for now, deliberately. Each country's register is loaded
-- separately and the plan is to standardise across countries later; the UAE sheet alone has
-- "Legal Servcie" and "Nitrogen - NES - UAE" in it. Fixing the vocabulary is that later step,
-- and a table now would force the decision before anyone has seen the other countries' lists.
ALTER TABLE rrsm_service_lines ADD COLUMN IF NOT EXISTS category TEXT;

CREATE INDEX IF NOT EXISTS rrsm_service_lines_category
  ON rrsm_service_lines (country_code, category) WHERE active;
