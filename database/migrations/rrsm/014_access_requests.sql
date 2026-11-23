-- RRSM 014: access requests.
--
-- The RRSM card on the home page is open to everyone; the tool itself stays gated (user decision,
-- 23 Nov 2026). Somebody without a grant asks for BUYER access in a country they choose; an RRSM
-- admin approves or rejects it in Admin -> RRSM -> Access requests. Approving writes the buyer
-- grant to rrsm_users. Requesters of recurrent services never need this: being named on a
-- service is their access.

CREATE TABLE IF NOT EXISTS rrsm_access_requests (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL,
  name          TEXT,
  job_title     TEXT,
  department    TEXT,
  country_code  TEXT NOT NULL REFERENCES rrsm_countries(code),
  role          TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer')),
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by    TEXT,
  decided_at    TIMESTAMPTZ,
  decision_note TEXT
);

-- One open request per person per country: asking twice updates nothing, it is already queued.
CREATE UNIQUE INDEX IF NOT EXISTS rrsm_access_requests_one_pending
  ON rrsm_access_requests (lower(email), country_code) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS rrsm_access_requests_status ON rrsm_access_requests (status, requested_at DESC);
