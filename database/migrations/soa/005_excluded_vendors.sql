/*
 * Vendors that are never chased, and the default status for a newly scoped one.
 *
 * ── Why an exclusion list ──────────────────────────────────────────────────
 * The largest "vendor" in Saudi Arabia's receipted spend is EOS JAFZA at $127M, and EOS DMCC is
 * itself one of the eighteen countries. These are NESR entities, not suppliers: nobody is going to
 * email a colleague asking them to confirm a statement of account, and leaving them in scope would
 * have champions chasing internal balances while the coverage figure is dominated by money the
 * group owes itself.
 *
 * They are excluded from the CHASE but stay in the snapshot, so the denominator every coverage
 * percentage is measured against is still the country's true receipted spend. Quietly removing
 * them from the denominator too would inflate every percentage and make the target easier to hit
 * than the SOP intends.
 *
 * A table rather than a constant because the list is operational knowledge — a new legal entity
 * appears, an acquired company stops being third-party — and that belongs to whoever runs the
 * process, not to a deploy.
 */
CREATE TABLE IF NOT EXISTS excluded_vendors (
  vendor_no    VARCHAR(30)  PRIMARY KEY,
  name         VARCHAR(200) NOT NULL,
  reason       TEXT         NOT NULL,
  excluded_by  VARCHAR(200) NOT NULL,
  excluded_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

/* ── The scoped status ──────────────────────────────────────────────────────
   004 added the value; this makes it the default for a new entry and moves the
   rows that were using the NULL-timestamp convention onto it.

   The backfill is conservative: only rows that are still `requested` AND have no
   `requested_at` are moved, which is exactly the set that meant "scoped, not yet
   written to". A row with a timestamp had a real request sent and is left alone. */
ALTER TABLE vendor_cycle_entries ALTER COLUMN status SET DEFAULT 'scoped';

UPDATE vendor_cycle_entries
   SET status = 'scoped'
 WHERE status = 'requested' AND requested_at IS NULL;

/* ── Outreach bookkeeping ───────────────────────────────────────────────────
   Requests and reminders go out through an n8n webhook, the way ProcureGuard's and
   Laptop Procurement's do. A dispatch can fail, and a champion has to be able to
   see that it failed rather than assume silence means sent — so each send is
   recorded with what it was sent to and what came back.

   `recipients` is the addresses actually used at send time, not a pointer to the
   vendor's current contacts: the evidence question is "who did you write to", and
   answering it from a mutable column would answer a different question. */
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'outreach_kind') THEN
    CREATE TYPE outreach_kind AS ENUM ('request', 'reminder');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS outreach_dispatches (
  id                     BIGSERIAL PRIMARY KEY,
  vendor_cycle_entry_id  BIGINT        NOT NULL REFERENCES vendor_cycle_entries(id),
  kind                   outreach_kind NOT NULL,
  recipients             TEXT[]        NOT NULL,
  sent_by                VARCHAR(200)  NOT NULL,
  sent_at                TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  succeeded              BOOLEAN       NOT NULL DEFAULT FALSE,
  error                  TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_dispatches_entry
  ON outreach_dispatches (vendor_cycle_entry_id, sent_at DESC);
