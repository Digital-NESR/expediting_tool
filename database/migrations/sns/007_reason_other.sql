-- ============================================================================
-- An "Other" reason code, and a shorter name for one of the existing ones.
--
-- 1. 'Active contract / master agreement' -> 'Active contract'.
--
--    sns_record.reason stores the chosen reason as text, not as a foreign key,
--    so the rename has to be applied in both places or every existing record
--    keeps a string that no longer matches any offered option — which reads on
--    the UI as a record whose reason code was deleted.
--
-- 2. 'Other' is offered for both classifications, with the free text kept in
--    sns_record.reason_other.
--
--    The reason column still holds the literal 'Other' rather than the typed
--    sentence. Everything that groups by reason — the dashboard bars, the
--    filters, the CSV — keeps working, and "how often is none of our codes the
--    right one" stays a question the data can answer. The sentence is carried
--    alongside and shown wherever the code is shown.
--
--    sort_order 99 puts it last under both classifications, after the codes
--    seeded at 0..n, which is where a fallback belongs.
-- ============================================================================

UPDATE sns_reason
   SET name = 'Active contract'
 WHERE name = 'Active contract / master agreement';

UPDATE sns_record
   SET reason = 'Active contract'
 WHERE reason = 'Active contract / master agreement';

INSERT INTO sns_reason (classification, name, sort_order)
VALUES ('SGL', 'Other', 99),
       ('SOL', 'Other', 99)
ON CONFLICT (classification, name) DO NOTHING;

ALTER TABLE sns_record ADD COLUMN IF NOT EXISTS reason_other TEXT;
