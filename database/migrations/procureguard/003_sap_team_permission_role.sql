-- The permission role that goes with the SAP Team verification step.
--
-- 002 added 'Verified by SAP Team' to `procure_guard_status`, which is the step a REQUEST sits
-- at. It did not add the matching value to `procure_guard_permission_role`, which is the role a
-- PERSON holds — and the recipient sync derives exactly that role for anyone filed against the
-- new step. So assigning the first SAP Team approver got as far as writing the recipient row and
-- then failed on the sync with:
--
--     invalid input value for enum procure_guard_permission_role: "SAP Team"
--
-- Two enums, one concept, and only one of them was extended. Adding the second here.
--
-- Placed after 'SCM Manager' so the enum's own order follows the adhoc chain, the same way the
-- rank map in recipient-sync.ts does. Nothing orders by this column today; it is kept honest so
-- that anything which later does gets the right answer for free.
--
-- `ADD VALUE` inside a transaction is fine from Postgres 12 (this server is 18.6) as long as the
-- new label is not USED in the same transaction. Nothing below writes a row carrying it: the
-- recipient rows are written by the admin screen, afterwards, in their own transactions.
--
-- The pg_type guard is carried over from 001: nothing in this repo CREATEs this type. It was
-- provisioned by hand, and on an environment where the column is plain TEXT the type does not
-- exist at all. A bare ALTER TYPE would fail there with 42704 and take the whole migration run
-- with it. An IF rather than an EXCEPTION handler, because an EXCEPTION clause opens a
-- subtransaction and that is the one context ALTER TYPE ... ADD VALUE still objects to.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type WHERE typname = 'procure_guard_permission_role' AND typtype = 'e'
  ) THEN
    ALTER TYPE procure_guard_permission_role ADD VALUE IF NOT EXISTS 'SAP Team' AFTER 'SCM Manager';
  END IF;
END
$$;
