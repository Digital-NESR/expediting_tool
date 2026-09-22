-- ============================================================================
-- Rename the HQ entity to "HQ Dubai".
--
-- Display name only. The country CODE stays 'HQ', which matters: the Registry
-- ID is built from the code, so every issued SGL-HQ-... / SOL-HQ-... ID is
-- untouched by this and stays exactly as it was quoted into SAP.
--
-- sns_record.country is a denormalised copy of the name taken at write time,
-- so existing records are updated alongside the reference row. They are
-- matched on country_code rather than on the old name: the code is the stable
-- key, and a record whose name was already edited would otherwise be missed.
-- ============================================================================

UPDATE sns_country
   SET name = 'HQ Dubai'
 WHERE code = 'HQ'
   AND name <> 'HQ Dubai';

UPDATE sns_record
   SET country = 'HQ Dubai',
       updated_at = CURRENT_TIMESTAMP
 WHERE country_code = 'HQ'
   AND country <> 'HQ Dubai';

-- Records raised before country_code existed carry the name only. There are
-- none in production today, but the baseline allows the column to be null, so
-- the fallback join stays honest rather than silently skipping them.
UPDATE sns_record
   SET country = 'HQ Dubai',
       updated_at = CURRENT_TIMESTAMP
 WHERE country_code IS NULL
   AND country = 'HQ';
