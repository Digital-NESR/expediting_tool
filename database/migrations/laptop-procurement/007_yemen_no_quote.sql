-- ============================================================================
-- Yemen has no quote, so its prices say $1 rather than $100.
--
-- Yemen is a portal country the November 2026 sheet does not cover, so 006 left
-- its six rows at the placeholder 005 seeded. $100 is the worst figure to leave
-- there: it is plausible enough to pass review and reach SAP as though someone
-- had priced it. $1 is the convention the sheet itself uses for a country that
-- did not respond or marked a model n/a (Libya, Chad, and most of Kuwait's and
-- Iraq's columns), and it is obviously not a real price to anyone reading the
-- WIP.
--
-- Marked 'no-quote:2026-11' rather than 'sheet:2026-11', because the sheet does
-- not say this - we decided it. The two should not be confused when the next
-- catalog lands and someone asks where a figure came from.
--
-- This also settles the placeholder banner, which was undercounting: it flags
-- rows still marked 'seed:placeholder', and two of Yemen's six had been stamped
-- with an admin's email by a save that never changed their value. Four were
-- flagged, six were $100. After this, none are.
-- ============================================================================

UPDATE laptop_device_prices
   SET unit_price_usd = 1,
       updated_at     = NOW(),
       updated_by     = 'no-quote:2026-11'
 WHERE LOWER(TRIM(country)) = LOWER(TRIM('Yemen'));
