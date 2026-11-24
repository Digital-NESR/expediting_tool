-- ============================================================================
-- The November 2026 purchasing catalog, replacing the $100 placeholders of 005.
--
-- Source: "Laptop Purchasing Catalog.xlsx", sheet '2026 November', the PREFERRED
-- vendor block (columns D-Q). The backup-vendor block (R-AF) quotes the same
-- machines a second time and is deliberately not loaded: this table holds one
-- price per model and country, and the preferred vendor is the one a WIP should
-- reflect.
--
-- Conversions. Most rows already carried a USD figure and were taken as given.
-- Where only a local price existed, the rate came from the sheet itself wherever
-- the sheet supplied one, so a converted figure agrees with those beside it:
--
--   AED  3.6725     official peg; no AED row pairs a local price with a USD one
--   KWD  0.31157    implied by Kuwait's own rows (705/2263, 330/1059)
--   INR  94.80      implied by India's own rows (138000/1455.70, 166000/1751.05)
--   IDR  18250      mid-market, looked up 24 Nov 2026. Indonesia quotes only in
--                   rupiah, so nothing in the sheet constrains this one. It is
--                   the single figure here that is neither the vendor's nor a
--                   peg, and the one to revisit when finance states a rate.
--
-- $1 means "no quote" - the country did not respond, or marked the model n/a.
-- Carried over rather than left unpriced, because the sheet says $1 explicitly
-- and a WIP reading $1 is visibly wrong in a way a missing one is not.
--
-- Two sheet columns, 'Dell Pro 14 Plus - Core i5' and '- Core i7', map onto the
-- one catalog model 'Dell Pro 14 Plus'. The i7 column is used: the catalog does
-- not distinguish them, so the WIP cannot either, and overstating the spend is
-- the safer of the two errors.
--
-- Removed rather than repriced:
--   'Dell PRO Rugged, RB14250 XCTO Ultra 7' is in the catalog but in no column of
--   the sheet. Unpriced is an ordinary state - resolveUnitPriceUsd answers null
--   and the WIP refuses with `missing: total value (USD)` - so the gap lands on
--   the request screen instead of a figure nobody quoted landing in SAP.
--
--   Country 'Other' held seven $100 rows, which 004's own header says should not
--   exist ("Country 'Other' and the exceptional model are expected to stay
--   unpriced"). Cleared to match.
--
-- Left alone: Yemen is a portal country the sheet does not cover, so its
-- placeholders stay for someone to price or clear - the Devices tab already
-- counts them. Syria's rows ARE written although 'Syria' is not yet in
-- COUNTRY_OPTIONS: the sheet says "same as abu dhabi", so they sit ready rather
-- than being lost, and are inert until Syria becomes selectable.
--
-- Written as four plain statements rather than one data-modifying CTE: the
-- sub-statements of a WITH cannot see each other's effects, and the uniqueness
-- this relies on is an expression index, so a delete and an insert in the same
-- statement is exactly the case not to be clever about.
-- ============================================================================

DELETE FROM laptop_device_prices
 WHERE LOWER(TRIM(model)) = LOWER(TRIM('Dell PRO Rugged, RB14250 XCTO Ultra 7'));

DELETE FROM laptop_device_prices
 WHERE LOWER(TRIM(country)) = LOWER(TRIM('Other'));

DELETE FROM laptop_device_prices
 WHERE LOWER(TRIM(model)) IN (
        LOWER(TRIM('Dell Latitude 5000 series - Core i5')),
        LOWER(TRIM('Dell Latitude 5000 series - Core i7')),
        LOWER(TRIM('Dell Pro 14 Plus')),
        LOWER(TRIM('Lenovo X1 Carbon')),
        LOWER(TRIM('OptiPlex 5000 series - Core i5')),
        LOWER(TRIM('OptiPlex 5000 series - Core i7'))
      )
   AND LOWER(TRIM(country)) IN (
        LOWER(TRIM('Abu Dhabi')),
        LOWER(TRIM('Algeria')),
        LOWER(TRIM('Bahrain')),
        LOWER(TRIM('Chad')),
        LOWER(TRIM('Egypt')),
        LOWER(TRIM('HQ Dubai')),
        LOWER(TRIM('India')),
        LOWER(TRIM('Indonesia')),
        LOWER(TRIM('Iraq')),
        LOWER(TRIM('Kuwait')),
        LOWER(TRIM('Libya')),
        LOWER(TRIM('Oman')),
        LOWER(TRIM('Qatar')),
        LOWER(TRIM('Saudi Arabia')),
        LOWER(TRIM('Syria'))
      );

INSERT INTO laptop_device_prices (model, country, unit_price_usd, updated_by)
VALUES
  ('Dell Latitude 5000 series - Core i5', 'Abu Dhabi', 973.45, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Abu Dhabi', 1123.21, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Abu Dhabi', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Abu Dhabi', 2137.51, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Abu Dhabi', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Abu Dhabi', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Algeria', 1515.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Algeria', 1680.00, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Algeria', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Algeria', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Algeria', 1500.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Algeria', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Bahrain', 1591.33, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Bahrain', 2522.67, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Bahrain', 2522.67, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Bahrain', 3050.67, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Bahrain', 1280.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Bahrain', 1560.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Chad', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Chad', 1.00, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Chad', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Chad', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Chad', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Chad', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Egypt', 1767.44, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Egypt', 2010.42, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Egypt', 1767.44, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Egypt', 3700.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Egypt', 818.60, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Egypt', 1209.30, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'HQ Dubai', 980.26, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'HQ Dubai', 1089.18, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'HQ Dubai', 1388.70, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'HQ Dubai', 2668.48, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'HQ Dubai', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'HQ Dubai', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'India', 1265.82, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'India', 1371.31, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'India', 1751.05, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'India', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'India', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'India', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Indonesia', 1095.89, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Indonesia', 1304.11, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Indonesia', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Indonesia', 1835.62, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Indonesia', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Indonesia', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Iraq', 425.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Iraq', 475.00, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Iraq', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Iraq', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Iraq', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Iraq', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Kuwait', 882.63, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Kuwait', 1104.09, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Kuwait', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Kuwait', 2263.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Kuwait', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Kuwait', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Libya', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Libya', 1.00, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Libya', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Libya', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Libya', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Libya', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Oman', 1246.75, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Oman', 1.00, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Oman', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Oman', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Oman', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Oman', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Qatar', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Qatar', 1401.00, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Qatar', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Qatar', 3186.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Qatar', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Qatar', 1.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Saudi Arabia', 1591.33, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Saudi Arabia', 2522.67, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Saudi Arabia', 2522.67, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Saudi Arabia', 3050.67, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Saudi Arabia', 1280.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Saudi Arabia', 1560.00, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i5', 'Syria', 973.45, 'sheet:2026-11'),
  ('Dell Latitude 5000 series - Core i7', 'Syria', 1123.21, 'sheet:2026-11'),
  ('Dell Pro 14 Plus', 'Syria', 1.00, 'sheet:2026-11'),
  ('Lenovo X1 Carbon', 'Syria', 2137.51, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i5', 'Syria', 1.00, 'sheet:2026-11'),
  ('OptiPlex 5000 series - Core i7', 'Syria', 1.00, 'sheet:2026-11');
