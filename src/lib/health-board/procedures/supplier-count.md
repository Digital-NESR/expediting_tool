# Supplier Count (`KPI - Supplier No.`): monthly procedure

Owner rulings of 24 Nov 2026. Do it the same way every month.

## Export

Power BI (Supplier Management | AVL) "Total and Active Suppliers by Purchase Organization":
`Purch__org__descr_` and `Active_Suppliers`. Its "Export Details" sheet must show:

- `Central_purchasing_block is` (blank: not blocked)
- `Purch__block_for_purchasing_organization is` (blank)
- `Vendor Type is Trading Vendors`
- `4YSUPPLY-SUPPLIER_PLANT_KEY is not EOS DMCC, , or EOS JAFZA`

The script refuses a file without them.

## Rules

- **The source is live only** (today's active suppliers, no history). Export it at month end. When
  months were missed, the one snapshot goes into every missing month.
- Purchasing organisations map with the board's aliases: KSA LOCL → Saudi Arabia, Dubai LOCL → HQ
  Dubai, Abu Dhabi LOCL → UAE, and "<Country> LOCL" → that country.
- **Global is not the sum of the rows.** It counts each supplier once even when it is registered in
  several countries (owner, 24 Nov 2026), so it is a little below the sum. The owner reads it off the
  dashboard and passes it as `--global`.
- Never load the current, unfinished month.

## Steps

```
node scripts/health-board-suppliers-from-snapshot.mjs --file="<Total and Active Suppliers by Purchase Organization.xlsx>" --year=2026 --months=November --global=<n> --out=reports/health-board/suppliers-2026-nov.csv
```

Upload the CSV on /admin → Supply Chain Analytics → Health Board Data.

## History

- **24 Nov 2026**: the snapshot went into August, September and October 2026 (load 22, 57 values:
  18 organisations plus Global 2,587 each month; the rows add up to 2,674).
