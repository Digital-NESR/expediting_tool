-- Remove the manager role.
--
-- It was a rung above champion on the rank ladder, and every guard in the tool asks for "champion
-- or better" -- so a manager could scope vendors, send requests, accept statements and close a
-- country, in every country their grant covered. Nothing anywhere said they may; it fell out of
-- the ordering. The only thing the role did on purpose was unlock the cross-country rollup, and a
-- champion granted every country now does that instead.
--
-- Postgres cannot drop a value from an enum, so the type is rebuilt. Safe only because nobody
-- holds the role: the guard below aborts rather than silently discarding somebody's access if
-- that stops being true.
DO $$
DECLARE held INTEGER;
BEGIN
  SELECT COUNT(*) INTO held FROM country_users WHERE role::text = 'manager';
  IF held > 0 THEN
    RAISE EXCEPTION
      'Refusing to drop the manager role: % grant(s) still hold it. Move them to champion first.',
      held;
  END IF;
END $$;

ALTER TYPE soa_user_role RENAME TO soa_user_role_old;
CREATE TYPE soa_user_role AS ENUM ('champion', 'ap', 'viewer');
ALTER TABLE country_users
  ALTER COLUMN role TYPE soa_user_role USING role::text::soa_user_role;
DROP TYPE soa_user_role_old;

-- Requests are free text rather than the enum, so any historic ones are rewritten rather than
-- rejected. There are none today; this is here so the migration is not order-dependent on that.
UPDATE soa_access_requests SET requested_role = 'champion' WHERE requested_role = 'manager';
UPDATE soa_access_requests SET approved_role  = 'champion' WHERE approved_role  = 'manager';
