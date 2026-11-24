# Days Stock On Hand (`KPI - DSOH`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Two sources

- **Countries: live only.** The per-country DSOH (the "DSOH Trend" table in NESR Inventory Trends
  2.0, column "DSOH(120)") shows today's value and keeps no month history. Read it at month end.
  When months were missed, the owner's ruling is to put the one reading into every missing month
  (as with Slow Moving).
- **Global: month on month.** The "DSOH by Year and Month" export (`[DSOH]` by Year and Month)
  keeps history, so each month's Global comes from its own row. Do not use the live table's
  "Total" for Global.

## Rules

- Whole days, as on the board. `KSA` → Saudi Arabia, `Jordon` → Jordan. A country with no value
  (Syria on 24 Nov 2026) is skipped.
- Never load the current, unfinished month.
- On 24 Nov 2026 the Global export matched the board for January to March, June and July 2026,
  but not for April (export 139.5, board 145) or May (132.4 against 144). The owner had both set to
  the export (140 and 132, load 15). The Global export is the reference for Global.

## Steps

```
node scripts/health-board-dsoh.mjs --year=2026 --months=November --countries="India=…,Algeria=…,KSA=…,Jordon=…" --global-file="<DSOH by Year and Month.xlsx>" --out=reports/health-board/dsoh-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show
additions only.

## History

- **24 Nov 2026**: August, September and October 2026 added (load 14). For each month: 13
  countries from the live table read that day (the same value in all three months), plus Global from
  the month-on-month export.
