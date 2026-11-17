-- Remember that the reference data has already been seeded.
--
-- WHY. `ensureCatalogSeedData` runs on `loadCatalogActor`, which every Catalog Repo page and
-- every server action awaits, and it re-upserted the whole master-data set -- currencies,
-- countries, units, the spend taxonomy, the default threshold -- on every cold instance. Seven
-- round trips to write rows that were already exactly right, paid by whoever happened to load
-- the first page on a new instance.
--
-- A count-based check ("does `country` have rows?") would skip the work but would also stop a
-- changed constant from ever reaching the database, because the counts do not move when a
-- country is renamed or a rate corrected. A fingerprint of the constants themselves skips the
-- work when nothing has changed AND re-runs it the moment anything does -- a rename, a new
-- country, an added unit -- which the old code only achieved by doing it every single time.
--
-- Keyed rather than single-row so the supplier-directory copy, which has its own cheap guard
-- today, can move behind the same mechanism later without another migration.

CREATE TABLE IF NOT EXISTS seed_state (
  key         TEXT PRIMARY KEY,
  fingerprint TEXT        NOT NULL,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
