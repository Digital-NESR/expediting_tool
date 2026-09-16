-- migrate:no-transaction
/*
 * procureguard — baseline schema.
 *
 * This is the schema as it stood on the day migrations were adopted, lifted verbatim from the
 * runtime DDL that used to run on every serverless cold start behind hand-rolled
 * `let xEnsured: Promise<void> | null` memos. It came from four places:
 *
 *   src/lib/procure-guard/schema.ts          ensureProcureGuardUsageTables,
 *                                            ensureProcureGuardAccessRequestTable,
 *                                            ensureProcureGuardPermissionRoleValues,
 *                                            ensureProcureGuardReferenceUniqueness
 *   src/lib/procure-guard/internals.ts       ensureProcureGuardPaymentRequestColumns,
 *                                            ensureProcureGuardDelegationTable
 *   src/app/api/procure-guard/tracking/      ensureUsageTable
 *   src/lib/procure-guard/recipient-sync.ts  the table create inside loadRecipientCountryScopes
 *
 * It is idempotent by construction: every statement is `IF NOT EXISTS` / `ADD COLUMN IF NOT
 * EXISTS`, exactly as it was when it ran on every boot, so applying this file to the already-live
 * procureguard_db is a no-op. That is what makes it safe to adopt on a database that already has
 * this schema. Nothing here was "tidied up" on the way across — a difference between this file and
 * the live database would be a bug, not an improvement.
 *
 * WHY `-- migrate:no-transaction` (first line, load-bearing)
 * ---------------------------------------------------------
 * This file contains `ALTER TYPE ... ADD VALUE` (the Analyst permission role). Postgres refuses
 * that statement inside a transaction block on older servers, and even on 12+ it only tolerates it
 * as long as the new value is not USED later in the same transaction. Rather than depend on the
 * server version, the file opts out of the runner's explicit BEGIN/COMMIT. Two consequences worth
 * knowing:
 *
 *  - Nothing in this file reads or writes the 'Analyst' value, so the "must not be used in the
 *    same transaction" rule is satisfied regardless of how the statements are batched.
 *  - Without a wrapping transaction the file is not atomic. That is fine here precisely because
 *    every statement is idempotent: a partial apply leaves no `schema_migrations` row, and the
 *    re-run skips whatever already landed.
 *
 * HOW THE ORIGINAL ERROR SWALLOWING IS PRESERVED
 * ----------------------------------------------
 * The TypeScript wrapped these statements in helpers that swallowed specific SQLSTATEs. Those were
 * not sloppiness — each one is load-bearing against the live database, so each is reproduced here
 * in SQL rather than dropped:
 *
 *  - 42P07 / 42710 (duplicate table / duplicate object) and 42701 (duplicate column) are already
 *    covered by the `IF NOT EXISTS` clauses the statements carry, so they need nothing extra.
 *  - 42704 (undefined object) on the ALTER TYPE: `procure_guard_permission_role` is not created by
 *    any code in this repo, so the enum type may simply not exist. Guarded with a pg_type lookup.
 *  - 23505 (unique violation) on the two reference_number UNIQUE indexes: legacy duplicate
 *    reference numbers can block those indexes, and the old code deliberately logged a warning and
 *    carried on rather than failing a payment-request create. Guarded with an EXCEPTION block.
 *
 * WHAT IS NOT IN HERE
 * -------------------
 * The core ProcureGuard tables — procure_guard_permissions, procure_guard_adhoc_payments,
 * procure_guard_advance_payments, procure_guard_notification_recipients,
 * procure_guard_activity_log — were never created by the runtime DDL either. They were provisioned
 * out of band and the application only ever ALTERed them. They are therefore not in this baseline,
 * which means this file describes the live database, not a database you can build from scratch.
 * The `ALTER TABLE` sections below assume those tables already exist, just as the code did.
 *
 * Seed/reference data is likewise not here: the recipient country scopes are inserted from a
 * TypeScript constant on every sync run, which is data, not schema, and it stays where it was.
 */

