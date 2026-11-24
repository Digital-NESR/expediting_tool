# Supply Chain Health Board — calculation rules

The native board replaces the Power BI "Supply Chain Health Board" (2025 and 2026 reports). These
rules were decided with the board's owner on 24 Nov 2026. Each one is either **what Power BI did**
or a **deliberate fix**, and every fix is listed in the last section with the Power BI behaviour it
replaces. Change a rule here and in `definitions.ts` / `calc.ts` together; the tests pin both.

## Data

- One database, `all_kpis`. One row per **KPI × year × period × country**. A period is `Baseline`,
  `Target`, `YTD` or a month (`January` … `December`).
- Initial load: the SharePoint list "All KPIs", exported 24 Nov 2026 (2025 and 2026, 7,067 rows).
  From then on the only way in is the upload on `/admin` (Supply Chain Analytics → Health Board
  Data). There is no connection to SharePoint or Power BI.
- **Numbers are never corrected by the app.** What is uploaded is what is shown. Suspicious values
  are reported to the admin, never changed.
- Two rows for the same KPI × year × period × country (after country names are normalised): the
  initial load keeps the one with the newest SharePoint `Modified` date (54 rows, 13 of them with
  a different value; all kept in `kpi_source_rows` as superseded). One exception, the owner's
  ruling: for Past Due % and Past Due % > 30 Days in Nov and Dec 2025 the year-long `UAE` series
  is kept and the `United Arab Emirates` rows that appear only in those months are dropped.
  An upload replaces the stored row and keeps the old value in `kpi_value_history`; a file with
  the same cell twice is rejected.
- Month labels are trimmed (`"February "` is February).
- Category is stored per row and shown per KPI × year. It changed between years (P&L M&S moved
  from Sourcing & Supplier Management to Materials Management in 2026; T&M and T&E to Logistics).

## Countries

One country at a time; default **Global**. Countries are the Power BI "Country Order" list, in its
order, with **EOS DMCC** and **EOS JAFZA** shown as two separate entities after EOS. Spellings
are mapped exactly as the Power BI `Country_Normalized` column did (e.g. `KSA LOCL` → Saudi
Arabia, `SSA` → Chad, `UAE - EOS` → EOS). An upload with a country name not on the list is
rejected, not guessed.

## The overview table

- Year picker: 2025 and 2026, default the latest year with data.
- Rows: the 25 KPIs on the Power BI overview (hidden as there: POs Past Due %, POs Past Due % > 30
  Days, FMT - ICPO Transfer Out, Supplier QBR). Grouped by category; categories and KPI names both
  sorted Z→A, as Power BI sorted them.
- Columns: Baseline (labelled "Baseline <year−1>"), Target, January … the latest month with any
  data that year, Units, YTD.
- Target column shows the target text as entered (e.g. `<= 5`). Colours use the numeric Target.
- Numbers are formatted by unit, the same in every column: % and Days 2 decimals; $ whole
  dollars with thousands separators; Suppliers whole numbers.

## YTD (per KPI)

| Method                                    | KPIs                                                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Latest month with a value                 | Inventory Reduction, DSOH, Slow-Moving Inventory > 2 Years, Supplier Count                                 |
| Sum of months                             | FMT - ICPO Transfer Out                                                                                    |
| Entered (the `YTD` row; never calculated) | the six P&L KPIs: M&S, O&C, O&R, PC/PR, T&E, T&M                                                           |
| Average of the quarters entered           | Inventory Reconciliation Accuracy, Inventory Reconciliation Aging, SOA Consolidation, SourceGuide Coverage |
| Average of the months entered             | everything else on the board                                                                               |
| None                                      | Supplier QBR                                                                                               |

