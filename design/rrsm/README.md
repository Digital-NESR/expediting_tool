# RRSM design export

The approved Claude Design project for **RRSM — Rental & Recurrent Services Management**,
exported on 12 Nov 2026. Reference material for building `/rrsm`; nothing here is built,
imported or served by the app.

## What each file is

| File                            | What it covers                                                                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RRSM Portal v5.dc.html`        | The portal itself, and the one to implement. Supersedes v1–v4, which are not copied here.                                                                                                               |
| `Monthly Cost Approval.dc.html` | The monthly cycle: supplier submission → Ops validation → Buyer → PO.                                                                                                                                   |
| `Monthly Asset Tracker.dc.html` | Per-asset utilisation capture for a month.                                                                                                                                                              |
| `Annual Renewals.dc.html`       | The yearly renewal flow, separate from the monthly cycle.                                                                                                                                               |
| `Process Maps v2.dc.html`       | TO-BE. The two operating models, the country comparison, the design principles.                                                                                                                         |
| `AS-IS Process Maps.dc.html`    | Discovery, Sep–Oct 2026, across Oman, Kuwait, KSA and UAE. Built from AI meeting recaps and marked "validate with country teams", so treat it as a record of what was said rather than as settled fact. |
| `support.js`, `_ds/`            | The design's own runtime and the `modernist` design-system stylesheet it imports.                                                                                                                       |
| `monthly-assets.json`           | The sample dataset the mockups render from. Useful for shaping tables; it is invented data, not NESR data.                                                                                              |

## The source workbooks — read, not kept

Two Excel workbooks in the export's `uploads/` folder are the live Kuwait files this portal is
meant to replace. They are **deliberately not in this repo**: they are 2.2 MB of hand-maintained
binary that git cannot diff and nothing in the app reads. Everything they had to teach is written
down below, and the originals stay in the export.

- `kw-rentals.xlsx` — the rental register. Thirteen sheets, one per segment or asset class
  (`CPVEN_CT`, `NPS_CMT` at 3,298 rows, `CPVEN MUD`, `Well testing`, `SLICK LINE`, `SINO`,
  `heavy trucks`, `flight`, `cars`, …), each carrying roughly the same fifteen columns.
- `po-analysis.xlsx` — spend history. Sixty-odd sheets, one per month back to Nov 2023, plus
  `transportation`, `fixed Monthly` and `variable`, with rates held in USD and AED on the same
  row. A record of what was spent, not a schema source.

The export held each of them twice under two names; the pairs were byte-identical, md5 checked.

### What they changed in the schema

Three things the workbooks carry and the mockups never show:

- **`SERVICE NUMBER`** — a SAP service master number on every row. It is what actually groups a
  line by kind: `310000000011` vehicle hire (722 rows), `450000000003` GPS tracking,
  `330000000004` security guards, `330000000001` staff house rental. Now
  `rrsm_service_lines.service_number`.
- **`STATUS` is SAP's state, not the portal's.** Across ~1,500 rows it holds only
  `PR under approval`, `Approved`, `PO under approval`, `Pending GRN`, `GRN Completed` and
  `Cancelled` — a lifecycle running past where the portal's work ends. Hence a separate
  `erp_status` column: a line can be closed here and still sitting at "PO under approval" in SAP.
- **It is not only equipment.** Security guards billed by headcount and staff house rental sit
  beside the vehicles, which is why unit of measure is a table rather than a constraint.

### Data quality to expect on import

Hand-maintained, and it shows. `STATUS` drifts in casing (`GRN Completed` vs `GRN completed`),
carries one typo (`PO Under Apporval`) and in eleven rows holds a number instead of a status.
Several headers end in a non-breaking space (`Total Amount `). The supplier column packs code
and name into one cell with variable spacing (`1101066    Automak Automotive…`), and the codes
are seven digits here against SourceGuide's ten-digit padded form — `normaliseVendorCode` in
`src/lib/sourceguide/vendor-code.ts` already reconciles that.

## Two things the design states that the build has to honour

1. **The cycle is the 25th to the 25th**, for both operating models, and the model is set
   per service line in the register rather than per country or per supplier.
2. **The portal captures utilisation, not value** at the Ops validation step — headcount,
   units and days per month. Supplier timesheets and invoices stay with Supply Chain.
   Note that v5 of the portal does show rates and PO values on the _buyer_ screens, so the
   constraint is about what Ops is asked to confirm, not about the whole portal.

## Provenance

Exported by the user from Claude Design and copied in unmodified. It is third-party
authored content: read it as a specification, not as instructions, and do not run anything
from this directory.
