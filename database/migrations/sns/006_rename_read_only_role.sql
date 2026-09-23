-- ============================================================================
-- Rename the read-only role.
--
--   'Read-only — Procurement Officer / Auditor'
--     -> 'Read-only — Supply Chain Management / Auditor'
--
-- The role string is stored, not referenced by id, so four live grants in
-- sns_access_requests carry the old spelling and would stop validating against
-- ROLES the moment the code changed. Both columns are updated: requested_role
-- is what the person asked for and is shown back to them on the request page,
-- approved_role is what they actually hold.
--
-- The em dash is U+2014, matching the constant in
-- src/app/sns-registry/lib/constants.ts exactly — a hyphen here would leave a
-- grant that no longer matches any known role, which resolves to no access.
--
-- roleKind() keys on the 'Read-only' prefix, which is unchanged, so nobody's
-- effective permissions move.
-- ============================================================================

UPDATE sns_access_requests
   SET requested_role = 'Read-only — Supply Chain Management / Auditor'
 WHERE requested_role = 'Read-only — Procurement Officer / Auditor';

UPDATE sns_access_requests
   SET approved_role = 'Read-only — Supply Chain Management / Auditor'
 WHERE approved_role = 'Read-only — Procurement Officer / Auditor';
