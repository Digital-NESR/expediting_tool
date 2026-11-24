# FMT - ICPO Transfer Out (`KPI - FMT - ICPO Transfer out`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Export

Power BI (NESR Inventory Trends 2.0) "Transfer Out MoM by Country": Year, Month, MonthNo,
`All Plants[Country of Legal Entity]` and `TR_OUT_AMOUNT_` (USD; transfers out are negative). It
keeps month-end history. Its "Export Details" sheet must show:

- `Movement_Type is not 309 or 310`
- `Plant is not 8013`
- `Reporting Country - Finance is not EOS DMCC or EOS JAFZA`

The script refuses a file without them.

## Rules

- Value = `TR_OUT_AMOUNT_` per country and month, rounded to the cent.
- `Dubai` is the board's HQ Dubai. Other names map with the board's aliases.
- **Global = the sum of the countries**, which is how every stored month was built.
- Load only the missing months, and never the current, unfinished month. The export recalculates
  older months: checked on 24 Nov 2026, September 2025 to February 2026 matched the board to the cent,
  but January to August 2025 did not, so stored months are left as they are.

## Steps

```
node scripts/health-board-icpo-from-export.mjs --file="<Transfer Out MoM by Country.xlsx>" --year=2026 --from=November --to=November --out=reports/health-board/icpo-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show
additions only.

## History

- **24 Nov 2026**: March to October 2026 added (load 13, 87 values: the countries present each
  month plus Global).
