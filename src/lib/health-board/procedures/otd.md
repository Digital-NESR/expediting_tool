# On-Time Delivery (`KPI - OTD`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Export

Power BI (Supply Chain Data to Insights 2.0) "On Time Delivery" by `Reporting Country - Finance`
and `4YSUPPLY-GR_POSTING_DATE_KEY - Month`, exported as data (a minimal xlsx with the filters in the
sheet). It has no Year column; the year comes from its filter. The "Applied filters" line must
include:

- `Year is <year>`
- `4YSUPPLY-PLANT_KEY is not 8013 or PM30`
- `4YSUPPLY-FRGKE_KEY is G`
- `4YSUPPLY-GR_POSTING_DATE_KEY is not (Blank)`
- `4YSUPPLY-PU_DOC_TYPE_KEY is not INTC`
- `Reporting Segment - Finance is not Speciality Chemicals`
- `4YSUPPLY-DELETION_INDICATOR_KEY is` (blank: not deleted)

The script refuses a file without them.

## Rules

- The export gives fractions; the board stores percentages (× 100).
- **Global = the simple mean of the country values that month.** The export's "Total" is not used.
  The stored months up to July 2026 hold the Global reported at the time, which is not always the
  simple mean.
- Country names: `KSA` → Saudi Arabia, `Jordon` → Jordan. EOS DMCC is loaded when present, as in
  earlier months.
- Load only the missing months, and never the current, unfinished month. The export recalculates
  past months slightly, so stored months are left as they are.

## Steps

```
node scripts/health-board-otd-from-export.mjs --file="<data.xlsx>" --year=2026 --months=November --out=reports/health-board/otd-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show
additions only.

## History

- **24 Nov 2026**: August, September and October 2026 added (load 16, 47 values: 14–15 countries
  each month plus Global as the mean).
