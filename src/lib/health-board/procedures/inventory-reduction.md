# KPI - Inventory Reduction: how the monthly values are produced

**What the KPI is:** total inventory value in US$ per country at month end (lower is better).
YTD on the board is the latest month with a value. The 2026 baseline is the December 2025 value.

**Owner's rules (24 Nov 2026):**
1. **EOS DMCC and EOS JAFZA are not part of this KPI.** They are filtered out in the export.
2. **KSA Hydraulic Fracturing is not part of this KPI.** It is subtracted from Saudi Arabia.
3. Global is the sum of the countries, after rule 2.

## Every month

### 1. Export two tables from the "Inventory$ MoM by Country" Power BI visual

Both exports must cover the months you are loading. The "Export Details" sheet of each file
lists its filters. The script checks those filters and refuses a file that doesn't carry them.

| File | Required filters (as shown in "Export Details") |
|---|---|
| **All countries** (e.g. `Inventory$ MoM by Country.xlsx`) | Material Type is not ZAST or ZSER · Country of Legal Entity is not (Blank) · **Reporting Country - Finance is not EOS DMCC or EOS JAFZA** |
| **KSA Hydraulic Fracturing** (e.g. `Inventory$ MoM by Country (1).xlsx`) | Material Type is not ZAST or ZSER · Country of Legal Entity is not (Blank) · **Reporting Segment - Finance is Hydraulic Fracturing** · **Reporting Country - Finance is KSA** |

Both have the columns Year, Month, MonthNo, Country of Legal Entity, and SumTotal_Cost (USD).

### 2. Turn them into an upload file

```
node scripts/health-board-inventory-from-export.mjs \
  --all="<all countries.xlsx>" --ksa-hf="<KSA Hydraulic Fracturing.xlsx>" \
  --year=2026 --from=November --to=November \
  --out=reports/health-board/inventory-reduction-2026-nov.csv
```

What the script does:
- For each country and month, takes **SumTotal_Cost (USD)** from the all-countries file.
- **Saudi Arabia = all-countries value − the KSA Hydraulic Fracturing value** for the same month.
- Maps the export's **"Dubai" to the board's "HQ Dubai"**.
- **Global = the sum of the countries** (after the subtraction).
- Rounds each value to the cent; Global is the sum of the rounded values.
- Prints each Saudi subtraction, so it can be checked by eye.

### 3. Upload it

/admin → Supply Chain Analytics → Health Board Data → choose the file. The preview must show
only the months you meant to load: new values for a new month, or changes where a month is being
corrected. Save. The previous values stay in the history, and the upload can be undone.

## How this was checked (24 Nov 2026)

The rule reproduces every value already on the board for 2025 and January–June 2026, to the
cent (278 values). Two kinds of tiny difference were found:
- Global differs by a few cents in some months, because Global had been typed in rounded.
- Saudi Arabia May 2025 is $30.00 higher on the board than in today's export, a small revision
  in the source after it was entered.

The 2026 baselines equal the December 2025 values exactly.

## History

- **24 Nov 2026:** July 2026 had been copied from June for every country (values-to-check
  item 1). It was replaced, and August–October 2026 added, from the two exports of 24 Nov 2026,
  with the rule above (`reports/health-board/inventory-reduction-2026-jul-oct.csv`).
