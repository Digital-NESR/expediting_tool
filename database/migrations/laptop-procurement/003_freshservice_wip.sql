-- ============================================================================
-- The SAP WIP raised in Freshservice once a request is fully approved.
--
-- Three columns rather than one, because "no WIP" has three distinct meanings
-- and they need different fixes:
--
--   attempted_at NULL                  -> never tried. The request has not
--                                         reached Procure New, or the
--                                         integration was switched off.
--   attempted_at set, request_id NULL  -> tried and failed. `error` says why,
--                                         and it is worth retrying.
--   request_id set                     -> raised. The number is the one
--                                         Freshservice shows as SR-<id>.
--
-- A single nullable id column could not tell the first two apart, which is the
-- difference between "nobody has done anything yet" and "this one is stuck".
--
-- request_id is what makes the call idempotent: the retry path checks it before
-- posting, so a response lost to a timeout cannot produce a second WIP for the
-- same laptop. That is the realistic failure here — not the call failing, but
-- the call succeeding and the answer never arriving.
--
-- BIGINT because Freshservice ticket ids are account-wide and already in the
-- hundreds of thousands (SR-144437 at the time of writing).
-- ============================================================================

ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS freshservice_request_id   BIGINT;
ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS freshservice_error        TEXT;
ALTER TABLE laptop_requests ADD COLUMN IF NOT EXISTS freshservice_attempted_at TIMESTAMPTZ;

-- "Which approved requests are missing a WIP?" is the question this has to
-- answer quickly, and it is a small slice of the table, so the index carries
-- only the rows that can appear in the answer.
CREATE INDEX IF NOT EXISTS idx_laptop_requests_wip_missing
  ON laptop_requests (status)
  WHERE freshservice_request_id IS NULL;
