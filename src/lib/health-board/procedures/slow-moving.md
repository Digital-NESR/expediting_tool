# Slow-Moving Inventory > 2 Years (`KPI - Slow Moving`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## The source is live only

The Power BI source shows **today's** slow-moving stock. It does not keep month-end history, so a
past month cannot be re-exported later. Export it **at month end** (or as close as possible) and
load it as that month. When months have been missed, the owner's ruling is to record the one
snapshot in every missing month (24 Nov 2026: one snapshot loaded as August, September and
October 2026).

## Export

One export, sheet "Export", columns `Reporting Country - Finance` and `SOH_amount`, plus a `Total`
row. Its "Applied filters" line must include all of:

- `YEAR_AGING is 2 - 3 Years, 3 - 4 Years, 4 - 5 Years, or > 5 Years`
- `Material_Type is not ZAST`
- `Value_Unrestricted is greater than 0`

The script refuses a file without them.

## Rules

- Use the file as it is: **no** KSA Hydraulic Fracturing subtraction and no EOS exclusion (unlike
  Inventory Reduction). Owner ruling, 24 Nov 2026.
- Country names: `KSA` → Saudi Arabia, `Jordon` → Jordan (the board's normal aliases).
- Global = the file's `Total`; the script checks that the countries add up to it.
- Values are rounded to the cent. Category "Materials Management", unit "$".

## Steps

```
node scripts/health-board-slow-moving-from-snapshot.mjs --file="<data.xlsx>" --year=2026 --months=November --out=reports/health-board/slow-moving-2026-nov.csv
```

Then upload the CSV on /admin → Supply Chain Analytics → Health Board Data, and check the preview
(added only, unless a month is being deliberately replaced).

The export is a minimal xlsx that exceljs cannot open, so the script reads the sheet XML directly.

## History

- **24 Nov 2026**: the live snapshot (Global within about 1% of July) loaded as
  August, September and October 2026, load 10, 45 values added. February 2026 is a copy of January
  for every country; the owner ruled to **leave it as it is**, because no February data can be
  recovered.
