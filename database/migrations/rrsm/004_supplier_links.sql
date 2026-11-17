-- The address a supplier is sent to submit a cycle.
--
-- `rrsm_access_codes` already exists and holds the one-time codes; what was missing is the thing
-- the link in the email actually points at. One row per supplier per cycle, carrying a UUID that
-- appears in the URL.
--
-- A token rather than the supplier code in the path, for the reason SOA's `upload_token` exists:
-- a guessable URL would let anyone enumerate suppliers and read what they are being asked to
-- confirm. The token proves nothing about WHO is holding it -- that is what the emailed code is
-- for -- it only says which supplier and which cycle the holder is looking at.
CREATE TABLE IF NOT EXISTS rrsm_supplier_links (
  id            SERIAL PRIMARY KEY,
  cycle_id      INTEGER NOT NULL REFERENCES rrsm_cycles(id) ON DELETE CASCADE,
  supplier_code TEXT NOT NULL REFERENCES rrsm_suppliers(code) ON DELETE CASCADE,

  token         UUID NOT NULL DEFAULT gen_random_uuid(),

  -- When the invitation actually went out, and to how many addresses. Null means the link exists
  -- but nobody has been told about it, which is a different thing from a supplier ignoring it and
  -- the chase screen needs to tell them apart.
  sent_at       TIMESTAMPTZ,
  sent_to       TEXT[] NOT NULL DEFAULT '{}'::TEXT[],

  -- Stamped when the supplier finishes. Their own submission, not Ops' validation: a cycle line
  -- carries the stage, and this carries "this supplier has done their part".
  submitted_at  TIMESTAMPTZ,
  submitted_by  TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cycle_id, supplier_code)
);

-- The lookup on every request from the supplier page, so it gets its own unique index rather
-- than riding the table scan.
CREATE UNIQUE INDEX IF NOT EXISTS rrsm_supplier_links_token ON rrsm_supplier_links (token);

-- Codes are issued and checked against a link, not against a (cycle, supplier) pair pulled from
-- the URL. Adding it here rather than at baseline because the links table did not exist then;
-- nullable so the column can be added to a table that already has rows.
ALTER TABLE rrsm_access_codes
  ADD COLUMN IF NOT EXISTS link_id INTEGER REFERENCES rrsm_supplier_links(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS rrsm_access_codes_link
  ON rrsm_access_codes (link_id, created_at DESC);
