-- How a cycle line's PR was linked.
--
-- NULL: by a buyer, or confirmed by one (or before this column existed). Otherwise by RRSM on
-- its own from SAP, once a PO named the vendor (see autoPrFor in src/lib/rrsm/sap.ts):
--   'exact'  the one PR worth the line's value: taken as sure;
--   'near'   the one PR within 1 % of it: a buyer checks it;
--   'only'   the vendor's only PR in the cycle window: a buyer checks it.
-- Linking a PR by hand, or confirming an automatic one, clears it.
ALTER TABLE rrsm_cycle_lines ADD COLUMN IF NOT EXISTS pr_link_source TEXT
  CHECK (pr_link_source IS NULL OR pr_link_source IN ('exact', 'near', 'only'));
