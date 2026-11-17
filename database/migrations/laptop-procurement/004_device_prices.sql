-- ============================================================================
-- What a device costs, per country, in USD — the figure the SAP WIP carries.
--
-- Until now this was a constant in the code (PLACEHOLDER_UNIT_PRICE_USD = 100),
-- which meant every model in every country filed against SAP at a hundred
-- dollars. This table replaces it so an admin maintains the real figures on the
-- Devices tab instead of the number living in a deploy.
--
-- Keyed on (model, country) rather than on the catalogue's id: the WIP is built
-- from `requested_model`, free text copied onto the request at the IT Manager's
-- Procure New step, and that text outlives any catalogue row someone later
-- renames or deletes. A price that disappeared because the catalogue was tidied
-- would be found only when a WIP refused weeks afterwards.
--
-- NUMERIC, not a float: this is money, and it is read back and sent onward
-- verbatim. CHECK (> 0) because zero is not a price — `buildWipPayload` already
-- treats zero as missing, since a WIP reading $0 claims the device was free, so
-- the table refuses to hold one in the first place.
--
-- No row for a (model, country) means "not priced yet", which is deliberately
-- distinct from zero: the WIP refuses and says `missing: total value (USD)`,
-- and the request screen shows why. Country 'Other' and the exceptional model
-- are expected to stay unpriced — see fixedUnitPriceUsd.
-- ============================================================================

CREATE TABLE IF NOT EXISTS laptop_device_prices (
  id             SERIAL PRIMARY KEY,
  model          TEXT NOT NULL,
  country        TEXT NOT NULL,
  unit_price_usd NUMERIC(12, 2) NOT NULL CHECK (unit_price_usd > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by     TEXT
);

-- Case- and whitespace-insensitive, matching how every other lookup in this
-- schema compares a country (see getActiveApproverMatrixForCountry). "HQ Dubai"
-- and "hq dubai " are the same cell, and the unique index is what the upsert
-- infers its conflict target from.
CREATE UNIQUE INDEX IF NOT EXISTS idx_laptop_device_prices_model_country
  ON laptop_device_prices (LOWER(TRIM(model)), LOWER(TRIM(country)));

-- "What does this model cost everywhere?" is how the admin screen reads it:
-- one model selected, all countries listed beneath.
CREATE INDEX IF NOT EXISTS idx_laptop_device_prices_model
  ON laptop_device_prices (LOWER(TRIM(model)));
