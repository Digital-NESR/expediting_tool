-- ============================================================================
-- The November 2026 catalog, re-read after the vendors came back with more.
--
-- Same source and same rule as 006: "Laptop Purchasing Catalog.xlsx", sheet
-- '2026 November', the GREEN preferred-vendor block only (C-Q, fill FF00B050).
-- The orange backup block (R-AF, FFFFC000) is a second quote for the same
-- machines and is still not loaded.
--
-- What moved, and why - 20 of the 90 rows:
--
--   Abu Dhabi now has a vendor (Infosoft Middle East) and a full set of prices
--   where four models previously read $1. Syria follows it, as the sheet says.
--
--   Dubai gained the OptiPlex pair and a Dell Pro figure, and its Lenovo X1
--   moved $0.37 because the AED rate did: 006 used the official peg (3.6725)
--   because no AED row then paired a local price with a USD one. Seven of Abu
--   Dhabi's rows now do, and all seven imply 3.672 exactly, so the sheet's own
--   rate is used instead. Preferring it keeps a converted figure consistent with
--   the ones printed beside it.
--
--   Libya and Kuwait gained a Dell Pro 14 Plus price, and these two are the one
--   place this file departs from the rule 006 set. The catalog has a single
--   'Dell Pro 14 Plus'; the sheet quotes a Core i5 and a Core i7, and 006 took
--   the i7 column as the safer of two real prices. Here the i7 column is $1 -
--   no quote - while the i5 carries a real one ($1,800 Libya, $1,059 Kuwait).
--   Taking i7 would discard a genuine quote in favour of a placeholder, which
--   is not what "use the dearer column" was for. So: the i7 price when it is a
--   real one, otherwise the i5 price when that is, otherwise $1. Every other
--   country is unaffected - their two columns are both real or both $1.
--
-- Rates, all from the sheet itself except the last:
--   AED  3.672      implied by Abu Dhabi's seven rows, unanimously
--   KWD  0.31157    implied by Kuwait's own rows
--   INR  94.80      implied by India's own rows
--   IDR  18250      mid-market, 24 Nov 2026 - Indonesia still quotes only in
--                   rupiah, so this remains the one figure the sheet does not
--                   constrain, and the one to revisit when finance states a rate
--
-- Yemen is untouched: it is still not in the sheet, and 007 set it to $1.
--
-- An UPDATE rather than a delete-and-insert: all 90 rows already exist, so
-- nothing needs creating, and an UPDATE neither touches the sequence nor risks
-- the expression unique index.
-- ============================================================================

