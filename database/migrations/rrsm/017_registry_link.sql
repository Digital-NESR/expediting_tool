-- RRSM's rows hang off the shared Service Registry (Catalog Manager's catalog_entry).
--
-- A rental register line is a UNIT of a registry item (its plate, cost center, segment and hire
-- dates stay here); a recurrent service is the RRSM side of one registry item (its expiry,
-- requesters, PO and renewals stay here). `registry_code` is the item's CAT-nnnn code. It is not a
-- foreign key: the registry lives in another database. NULL until the line is linked.

ALTER TABLE rrsm_service_lines      ADD COLUMN IF NOT EXISTS registry_code TEXT;
ALTER TABLE rrsm_recurrent_services ADD COLUMN IF NOT EXISTS registry_code TEXT;

CREATE INDEX IF NOT EXISTS rrsm_service_lines_registry
  ON rrsm_service_lines (registry_code) WHERE registry_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS rrsm_recurrent_services_registry
  ON rrsm_recurrent_services (registry_code) WHERE registry_code IS NOT NULL;