/* ---------------------------------------------------------------------------
   Usage events — the click/page-view telemetry behind the ProcureGuard
   analytics panel.

   These same five statements existed TWICE in the codebase, byte for byte:
   ensureProcureGuardUsageTables() in src/lib/procure-guard/schema.ts (the
   analytics read path) and ensureUsageTable() in the tracking API route (the
   write path). One copy is enough here; see the "tracking usage table"
   section at the end of the file.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS procure_guard_usage_events (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('page_view', 'click')),
  path TEXT NOT NULL,
  page_title TEXT,
  target_tag TEXT,
  target_text TEXT,
  target_href TEXT,
  target_role TEXT,
  duration_ms INTEGER,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_occurred_at ON procure_guard_usage_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_path ON procure_guard_usage_events (path);
CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_user ON procure_guard_usage_events (user_email);
CREATE INDEX IF NOT EXISTS idx_procure_guard_usage_events_type ON procure_guard_usage_events (event_type);

/* ---------------------------------------------------------------------------
   Access requests — one row per user, upserted on re-request. The recipient
   sync writes approved rows here with reviewed_by = 'ProcureGuard recipient
   sync', which is how the prune knows which grants are its own to revoke.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS procure_guard_access_requests (
  user_email TEXT PRIMARY KEY,
  display_name TEXT,
  job_title TEXT,
  department TEXT,
  status TEXT NOT NULL CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Revoked')),
  requested_role TEXT NOT NULL DEFAULT 'Requester',
  approved_role TEXT,
  country TEXT,
  segment TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_procure_guard_access_requests_status ON procure_guard_access_requests (status);
CREATE INDEX IF NOT EXISTS idx_procure_guard_access_requests_requested_at ON procure_guard_access_requests (requested_at DESC);

/* ---------------------------------------------------------------------------
   Permission role values.

   The one statement in this file Postgres will not always accept inside a
   transaction, and the reason for `-- migrate:no-transaction` on line 1.

   Two guards, both carried over from the TypeScript that swallowed SQLSTATE
   42710 and 42704:

     42710 duplicate_object  -> `ADD VALUE IF NOT EXISTS`, so re-applying the
                                baseline to a database that already has
                                'Analyst' does nothing.
     42704 undefined_object  -> the pg_type lookup. Nothing in this repo
                                creates procure_guard_permission_role; it was
                                provisioned by hand, and on an environment
                                where the column is plain TEXT the type does
                                not exist at all. The old code tolerated that
                                and so must this.

   The guard is an IF, not an EXCEPTION handler, on purpose: a PL/pgSQL block
   with an EXCEPTION clause opens a subtransaction, which is exactly the
   context `ALTER TYPE ... ADD VALUE` objects to. A plain IF opens none.

   Note for anyone extending this: the "SC Director" split into adhoc/advance
   variants lives in the approver matrix (src/lib/procure-guard/approver-matrix.ts
   labels 'SC Director (Adhoc)' / 'SC Director (Advance)'), NOT in this enum.
   The permission role for both remains 'Supply Chain Director', so the split
   needed no new enum value and none is added here.
--------------------------------------------------------------------------- */

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'procure_guard_permission_role' AND typtype = 'e'
  ) THEN
    ALTER TYPE procure_guard_permission_role ADD VALUE IF NOT EXISTS 'Analyst';
  END IF;
END
$$;

/* ---------------------------------------------------------------------------
   Reference uniqueness — the sequences behind ADH-000001 / ADV-000001 and the
   UNIQUE indexes that are the hard backstop for them.

   CREATE SEQUENCE ... IF NOT EXISTS is a no-op once they exist, so this never
   resets the counter on a populated database (the renumber migration set
   them); on a fresh DB they start at 1.

   The two UNIQUE indexes are the one place this baseline can legitimately
   fail against a live database, and the EXCEPTION block is why they do not.
   If legacy duplicate reference numbers exist, the index cannot be built and
   Postgres raises 23505. The TypeScript swallowed that and logged a warning
   naming the duplicates, precisely so the diagnostic could never break a
   payment-request create; the same behaviour is kept here as a NOTICE. An
   environment that trips this has NO uniqueness enforcement on
   reference_number until the duplicates are cleaned up and the index is
   created by hand — the notice is the signal to go do that.
--------------------------------------------------------------------------- */

