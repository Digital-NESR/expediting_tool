-- Drop `country_approver.seeded_from_procureguard`.
--
-- WHY IT EXISTED. The approver matrix was seeded once from ProcureGuard's adhoc Country SCMs,
-- which was a reasonable starting point and nothing more -- those people were chosen to approve
-- adhoc payments, not catalogue rates. The flag let the screen say "this is the ProcureGuard
-- default, nobody has confirmed it for the catalogue", so an inherited value never passed for a
-- decision.
--
-- WHY IT GOES. Every one of the 19 active countries now has an approver that an admin chose and
-- confirmed, so the question the column answered has been answered. The seeding action, the
-- "fill empty rows" button, the banner and the per-row badge were all removed once that was
-- done, which left a column nothing reads or writes.
--
-- IT IS NOT HISTORY WORTH KEEPING. The flag recorded where a value came from, not what it was.
-- `audit_log` holds every actual assignment, with who made it and when, so dropping this loses
-- no record of how any country's approver was set -- only a hint that stopped being true the
-- moment each one was confirmed.

ALTER TABLE country_approver DROP COLUMN IF EXISTS seeded_from_procureguard;
