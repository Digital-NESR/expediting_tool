-- RRSM 011: which validation steps a country's monthly cycle runs.
--
-- Some countries do not need the supplier to confirm their month, some do not need Ops to
-- validate it, and some need neither and go straight to amending the PO (user, 19 Nov 2026). An
-- RRSM admin sets this per country in Admin -> RRSM. Both on by default, which is how every
-- country has worked so far.

ALTER TABLE rrsm_countries
  ADD COLUMN IF NOT EXISTS supplier_validation BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS ops_validation      BOOLEAN NOT NULL DEFAULT TRUE;