UPDATE laptop_device_prices p
   SET unit_price_usd = i.unit_price_usd,
       updated_at     = NOW(),
       updated_by     = 'sheet:2026-11-26'
  FROM (VALUES
    ('Dell Latitude 5000 series - Core i5', 'Abu Dhabi', 1409.31),
    ('Dell Latitude 5000 series - Core i7', 'Abu Dhabi', 1579.52),
    ('Dell Pro 14 Plus', 'Abu Dhabi', 1606.75),
    ('Lenovo X1 Carbon', 'Abu Dhabi', 2709.69),
    ('OptiPlex 5000 series - Core i5', 'Abu Dhabi', 946.35),
    ('OptiPlex 5000 series - Core i7', 'Abu Dhabi', 1082.52),
    ('Dell Latitude 5000 series - Core i5', 'Algeria', 1515.00),
    ('Dell Latitude 5000 series - Core i7', 'Algeria', 1680.00),
    ('Dell Pro 14 Plus', 'Algeria', 1.00),
    ('Lenovo X1 Carbon', 'Algeria', 1.00),
    ('OptiPlex 5000 series - Core i5', 'Algeria', 1500.00),
    ('OptiPlex 5000 series - Core i7', 'Algeria', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Bahrain', 1591.33),
    ('Dell Latitude 5000 series - Core i7', 'Bahrain', 2522.67),
    ('Dell Pro 14 Plus', 'Bahrain', 2522.67),
    ('Lenovo X1 Carbon', 'Bahrain', 3050.67),
    ('OptiPlex 5000 series - Core i5', 'Bahrain', 1280.00),
    ('OptiPlex 5000 series - Core i7', 'Bahrain', 1560.00),
    ('Dell Latitude 5000 series - Core i5', 'Chad', 1.00),
    ('Dell Latitude 5000 series - Core i7', 'Chad', 1.00),
    ('Dell Pro 14 Plus', 'Chad', 1.00),
    ('Lenovo X1 Carbon', 'Chad', 1.00),
    ('OptiPlex 5000 series - Core i5', 'Chad', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Chad', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Egypt', 1767.44),
    ('Dell Latitude 5000 series - Core i7', 'Egypt', 2010.42),
    ('Dell Pro 14 Plus', 'Egypt', 1767.44),
    ('Lenovo X1 Carbon', 'Egypt', 3700.00),
    ('OptiPlex 5000 series - Core i5', 'Egypt', 818.60),
    ('OptiPlex 5000 series - Core i7', 'Egypt', 1209.30),
    ('Dell Latitude 5000 series - Core i5', 'HQ Dubai', 1409.31),
    ('Dell Latitude 5000 series - Core i7', 'HQ Dubai', 1579.52),
    ('Dell Pro 14 Plus', 'HQ Dubai', 1606.75),
    ('Lenovo X1 Carbon', 'HQ Dubai', 2668.85),
    ('OptiPlex 5000 series - Core i5', 'HQ Dubai', 946.35),
    ('OptiPlex 5000 series - Core i7', 'HQ Dubai', 1082.52),
    ('Dell Latitude 5000 series - Core i5', 'India', 1265.82),
    ('Dell Latitude 5000 series - Core i7', 'India', 1371.31),
    ('Dell Pro 14 Plus', 'India', 1751.05),
    ('Lenovo X1 Carbon', 'India', 1.00),
    ('OptiPlex 5000 series - Core i5', 'India', 1.00),
    ('OptiPlex 5000 series - Core i7', 'India', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Indonesia', 1095.89),
    ('Dell Latitude 5000 series - Core i7', 'Indonesia', 1304.11),
    ('Dell Pro 14 Plus', 'Indonesia', 1.00),
    ('Lenovo X1 Carbon', 'Indonesia', 1835.62),
    ('OptiPlex 5000 series - Core i5', 'Indonesia', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Indonesia', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Iraq', 425.00),
    ('Dell Latitude 5000 series - Core i7', 'Iraq', 475.00),
    ('Dell Pro 14 Plus', 'Iraq', 1.00),
    ('Lenovo X1 Carbon', 'Iraq', 1.00),
    ('OptiPlex 5000 series - Core i5', 'Iraq', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Iraq', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Kuwait', 882.63),
    ('Dell Latitude 5000 series - Core i7', 'Kuwait', 1104.09),
    ('Dell Pro 14 Plus', 'Kuwait', 1059.00),
    ('Lenovo X1 Carbon', 'Kuwait', 2263.00),
    ('OptiPlex 5000 series - Core i5', 'Kuwait', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Kuwait', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Libya', 1.00),
    ('Dell Latitude 5000 series - Core i7', 'Libya', 1.00),
    ('Dell Pro 14 Plus', 'Libya', 1800.00),
    ('Lenovo X1 Carbon', 'Libya', 1.00),
    ('OptiPlex 5000 series - Core i5', 'Libya', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Libya', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Oman', 1246.75),
    ('Dell Latitude 5000 series - Core i7', 'Oman', 1.00),
    ('Dell Pro 14 Plus', 'Oman', 1.00),
    ('Lenovo X1 Carbon', 'Oman', 1.00),
    ('OptiPlex 5000 series - Core i5', 'Oman', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Oman', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Qatar', 1.00),
    ('Dell Latitude 5000 series - Core i7', 'Qatar', 1401.00),
    ('Dell Pro 14 Plus', 'Qatar', 1.00),
    ('Lenovo X1 Carbon', 'Qatar', 3186.00),
    ('OptiPlex 5000 series - Core i5', 'Qatar', 1.00),
    ('OptiPlex 5000 series - Core i7', 'Qatar', 1.00),
    ('Dell Latitude 5000 series - Core i5', 'Saudi Arabia', 1591.33),
    ('Dell Latitude 5000 series - Core i7', 'Saudi Arabia', 2522.67),
    ('Dell Pro 14 Plus', 'Saudi Arabia', 2522.67),
    ('Lenovo X1 Carbon', 'Saudi Arabia', 3050.67),
    ('OptiPlex 5000 series - Core i5', 'Saudi Arabia', 1280.00),
    ('OptiPlex 5000 series - Core i7', 'Saudi Arabia', 1560.00),
    ('Dell Latitude 5000 series - Core i5', 'Syria', 1409.31),
    ('Dell Latitude 5000 series - Core i7', 'Syria', 1579.52),
    ('Dell Pro 14 Plus', 'Syria', 1606.75),
    ('Lenovo X1 Carbon', 'Syria', 2709.69),
    ('OptiPlex 5000 series - Core i5', 'Syria', 946.35),
    ('OptiPlex 5000 series - Core i7', 'Syria', 1082.52)
  ) AS i (model, country, unit_price_usd)
 WHERE LOWER(TRIM(p.model))   = LOWER(TRIM(i.model))
   AND LOWER(TRIM(p.country)) = LOWER(TRIM(i.country));
