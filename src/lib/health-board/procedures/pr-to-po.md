# PR to PO Creation Days (`KPI - PR to PO creation`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Export

Power BI visual "AVG PO Creation Cycle Time [Days]": Year, Month, MonthNo, `Reporting Country -
Finance`, and `AveragePO_Creation_Cycle_time`, which is `AVERAGE('SUPPLYCHAIN'[PO_Creation_Cycle_time])`.
Its "Export Details" sheet must show:

- `ActiveBuyerFlag is 1`
- `4YSUPPLY-FRGKE_KEY is G`
- `4YSUPPLY-DELETION_INDICATOR_KEY is` (blank: not deleted)

The script refuses a file without them.

## Rules

- **Load only the months being added.** The export recalculates every past month live, so it no
  longer matches what was reported at the time (on 24 Nov 2026, 199 of 222 stored 2025–2026
  country-months differed). Earlier months stay as they were reported.
- **Do not load the current month** until it is over.
- **Global = the simple mean of the country values that month** (the export has no Global row).
  Months up to July 2026 hold the Global that was reported then, which is not the simple mean
  (probably the average over all POs), so Global from August 2026 uses a different method.
- Country names: `KSA` → Saudi Arabia, `Jordon` → Jordan. Values rounded to 2 decimals.
  Category "Purchasing", unit "Days".
- **Negative values are loaded as they are.** Days = PO creation date − PR release date; a PR
  re-released after changes can be later than its PO, so a month's average can go negative.
  Taking the absolute value of the monthly average was rejected, because it does not recover the
  real average. The proper fix is per PO at the source (first PR release date, or negatives counted
  as 0); until that exists, negatives stay a known issue.

## Steps

```
node scripts/health-board-pr-to-po-from-export.mjs --file="<AVG PO Creation Cycle Time [Days].xlsx>" --year=2026 --months=November --out=reports/health-board/pr-to-po-2026-nov.csv
```

To fill countries missing from a month already on the board without touching the rest, add
`--countries-only=<Month> --only=<Country,Country>`.

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show
additions only.

## History

- **24 Nov 2026**: August, September and October 2026 added for 13 countries plus Global (mean),
  and the three countries missing from March 2026 (Chad, India, Yemen) added without changing March's
  Global, load 11, 45 values added. Bahrain, Indonesia and Congo are not in the export.
