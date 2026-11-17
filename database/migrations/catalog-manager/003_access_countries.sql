-- Catalog Repo access becomes a real grant, and a grant covers several countries.
--
-- WHY. Until now `getCatalogActor` resolved ANY signed-in employee with no `app_user` row to
-- Viewer. That was deliberate while the tool sat behind an ADMIN_EMAILS redirect — the redirect
-- was the gate and the fallback only decided what an admin saw. Opening the tool to everyone
-- (9e0300c) removed the redirect and left the fallback, so the tool became genuinely open: a
-- colleague reached the supplier price catalogue without appearing anywhere in the approvals
-- queue, because there was nothing to appear in. The gate now lives on the grant itself, and
-- these columns are what a grant is made of.
--
-- WHY ARRAYS. Access is per country and people work across several: one `country_code` forced a
-- choice that is wrong for anyone regional. PO Expediting solved the same problem the same way
-- (`access_requests.requested_countries` / `approved_countries` in the default database) and this
-- deliberately mirrors it, down to the column names, so the two tools read alike.
--
-- `country_code` is KEPT, not dropped. It is a non-null home country on existing rows, several
-- queries still read it, and `country_approver` joins against `app_user` independently. It now
-- means "home country" and `countries` means "what they may see"; the backfill below seeds the
-- array from it so no existing user loses anything on the day this applies.
--
-- WHAT IS NOT HERE. Admin is no longer a row in this table at all — it is membership of the
-- ADMIN_EMAILS environment variable, which is where every other tool in this app reads it from.
-- An `app_user` row saying role = 'Admin' therefore grants access but no admin powers, which is
-- the safe direction for the seeded demo accounts still in this table.

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS countries TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE catalog_access_requests ADD COLUMN IF NOT EXISTS requested_countries TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE catalog_access_requests ADD COLUMN IF NOT EXISTS approved_countries TEXT[] NOT NULL DEFAULT '{}';

-- Seed the arrays from the single country each row already carries, so nobody's access narrows
-- the moment this runs. A row with no country gets an empty array, which the application reads
-- as "no countries yet" rather than "every country".
UPDATE app_user
   SET countries = ARRAY[country_code]
 WHERE country_code IS NOT NULL AND TRIM(country_code) <> '' AND countries = '{}';

UPDATE catalog_access_requests
   SET requested_countries = ARRAY[country_code]
 WHERE country_code IS NOT NULL AND TRIM(country_code) <> '' AND requested_countries = '{}';

UPDATE catalog_access_requests
   SET approved_countries = ARRAY[country_code]
 WHERE status = 'Approved'
   AND country_code IS NOT NULL AND TRIM(country_code) <> '' AND approved_countries = '{}';

-- The approvals queue is read by email and the matrix by country; both are small tables today
-- but both are read on every admin page load.
CREATE INDEX IF NOT EXISTS catalog_access_requests_status_idx
  ON catalog_access_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS country_approver_country_idx
  ON country_approver (country_code) WHERE is_active;

-- Where a country's approver came from.
--
-- The matrix is seeded once from ProcureGuard's Country SCMs, which is a sensible starting point
-- and nothing more -- those people were chosen to approve adhoc payments, not catalogue rates.
-- The flag lets the screen say "this is the ProcureGuard default, nobody has confirmed it",
-- which is honest about a value that was inherited rather than decided. Setting the cell by hand
-- clears it.
--
-- No unique constraint is added alongside: `spend_category_id` is nullable, and Postgres treats
-- NULLs as distinct, so a plain UNIQUE over (user_id, country_code, spend_category_id) would not
-- dedupe the rows this matrix actually writes. The action does an explicit exists-check inside
-- its transaction instead.
ALTER TABLE country_approver ADD COLUMN IF NOT EXISTS seeded_from_procureguard BOOLEAN NOT NULL DEFAULT FALSE;
