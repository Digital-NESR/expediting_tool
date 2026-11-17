-- Remove the "Other" country.
--
-- WHY. 'OT' was in the seed list from the start as a catch-all. It is not a country: a catalogue
-- rate, an access grant and an approver are all scoped by country, and "Other" scopes them to
-- nothing in particular. It appeared in the access-request pills, the admin grant picker, the
-- bulk-import template and the country approver matrix, where it asked an admin to name who
-- signs off rates for Other.
--
-- Removing it from SEED_COUNTRIES stops it being offered, but the seeder upserts rather than
-- reconciles, so the row already in `country` would stay and the matrix would keep showing it.
-- Hence this migration.
--
-- SAFE TO DELETE. Checked before writing: no row in any table with a country_code or country_id
-- column carries 'OT', and no app_user.countries, requested_countries or approved_countries array
-- contains it. Nobody has ever chosen it.
--
-- The exception handler is for the gap between that check and this running in production. If
-- somebody picks "Other" in the meantime, a foreign key will block the delete; rather than fail
-- the deployment over a catch-all nobody wants, the row is deactivated instead. Either way it
-- stops being offered -- every list in the application filters on status = 'Active'.

DO $$
BEGIN
  DELETE FROM country WHERE code = 'OT';
EXCEPTION WHEN foreign_key_violation THEN
  UPDATE country SET status = 'Inactive' WHERE code = 'OT';
END $$;