CREATE SEQUENCE IF NOT EXISTS procure_guard_adhoc_reference_seq;
CREATE SEQUENCE IF NOT EXISTS procure_guard_advance_reference_seq;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_procure_guard_adhoc_reference_number ON procure_guard_adhoc_payments (reference_number);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'uq_procure_guard_adhoc_reference_number not created: duplicate reference numbers in procure_guard_adhoc_payments. De-duplicate them, then create the index.';
END
$$;

DO $$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_procure_guard_advance_reference_number ON procure_guard_advance_payments (reference_number);
EXCEPTION WHEN unique_violation THEN
  RAISE NOTICE 'uq_procure_guard_advance_reference_number not created: duplicate reference numbers in procure_guard_advance_payments. De-duplicate them, then create the index.';
END
$$;

/* ---------------------------------------------------------------------------
   Payment request columns — notification/email-test fields on both request
   tables, plus the delegation attribution columns on the activity log.

   The TypeScript ran the three ALTERs in parallel and batched every column
   into one ALTER per table, to collapse ~8 sequential round-trips into ~1 on
   a cold start. That was a latency optimisation for per-request DDL; a
   migration runs once, so the statements are simply listed in order. The
   column list and its defaults are unchanged.

   The two GIN indexes come after the columns because they depend on
   requester_notification_emails existing.
--------------------------------------------------------------------------- */

ALTER TABLE procure_guard_adhoc_payments
  ADD COLUMN IF NOT EXISTS requester_notification_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS email_test_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_test_recipients TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS email_test_recipient_overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_14d_sent_at TIMESTAMPTZ;

ALTER TABLE procure_guard_advance_payments
  ADD COLUMN IF NOT EXISTS requester_notification_emails TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS email_test_mode BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS email_test_recipients TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  ADD COLUMN IF NOT EXISTS email_test_recipient_overrides JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS reminder_7d_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_14d_sent_at TIMESTAMPTZ;

-- Delegation attribution: when a delegate acts using someone else's authority, record who.
ALTER TABLE procure_guard_activity_log
  ADD COLUMN IF NOT EXISTS on_behalf_of_name TEXT,
  ADD COLUMN IF NOT EXISTS on_behalf_of_email TEXT;

CREATE INDEX IF NOT EXISTS idx_procure_guard_adhoc_requester_notification_emails ON procure_guard_adhoc_payments USING GIN (requester_notification_emails);
CREATE INDEX IF NOT EXISTS idx_procure_guard_advance_requester_notification_emails ON procure_guard_advance_payments USING GIN (requester_notification_emails);

/* ---------------------------------------------------------------------------
   Delegation — who may act on whose behalf while an approver is away.
   Both indexes are on LOWER(email), matching how the lookups query them.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS procure_guard_delegations (
  id SERIAL PRIMARY KEY,
  delegator_email TEXT NOT NULL,
  delegator_name TEXT,
  delegate_email TEXT NOT NULL,
  delegate_name TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pg_delegations_delegate ON procure_guard_delegations (LOWER(delegate_email));
CREATE INDEX IF NOT EXISTS idx_pg_delegations_delegator ON procure_guard_delegations (LOWER(delegator_email));

/* ---------------------------------------------------------------------------
   Recipient country scopes — approver name -> the countries their
   country-scoped role covers. The rows are seeded from a TypeScript constant
   on every recipient sync (ON CONFLICT DO NOTHING, so an admin's correction
   in the table always wins), and that seeding is data, so it stays in
   recipient-sync.ts. Only the table itself moves here.
--------------------------------------------------------------------------- */

CREATE TABLE IF NOT EXISTS procure_guard_recipient_country_scopes (
  person_name TEXT NOT NULL,
  role TEXT NOT NULL,
  countries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (person_name, role)
);

/* ---------------------------------------------------------------------------
   Tracking usage table.

   Nothing to do here. The five statements that ran in
   src/app/api/procure-guard/tracking/route.ts before every tracked click were
   character-for-character the same CREATE TABLE and four CREATE INDEX
   statements as the "usage events" section at the top of this file — the
   write path and the read path each carried their own copy. They are declared
   once above; this section exists so that anyone comparing the file against
   the old route handler can see the duplication was deliberate to drop, not
   an omission.
--------------------------------------------------------------------------- */
