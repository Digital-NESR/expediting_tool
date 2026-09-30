-- One-time codes for the supplier upload page.
--
-- The upload link identifies a vendor; it does not prove who is holding it. Anyone the letter was
-- forwarded to has the same URL, so before a file is accepted the uploader proves they can read
-- one of the addresses the letter actually went to: they pick an address from a masked list, a
-- code goes to it, and only that code opens the upload.
--
-- The code is never stored. A row holds its SHA-256, so a reader of this table cannot use what
-- they find, and verification hashes the attempt and compares digests.
--
-- Everything that makes a six-digit code safe over a two-minute window is a column here:
--   attempts    a cap, because 1,000,000 possibilities fall quickly to an unlimited guesser
--   expires_at  short, and checked server-side rather than trusted from a countdown on the page
--   consumed_at single use, so a code read over someone's shoulder is spent
-- Rate limiting on issuing sits on created_at: without it the page is a way to send somebody
-- else's inbox an unbounded number of emails.
CREATE TABLE IF NOT EXISTS soa_upload_codes (
  id            SERIAL PRIMARY KEY,
  entry_id      INTEGER NOT NULL REFERENCES vendor_cycle_entries(id) ON DELETE CASCADE,

  -- Which of the vendor's addresses it went to. Stored so the eventual upload can be attributed
  -- to a person rather than to "someone with the link".
  email         TEXT NOT NULL,

  code_hash     TEXT NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  consumed_at   TIMESTAMPTZ,

  -- Set when the code is accepted. The browser holds this, not the code, so a verified session
  -- outlives the two-minute window without keeping the code alive.
  session_token      UUID,
  session_expires_at TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS soa_upload_codes_entry ON soa_upload_codes (entry_id, created_at DESC);

-- Looked up on every authenticated request from the upload page, so it is worth an index of its
-- own; partial, because the great majority of rows never become a session.
CREATE UNIQUE INDEX IF NOT EXISTS soa_upload_codes_session
  ON soa_upload_codes (session_token) WHERE session_token IS NOT NULL;
