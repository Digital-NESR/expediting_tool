-- ============================================================================
-- Indonesia, repriced at the current rupiah rate.
--
-- Indonesia is the one country in the November 2026 catalog that quotes only in
-- local currency, so its three real prices are the only figures in the table
-- the sheet does not itself fix. 006 and 008 carried a looked-up 18250, flagged
-- in both headers as the number to revisit. This is that revisit.
--
--   USD/IDR 18341   ECB euro reference rates, 25 Nov 2026, via frankfurter.dev
--
-- Two other live feeds the same day read 18309.04 and 18227.12 - a 0.6% spread,
-- which is the usual gap between a published reference fixing and a retail feed
-- rather than a disagreement about the market. The ECB fixing is used because
-- it is published, dated and auditable months from now; the others are not.
--
-- Source figures, from the sheet's green preferred-vendor block, row 14:
--
--   Latitude 5000 i5   IDR 20,000,000   1095.89 -> 1090.45
--   Latitude 5000 i7   IDR 23,800,000   1304.11 -> 1297.64
--   Lenovo X1 Carbon   IDR 33,500,000   1835.62 -> 1826.51
--
-- The rupiah weakened slightly against the dollar since the 24 Nov lookup, so
-- all three fall, by about half a percent. Indonesia's other three models are
-- quoted 1 in the sheet - no vendor response - and stay at $1.
--
-- Marked 'rate:2026-11-26' rather than 'sheet:2026-11-26': the prices did not
-- change, the exchange rate did, and the next person reading updated_by should
-- not go looking for a new catalog that does not exist.
-- ============================================================================

UPDATE laptop_device_prices p
   SET unit_price_usd = i.unit_price_usd,
       updated_at     = NOW(),
       updated_by     = 'rate:2026-11-26'
  FROM (VALUES
    ('Dell Latitude 5000 series - Core i5', 'Indonesia', 1090.45),
    ('Dell Latitude 5000 series - Core i7', 'Indonesia', 1297.64),
    ('Lenovo X1 Carbon', 'Indonesia', 1826.51)
  ) AS i (model, country, unit_price_usd)
 WHERE LOWER(TRIM(p.model))   = LOWER(TRIM(i.model))
   AND LOWER(TRIM(p.country)) = LOWER(TRIM(i.country));
