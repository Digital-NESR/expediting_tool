# Supplier Lead Time PO to GR, Local and International (`KPI - TLT (Local)`, `KPI - TLT (Intl)`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Export

Power BI (Supply Chain Data to Insights 2.0) "Average of EXT_LTD" by `Reporting Country - Finance`,
`Purch_ORG_Flag` and GR posting year and month, exported as data (a minimal xlsx with the filters in
the sheet). One file covers both KPIs. The "Applied filters" line must include:

- `4YSUPPLY-FRGKE_KEY is G`
- `4YSUPPLY-PLANT_KEY is not 8013 or PM30`
- `4YSUPPLY-DELV_STATUS_KEY is Fully Delivered`
- `EXT_LTD_Bucket is not Wrong Date`
- `4YSUPPLY-PU_DOC_TYPE_KEY is not INTC`
- `Reporting Segment - Finance is not Speciality Chemicals`
- `4YSUPPLY-DELETION_INDICATOR_KEY is` (blank: not deleted)

The script refuses a file without them.

## Rules

- `Purch_ORG_Flag` **LOCL → TLT (Local)**, **FORN → TLT (Intl)**.
- Values are rounded to 2 decimals. `KSA` → Saudi Arabia, `Jordon` → Jordan.
- **Global = the simple mean of the country values that month, per KPI.** The months up to July
  2026 hold the Global that was reported at the time.
- A single extreme country moves this mean a lot. Extremes are loaded as they are (the owner's
  standing rule) and listed in `reports/health-board/values-to-check.md`.
- Load only the missing months, and never the current, unfinished month.

## Steps

```
node scripts/health-board-tlt-from-export.mjs --file="<data.xlsx>" --year=2026 --months=November --out=reports/health-board/tlt-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show
additions only.

## History

- **24 Nov 2026**: August, September and October 2026 added for both KPIs (load 17, 94 values).
