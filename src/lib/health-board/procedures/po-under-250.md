# PO Value < 250 $ (`KPI - PO < 250 $`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Export

Power BI (Supply Chain Data to Insights 2.0) `POs_With_Value_lessThan250` (count) and
`POs_With_Value_lessThan250%` by `Reporting Country - Finance` and GR posting year and month,
exported as data (a minimal xlsx with the filters in the sheet). The "Applied filters" line must
include `Year is <year>` and the delivery filters this export carries:

- `4YSUPPLY-FRGKE_KEY is G`
- `4YSUPPLY-PLANT_KEY is not 8013 or PM30`
- `4YSUPPLY-DELV_STATUS_KEY is Fully Delivered`
- `EXT_LTD_Bucket is not Wrong Date`
- `4YSUPPLY-PU_DOC_TYPE_KEY is not INTC`
- `Reporting Segment - Finance is not Speciality Chemicals`
- `4YSUPPLY-DELETION_INDICATOR_KEY is` (blank: not deleted)

## Rules

- **This export is the measure from 2026 on.** It counts delivered POs by GR month, which is not
  how the earlier 2026 figures were built: on 24 Nov 2026, 90 of 91 stored country-months differed.
  The owner ruled to replace all of January–October 2026 with it.
- The export gives fractions; the board stores percentages (× 100).
- **Global = all POs under $250 ÷ all POs that month.** Each country's PO total is its count ÷ its
  share. This is not the mean of the countries, which a country with one PO at 100% would distort.
  The script refuses a month where a country shows 0%, because its total cannot be derived.
- Rows for another GR posting year in the file (December 2025 appears in it) are ignored.
- Never load the current, unfinished month.

## Steps

```
node scripts/health-board-po250-from-export.mjs --file="<data.xlsx>" --year=2026 --months=November --out=reports/health-board/po250-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data.

## History

- **24 Nov 2026**: all of January–October 2026 replaced from the export (load 21: 98 changed, 36
  added). Two stored values with no row in the export were kept by the owner's decision: India
  March and Jordan April 2026.
