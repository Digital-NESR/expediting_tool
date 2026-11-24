# Post-Fact (`KPI - Post Fact`): monthly procedure

Worked out and checked 24 Nov 2026. Do it the same way every month.

## Source

The audit team's "PostFact Audit" workbook (Teams). It has raw and sample sheets per month, plus one
**"<Month> <yy> (Audits)"** sheet per month (e.g. "June 26 (audits)") listing every audited sample
PO with its Country and a **PASS/FAIL** result. The KPI comes from those audit sheets only.

A month is ready only when the audit team has finished it. On 24 Nov 2026 the last finished month
was June 2026; July–October were not done yet.

## Rules

- **Country value = FAIL ÷ every audited PO with a result.** Results are PASS, FAIL, COMPLIANT
  POST FACT and COMPLIANT W MOC; the two "compliant" kinds count in the sample but not as failures.
- **Global = all FAILs ÷ all audited POs** (pooled, not the mean of the countries).
- Rounded to 2 decimals.
- Country codes: ALG, EGPT/EGT, INA, IRQ, KWT, OMN, LBY, QTR, IND, BHR and JRD map to the board's
  names; "UAE EOS" → EOS and "UAE HQ" → HQ Dubai. Anything else must be a board country name.
- This method reproduces the board's stored November 2025 – February 2026 values exactly, every
  country and Global.

## Steps

```
node scripts/health-board-postfact-from-audit.mjs --file="<PostFact Audit ….xlsx>" --year=2026 --months=July --out=reports/health-board/postfact-2026-jul.csv
```

The script reads the workbook with `scripts/lib/xlsx-sheets.mjs` (exceljs cannot open it because
of a table colour filter). Upload the CSV on /admin → Supply Chain Analytics → Health Board Data;
the preview should show additions only.

## History

- **24 Nov 2026**: March–June 2026 added (load 24, 62 values). Global: 0.58%, 0.85%, 1.25% and
  0.84%. January and February re-derived from the same workbook matched the board on every cell.
