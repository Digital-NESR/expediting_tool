-- Statement amounts need three decimals, because six of the currencies have three.
--
-- WHY. `tax_amount`, `total_amount` and `outstanding_amount` were numeric(18,2), so every amount
-- was rounded to the cent on the way in. KWD, OMR, BHD, IQD, JOD and LYD are all thousandths --
-- a Kuwaiti dinar divides into 1000 fils, not 100 -- so a statement line of 1,234.567 KWD has
-- always been stored as 1,234.57. That is 3,424 of the 20,027 lines in this table, better than
-- one in six, concentrated in Oman (2,025), Kuwait (1,008) and Libya (358).
--
-- It is a small error per line and it does not compound the way the decimal-comma bug did, but
-- it is wrong in exactly the countries that bug was about, and a consolidation tool that cannot
-- state a supplier's balance to the unit the supplier invoices in is reporting a number nobody
-- can reconcile against.
--
-- PRECISION IS UNCHANGED AT 18. Widening the scale moves one digit from the integer side, so the
-- largest representable amount falls from ~10^16 to ~10^15. The largest figure in the table is
-- around 3.4e9, so there is five orders of magnitude of headroom; nothing can overflow.
--
-- NOT A LOSSY CHANGE. Going from scale 2 to scale 3 only appends a zero to what is already
-- stored (1234.57 becomes 1234.570). The third digit of the amounts that were truncated is NOT
-- recovered by this migration -- it was discarded at write time and only the original workbook
-- still has it. `scripts/soa-renormalize-amounts.mjs` re-reads those workbooks and restores it;
-- run it after this applies.

ALTER TABLE soa_submission_lines
  ALTER COLUMN tax_amount TYPE numeric(18,3),
  ALTER COLUMN total_amount TYPE numeric(18,3),
  ALTER COLUMN outstanding_amount TYPE numeric(18,3);