Blank values are skipped (as Power BI's AVERAGE skipped them). A quarterly KPI only takes values
in March, June, September and December; an upload of one in another month is rejected.

The P&L YTD rows for 2025 and 2026 were seeded from the numbers typed into the Power BI YTD
measures, mapped to the board's country names.

## Trend arrows (month columns)

Compared with the previous period for that country: the previous month, or for a quarterly KPI
the previous quarter (March compares with Baseline). Green arrow = moved the good way, red =
moved the bad way, triangle = unchanged. No arrow on January, and none when either value is
blank. "Good way" comes from each KPI's direction (higher or lower is better).

## YTD status dot

Against the numeric Target for that KPI, year and country:

- green: meets the target (≥ for higher-is-better, ≤ for lower-is-better);
- amber: misses it by no more than 10 % of the target's size;
- red: misses it by more;
- none: no target, no YTD, or no direction.

## Detail pages

- One page per KPI with data: Power BI's 25 KPI pages plus P&L (T&E), PO Value < 250 $ and
  SourceGuide Coverage (28; Supplier QBR has no data). Wording is in `pages.ts`. Reached by
  clicking a KPI name on the overview; the year and country carry over.
- Not built: Supplier Contracts Coverage and $ Cost Savings & Avoidance, which read a 2024 Excel
  table that is not in `all_kpis` (owner's decision, 24 Nov 2026).
- Same layout as Power BI: title, description and data source; one country at a time; Baseline,
  Target and YTD cards and a gauge; an area chart of Baseline then each month with a value.
- Baseline, Target, YTD and the status colour are the overview's own numbers for that KPI,
  country and year (`buildDetail` shares `summarise` with `buildOverview`).
- Chart and gauge scales start at zero and fit the data, rounded to 1, 2, 2.5 or 5 × 10^n.
- Text: Power BI's wording with its copy errors fixed (O&C header said "TM / TR"; the PIR chart was
  titled "No. of Active Vendors by Month"; "comparted"; cards said "Baseline 2024" / "YTD 2025"
  in every year). OTD's "YE = Average of Q4 Months" is left off: it contradicts the YTD rule above.

## Fixes against Power BI (the native numbers differ from Power BI here, on purpose)

1. **Duplicate rows were added together.** Power BI SUMs every row, so two rows for one cell
   doubled it (e.g. Global FieldSync FAT target 95 + 95 = 190, which broke that KPI's colour).
   Native keeps one row per cell.
2. **July arrows were swapped** in the overview's icon rules (a good decrease showed a red up
   arrow). Native uses the same rule for every month.
3. **Latest-month YTD was pinned to a month typed into the formula** ("May" in 2026, "December"
   in 2025), so June and July were ignored for Inventory, DSOH, Slow Moving and Supplier Count.
   Native uses the latest month with data.
4. **YTD averaged only January–July** in 2026, a list typed into the formula. Native uses every
   month entered for the year.
5. **P&L YTD lived in the formula**; a country missing from it silently fell back to an average
   of the monthly percentages. Native shows only the entered YTD row; missing is blank.
6. **Amber band was empty for negative targets** (target × 1.1 is below a negative target). Native
   uses 10 % of the target's absolute size.
7. **Status and trend lists missed KPIs.** The YTD dot had no direction for Catalogue / PIR
   Coverage, SourceGuide Coverage, PO Value < 250 $ and P&L (T&E), so they never got a colour;
   arrows treated a blank previous month as zero. Native gives every KPI its direction and draws
   no arrow without two values.
8. **EOS DMCC and EOS JAFZA were added together** as "EOS". Native shows them separately.
9. **The five P&L detail pages showed nothing in 2026.** They filtered on names like
   "4. Profit & Loss (MS)" that are no longer in the data. Native shows them.
10. **A detail page showed two different YTDs.** The YTD card was a plain average of every month
    row, the gauge the overview's YTD, and on the P&L, SOA and InvRecon pages the gauge showed a
    "difference from target or baseline" figure instead. Native shows the overview's YTD in both.
11. **Fixed chart and gauge ranges cut values off** (e.g. PR to PO days 0–15). Native scales to fit.
