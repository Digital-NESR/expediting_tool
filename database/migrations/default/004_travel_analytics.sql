-- Travel Portal analytics: who may look, at which countries, and what they are allowed to see.
--
-- Two tables, and deliberately not a third.
--
-- The travel data itself lives in `travel_portal`, a feed from the Travel Portal product, marked
-- read-only in the migration manifest: nothing here writes to it.
--
-- WHICH COUNTRY A BOOKING BELONGS TO is not stored here either, because it already exists.
-- `travel_portal.bookings` has no country column; its `costCenter` and `companyCode` do the job
-- through `laptop_procurement_db.laptop_cost_center_departments` and
-- `laptop_cost_center_companies`, which hold the same cost-centre mapping the laptop tool is
-- maintained on and already have an admin editor. Against today's feed that resolves 218 of 219
-- real bookings by cost centre and the last one by company code, with no disagreement between
-- the two routes. A second copy of a 2,335-row mapping would be a second thing to maintain and
-- a guaranteed source of drift, so this one reads the existing tables. The name says "laptop"
-- because that tool needed it first; it is org reference data and worth promoting to a shared
-- name when something else needs it too.

CREATE TABLE IF NOT EXISTS travel_analytics_grants (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  -- `admin` sees every country and may reveal a traveller's identity documents.
  -- `finance` sees spend and basic flight facts. `management` adds the compliance and
  -- optimisation detail. Neither of the latter two sees personal data beyond a traveller name.
  role          TEXT NOT NULL CHECK (role IN ('admin', 'finance', 'management')),
  -- The country this grant covers, spelled as `laptop_cost_center_companies.country` spells it,
  -- or NULL meaning every country. Admin rows are always NULL; a finance or management row may
  -- be either, so a central finance reader is one NULL row rather than one row per country and
  -- taking a country away from them is a separate, visible act.
  country       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    TEXT NOT NULL,
  CONSTRAINT travel_analytics_grants_unique UNIQUE NULLS NOT DISTINCT (email, role, country)
);

CREATE INDEX IF NOT EXISTS idx_travel_grants_email ON travel_analytics_grants (lower(email));


-- Every reveal of a traveller's passport number, date of birth or mobile.
--
-- Written before the values are returned, so the row exists even if the reader closes the tab
-- immediately, and it names the fields rather than just the fact of a look. This is the only
-- table here that exists for a reason other than making the dashboard work.
CREATE TABLE IF NOT EXISTS travel_pii_reveals (
  id              SERIAL PRIMARY KEY,
  actor_email     TEXT NOT NULL,
  booking_code    TEXT NOT NULL,
  traveller_name  TEXT,
  fields          TEXT[] NOT NULL,
  revealed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_pii_reveals_at ON travel_pii_reveals (revealed_at DESC);
