# Catalogue / PIR Coverage (`KPI - PIR Coverage`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Exports

Two Power BI "$Value for POs with PIR" exports, both minimal xlsx files with the filters in the
sheet:

- **"…By Country"**: `Reporting Country - Finance`, `PO$ with PIR`, `%PO$ with PIR` and the PO
  release month. Gives the countries.
- **"…By Release Timeline"**: PO release year and month, `PO$ with PIR` and `%PO$ with PIR` for all
  countries together. Gives **Global**.

Both must carry `Year is <year>` and `Account Classification Description is Direct Order or
Inventory`; the script refuses a file without them.

## Rules

- Value = `%PO$ with PIR` (a fraction in the export, × 100 on the board), by PO release month.
- `KSA` → Saudi Arabia, through the board's aliases.
- Load only the missing months, and never the current, unfinished month. The exports recalculate
  past months (on 24 Nov 2026, Global for January–July differed from the board by up to 10 points),
  so stored months are left as they are.

## Steps

```
node scripts/health-board-pir-from-export.mjs --by-country="<…By Country.xlsx>" --global="<…By Release Timeline.xlsx>" --year=2026 --months=November --out=reports/health-board/pir-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show
additions only.

## History

- **24 Nov 2026**: August, September and October 2026 added (load 23, 26 values). Global: 32.53%,
  59.17% and 21.14%.
