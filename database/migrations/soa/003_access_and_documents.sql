/*
 * What the tool needs on top of the designed schema: an access-request flow, grants that can span
 * every country, vendor contact addresses, and somewhere to put an uploaded statement.
 */

/* ── Grants that span every country ─────────────────────────────────────────
   A champion normally owns one country. Some people — the SOA process owner, a
   regional lead — need every country, and that has to be one grant rather than a
   row per country, or adding a new country would silently drop them out of it.
   NULL country_id means "all countries".

   The primary key cannot express that, since a key column may not be NULL, so it
   becomes a unique index over COALESCE instead. Same guarantee, one nullable
   column. The foreign key still holds: NULL satisfies it.

   The primary key has to be dropped first: Postgres refuses to drop NOT NULL
   from a column while a primary key still depends on it. */
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'country_users_pkey' AND contype = 'p'
  ) THEN
    ALTER TABLE country_users DROP CONSTRAINT country_users_pkey;
  END IF;
END
$$;

ALTER TABLE country_users ALTER COLUMN country_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS country_users_email_role_country_uniq
  ON country_users (email, role, COALESCE(country_id, '*'));

/* ── Access requests ────────────────────────────────────────────────────────
   Same shape as the other tools' request tables, so the /admin approvals screen
   behaves the way an admin already expects.

   One row per person: requesting again updates the existing row rather than
   queuing a second. `requested_country` NULL means they asked for every country,
   matching the country_users convention above. Only 'champion' and 'viewer' are
   offerable — a manager is appointed in the /admin matrix, never self-requested,
   which is why this column is a CHECK over two literals rather than the enum. */
CREATE TABLE IF NOT EXISTS soa_access_requests (
  user_email        VARCHAR(200) PRIMARY KEY,
  display_name      VARCHAR(150),
  job_title         VARCHAR(150),
  department        VARCHAR(150),
  status            VARCHAR(20)  NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Revoked')),
  requested_role    VARCHAR(20)  NOT NULL CHECK (requested_role IN ('champion', 'viewer')),
  requested_country VARCHAR(8)   REFERENCES countries(id),
  approved_role     VARCHAR(20)  CHECK (approved_role IN ('champion', 'viewer')),
  approved_country  VARCHAR(8)   REFERENCES countries(id),
  reason            TEXT,
  requested_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at       TIMESTAMPTZ,
  reviewed_by       VARCHAR(200),
  notes             TEXT
);
CREATE INDEX IF NOT EXISTS idx_soa_access_requests_status ON soa_access_requests (status);

/* ── Vendor contact addresses ───────────────────────────────────────────────
   The whole tool exists to email vendors, and the Approved Vendor List has an
   address for only about a third of the vendors that clear the scope threshold —
   and where it has one, it is often the same address repeated three times behind
   commas. So the AVL seeds this column and the country champion corrects it.

   An array rather than a text column because a statement request genuinely does
   go to several people at a vendor, and splitting a comma-joined string at the
   point of sending is how a malformed address becomes a silently dropped email.

   `contact_source` records where the current value came from, so a champion can
   see at a glance which addresses are still the unverified AVL import. */
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_source VARCHAR(20)
  NOT NULL DEFAULT 'none' CHECK (contact_source IN ('none', 'avl', 'manual'));
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_updated_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS contact_updated_by VARCHAR(200);

/* ── The statement file itself ──────────────────────────────────────────────
   `file_url` was the original design and stays for anything already pointing at
   an external copy. The bytes live here so the file is served from an
   authenticated route, the way TI-TE, ProcureGuard, Laptop Procurement and the
   catalog all serve theirs — a statement of account names a vendor, its invoice
   numbers and its balances, and is not something to hand out on an unguessable
   URL. `file_url` therefore loses its NOT NULL: an upload into this table has no
   external URL to record. */
ALTER TABLE soa_submissions ADD COLUMN IF NOT EXISTS content BYTEA;
ALTER TABLE soa_submissions ADD COLUMN IF NOT EXISTS content_type VARCHAR(120);
ALTER TABLE soa_submissions ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(200);
ALTER TABLE soa_submissions ALTER COLUMN file_url DROP NOT NULL;

/* ── Cycle bookkeeping ──────────────────────────────────────────────────────
   Which cycle the tool opens on, and where its PO figures were drawn from. A
   cycle's extract is a point-in-time read of historic_spend; recording the window
   means a coverage number can be explained a year later without guessing which
   eighteen months it covered. */
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS lookback_months INTEGER NOT NULL DEFAULT 18;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS extract_from DATE;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS extract_to DATE;
ALTER TABLE cycles ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ;

/* Exactly one cycle is the active one. A partial unique index says so in the
   schema rather than in a comment nobody reads. */
CREATE UNIQUE INDEX IF NOT EXISTS cycles_one_active ON cycles ((is_active)) WHERE is_active;

/* ── Country mapping ────────────────────────────────────────────────────────
   historic_spend spells its countries as free text — 'KSA', 'EOS JAFZA',
   'Jordon' — while this tool keys on short codes. The mapping is data, not
   structure, so it is seeded by scripts/soa-seed-countries.mjs; the column is
   here because the join depends on it existing. One code can claim several
   spellings, which is why it is an array. */
ALTER TABLE countries ADD COLUMN IF NOT EXISTS spend_names TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE countries ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE countries ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
