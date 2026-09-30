-- A per-vendor upload link.
--
-- The letter now tells a supplier to upload their statement rather than mail it back, so every
-- vendor in a cycle needs its own address to be sent to. One per vendor per cycle, not one per
-- vendor: a link handed out for Q3 should not open Q4, and revoking one cycle's links must not
-- touch another's.
--
-- gen_random_uuid() is core in Postgres 13+ and needs no extension, which matters here because
-- this server does not allow-list any (pg_trgm and fuzzystrmatch were both refused).
--
-- The token identifies which vendor is uploading. It does NOT authenticate them -- anyone who can
-- read the letter can read the link, and a forwarded email would hand it to somebody else. Proving
-- the uploader holds one of the addresses the letter went to is the job of the one-time code, and
-- that check lives in the upload route, not here.
ALTER TABLE vendor_cycle_entries
  ADD COLUMN IF NOT EXISTS upload_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS vendor_cycle_entries_upload_token
  ON vendor_cycle_entries (upload_token);
