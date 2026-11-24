# P&L KPIs (M&S, T&M, O&R, O&C, T&E, PC/PR): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Source

Finance's workbook "NIS-Country (Amount in USD)<MONTH>.xlsx", with two sheets:

- **"NIS- USD-BY GLOBAL"**: Global. Months across row 1 (Jan … latest, then "Totals"), one row per
  ratio from row 3.
- **"NIS-Country (Amount in USD)<MONTH>"**: every country. Countries across row 1, months under
  them in row 2, ratios from row 4. The last column, "Totals" with no month, is the all-countries
  total; the script checks that it equals Global's YTD on sheet 1 and then ignores it.

Ratios are fractions in the file and percentages on the board (× 100). "Totals" per country is the
year to date.

| File row | Board KPI         | Category                       |
| -------- | ----------------- | ------------------------------ |
| MS / TR  | KPI - P&L (M&S)   | Materials Management           |
| TM / TR  | KPI - P&L (T&M)   | Logistics                      |
| OR / TR  | KPI - P&L (O&R)   | Sourcing & Supplier Management |
| OC / TR  | KPI - P&L (O&C)   | Sourcing & Supplier Management |
| TE / TR  | KPI - P&L (T&E)   | Logistics                      |
| PC / PR  | KPI - P&L (PC/PR) | Sourcing & Supplier Management |

## Rules

- **Add the new months, and replace the YTD row** for Global and every country with the file's
  "Totals" (`--ytd`). The P&L YTD is the one entered from Finance's numbers, not computed by the
  board.
- **"na" means no value** (no revenue, so no ratio). It is skipped, never loaded as 0. A stored
  value where the file now says "na" is cleared.
- `SSA` → Chad. **Not loaded:** HQ Dubai (its cells hold USD amounts, not ratios), HQ Houston, DO,
  NESR Consolidation, EOS and Syria.
- Never load the current, unfinished month.
- **Check the older months every time.** Finance's file carries the whole year, so after loading,
  run the script for all months with `--na-as-blank` and compare against the board. The comparison
  must show no differences above 0.0005 percentage points.

## Steps

```
node scripts/health-board-pl-from-export.mjs --file="<NIS-Country (Amount in USD)NOV.xlsx>" --year=2026 --months=November --ytd --out=reports/health-board/pl-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data. The preview should show the
new month as additions and the YTD rows as changes.

## History

- **24 Nov 2026**, from the October file:
  - **Load 19:** August, September and October 2026 added (263 values), and every YTD row replaced
    with the Jan–Oct Totals (86 changed).
  - **Load 20:** older months corrected against the file (14 values, owner ruling):
    - PC/PR Global May and June were swapped on the board.
    - Global June and July for all six ratios had been stored rounded to 2 decimals; they now hold
      full precision, and PC/PR July was also off.
    - Qatar PC/PR February (131.87) and May (0) are "na" in the file and were cleared.
  - **Result:** all 984 cells in the file match the board.
