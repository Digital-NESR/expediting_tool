-- The Services catalog becomes the Service Registry, shared with RRSM.
--
-- One registry item per country + supplier + service + rate, owned here. RRSM reads and writes the
-- same rows (its monthly rental units and its annual recurrent services hang off an item by its
-- CAT-nnnn code), so an item added in either tool is in both. Decided with the business owner,
-- 23 Nov 2026.
--
--   registry_type       'rental' or 'recurrent' for items RRSM runs; NULL for a catalog-only item.
--   sap_service_number  the SAP service master number (see service_activity), where known.
--   source              where the item was created: 'catalog' or 'rrsm'.
--   rate_to_confirm     the price is a placeholder (an item needs a price; a recurrent service
--                       brought over without an annual value goes in at 0 and is flagged).

ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS registry_type TEXT
  CHECK (registry_type IS NULL OR registry_type IN ('rental', 'recurrent'));
ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS sap_service_number TEXT;
ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'catalog'
  CHECK (source IN ('catalog', 'rrsm'));
ALTER TABLE catalog_entry ADD COLUMN IF NOT EXISTS rate_to_confirm BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS catalog_entry_registry
  ON catalog_entry (country_code, registry_type) WHERE registry_type IS NOT NULL;

-- Tool-wide settings, keyed. The first: approvals are paused while the registry is being filled
-- (both tools add items without approval); an admin switches them back on in Catalog admin.
CREATE TABLE IF NOT EXISTS catalog_setting (
  key        TEXT PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO catalog_setting (key, value, updated_by)
VALUES ('approvals_enabled', 'false'::jsonb, 'migration 007')
ON CONFLICT (key) DO NOTHING;

-- Recurrent services are priced per year; rentals already have Month.
INSERT INTO unit_of_measure (name, status) VALUES ('Year', 'Active') ON CONFLICT (name) DO NOTHING;
