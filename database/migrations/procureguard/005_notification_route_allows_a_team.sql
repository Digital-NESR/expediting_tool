-- Let a notification route hold more than one person.
--
-- `uq_pg_notification_route` was UNIQUE (country, request_type, notification_role, source_column)
-- with no email in it, so a route was one person by construction. That was true of every column
-- the matrix had when the index was written — there is one country SCM, one Treasury Director —
-- and it is false of SAP Team verification, which the whole point of is that several people
-- share the step. Adding a second member raised 23505 and the admin screen showed
-- "duplicate key value violates unique constraint".
--
-- The replacement keeps the rule the index was for — the same person cannot be filed twice on
-- the same route, which would email them twice — and stops it from meaning "only one person".
--
-- Two deliberate differences:
--
--   LOWER(email)  Addresses are compared case-insensitively everywhere else in this module
--                 (addProcureGuardRecipientRow, removeProcureGuardRecipientRow, the sync's
--                 prune). An index that disagreed would let R.Omran@ and romran@ both sit on a
--                 route and both be emailed.
--
--   WHERE is_active  Removal here is deactivation, not deletion, so without the predicate a
--                 removed row would keep occupying its slot forever and re-adding that person
--                 — or, under the old index, ANY person — would fail. Uniqueness is a statement
--                 about who is on a route now, so the index is too.
--
-- Checked before writing: no active route currently holds two rows for the same address, so the
-- new index builds on the live data as it stands.
DROP INDEX IF EXISTS uq_pg_notification_route;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pg_notification_route
  ON procure_guard_notification_recipients
     (country, request_type, notification_role, source_column, LOWER(email))
  WHERE is_active;
