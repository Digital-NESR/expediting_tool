/**
 * Delivery Status (DS) codes — the one definition in the codebase.
 *
 * There used to be four, and they disagreed. The PO dashboard, the supplier portal dropdown,
 * `src/lib/constants.ts` and the reconciliation screen each carried their own copy, and the
 * dashboard filed DS15 to DS18 under "complete" while reconciliation coloured the same codes
 * amber. Every consumer now reads this file: the dashboard pills, the reference modal, the
 * supplier dropdown and its server-side validation, reconciliation's traffic light, and the
 * analytics tooltips.
 *
 * THE NUMBERING CHANGED ON 15 SEP 2026. The old list carried an extra status,
 * "PO Acknowledged - No response", at DS07, which pushed every code above it up by one and
 * produced a DS19 that does not exist in the official list. Because the supplier portal was the
 * only writer of these codes, roughly 4,400 live line items and 5,900 audit rows had been stored
 * under the shifted numbering. `scripts/remap-ds-codes.mjs` rewrote them by MEANING, so a row
 * the supplier submitted as "Delivered & Invoiced" moved from DS12 to DS11 and still means
 * "Delivered & Invoiced". Read that script before touching anything here: the codes in the
 * database and the codes in this file have to move together or history silently changes meaning.
 */

/** Broad grouping. Drives the pill colour on the dashboard and the legend in the reference modal. */
export type DsCategory = 'issue' | 'ontime' | 'delayed' | 'hold' | 'transit' | 'complete';

/** The three-colour reading reconciliation and the supplier portal use. */
export type DsTone = 'red' | 'amber' | 'green';

export interface DsCode {
  code: string;
  name: string;
  description: string;
  category: DsCategory;
  /**
   * A code that exists only in stored history. Never offered to a supplier and never accepted
   * by the server, but still rendered with its own label so old rows read truthfully.
   */
  retired?: true;
}

/**
 * The official list, in the order it is published. Note that DS09 and DS10 are listed in
 * numerical order here even though the source document prints DS10 above DS09; the code is what
 * identifies the status, and sorting by it keeps every dropdown predictable.
 */
export const DS_CODES: readonly DsCode[] = [
  {
    code: 'DS01',
    name: 'PO Copy Not Received',
    description: 'The Vendor did not receive the PO copy',
    category: 'issue',
  },
  {
    code: 'DS02',
    name: 'PO Rejected',
    description: 'The PO has been rejected by the vendor',
    category: 'issue',
  },
  {
    code: 'DS03',
    name: 'PO Pending Revision',
    description: 'PO requires amendment',
    category: 'issue',
  },
  {
    code: 'DS04',
    name: 'PO Acknowledged - Delivery On time',
    description: 'Delivery will be done as per the Delivery Date confirmed',
    category: 'ontime',
  },
  {
    code: 'DS05',
    name: 'PO Acknowledged - Delivery Delay',
    description: 'Delivery is delayed and revised delivery date is provided',
    category: 'delayed',
  },
  {
    code: 'DS06',
    name: 'Delivery On Hold - Pending Import Permit',
    description: 'Pending Import permit to be provided',
    category: 'hold',
  },
  {
    code: 'DS07',
    name: 'Delivery On Hold - Pending LC',
    description: 'Pending confirmation Letter of Credit',
    category: 'hold',
  },
  {
    code: 'DS08',
    name: 'Delivery On Hold - Pending Advance Payment',
    description: 'Pending advance payment to be confirmed',
    category: 'hold',
  },
  {
    code: 'DS09',
    name: 'Delivery On Hold - Others',
    description: 'Delivery on Hold due to reasons provided by Supplier',
    category: 'hold',
  },
  {
    code: 'DS10',
    name: 'Delivery On-Hold - Payment Issues',
    description: 'Delivery on Hold due to Pending Payment',
    category: 'hold',
  },
  {
    code: 'DS11',
    name: 'Delivered & Invoiced',
    description: 'The PO has been delivered and Invoiced',
    category: 'complete',
  },
  {
    code: 'DS12',
    name: 'Service Ongoing',
    description: 'The services related to the process is ongoing.',
    category: 'complete',
  },
  {
    code: 'DS13',
    name: 'Service Completed',
    description: 'The service has been completed and awaiting goods receipt',
    category: 'complete',
  },
  /* DS14 to DS17 are the journey, not the end of it. The dashboard used to file all four under
     "complete" while reconciliation coloured them amber; the amber reading is the correct one,
     so they have their own category and the two screens finally agree. */
  {
    code: 'DS14',
    name: 'Shipped - In Transit',
    description:
      'The items are currently in transit, meaning they are being transported from one location to another, but they have not yet reached their final destination.',
    category: 'transit',
  },
  {
    code: 'DS15',
    name: 'Ready for Collection',
    description:
      'The items are prepared and available for pickup by the freight forwarder or carrier.',
    category: 'transit',
  },
  {
    code: 'DS16',
    name: 'Collected by Freight Forwarder',
    description:
      'The items have been picked up by the freight forwarder or carrier and are en route to the next destination.',
    category: 'transit',
  },
  {
    code: 'DS17',
    name: 'Customs Clearance',
    description:
      'The items have reached the customs checkpoint and the necessary customs procedures and documentation are being processed for clearance before the items can continue their journey.',
    category: 'transit',
  },
  {
    code: 'DS18',
    name: 'Products Delivered to Base',
    description: 'The items have been successfully delivered to the designated base or destination',
    category: 'complete',
  },
  /* Retired. This was DS07 under the old numbering and has no equivalent in the official list,
     so the remap could not fold it into another status without inventing a meaning for 535
     rows. It keeps its own id and its own label instead: old submissions still read correctly,
     and no supplier can choose it again. Delete it only once those rows are gone. */
  {
    code: 'DS07L',
    name: 'PO Acknowledged - No response',
    description:
      'Retired status, kept so historical submissions still read correctly. No response was received from the supplier. Not selectable.',
    category: 'hold',
    retired: true,
  },
];

/** Codes a supplier may choose, and the only codes the server accepts. Excludes retired ones. */
export const SELECTABLE_DS_CODES: readonly DsCode[] = DS_CODES.filter((c) => !c.retired);

const BY_CODE = new Map(DS_CODES.map((c) => [c.code, c]));

export function getDsCode(code: string | null | undefined): DsCode | null {
  return BY_CODE.get((code ?? '').trim()) ?? null;
}

/** "Delivered & Invoiced", or null for anything not in the list. */
export function dsName(code: string | null | undefined): string | null {
  return getDsCode(code)?.name ?? null;
}

/** "DS11 - Delivered & Invoiced", falling back to the raw value so unknown codes still show. */
export function dsLabel(code: string | null | undefined, separator = '-'): string {
  const raw = (code ?? '').trim();
  const entry = getDsCode(raw);
  return entry ? `${entry.code} ${separator} ${entry.name}` : raw;
}

/**
 * `{ DS01: 'PO Copy Not Received', ... }`. The shape `src/lib/constants.ts` used to export;
 * kept because the analytics tooltips and the portal's validation both want a plain lookup.
 */
export const DS_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
  DS_CODES.map((c) => [c.code, c.name]),
);

/** `{ DS01: 'DS01 - PO Copy Not Received', ... }` for the dashboard's filter dropdown. */
export const DS_DISPLAY_LABELS: Record<string, string> = Object.fromEntries(
  DS_CODES.map((c) => [c.code, `${c.code} - ${c.name}`]),
);

/* ─── Colour ─────────────────────────────────────────────────────────────────
   Two readings of the same categories. The dashboard and the reference modal want six
   distinguishable states; reconciliation and the supplier portal want a traffic light. Both
   derive from `category`, so a code can never be amber in one screen and blue in another —
   which is exactly what happened before this file existed.
   ─────────────────────────────────────────────────────────────────────────── */

export const DS_CATEGORY_TONE: Record<DsCategory, DsTone> = {
  issue: 'red',
  hold: 'red',
  delayed: 'amber',
  transit: 'amber',
  ontime: 'green',
  complete: 'green',
};

/** Traffic-light reading for one code. Unknown codes are amber: visible, not alarming. */
export function dsTone(code: string | null | undefined): DsTone {
  const entry = getDsCode(code);
  return entry ? DS_CATEGORY_TONE[entry.category] : 'amber';
}

export interface DsCategoryStyle {
  id: DsCategory;
  label: string;
  dotClass: string;
  pillBg: string;
  pillText: string;
  pillBorder: string;
}

export const DS_CATEGORY_LEGEND: readonly DsCategoryStyle[] = [
  {
    id: 'issue',
    label: 'Issues',
    dotClass: 'bg-red-500',
    pillBg: 'bg-red-50',
    pillText: 'text-red-700',
    pillBorder: 'border-red-200',
  },
  {
    id: 'ontime',
    label: 'On Time',
    dotClass: 'bg-green-500',
    pillBg: 'bg-green-50',
    pillText: 'text-green-700',
    pillBorder: 'border-green-200',
  },
  {
    id: 'delayed',
    label: 'Delayed',
    dotClass: 'bg-amber-500',
    pillBg: 'bg-amber-50',
    pillText: 'text-amber-700',
    pillBorder: 'border-amber-200',
  },
  {
    id: 'hold',
    label: 'On Hold',
    dotClass: 'bg-orange-500',
    pillBg: 'bg-orange-50',
    pillText: 'text-orange-700',
    pillBorder: 'border-orange-200',
  },
  {
    id: 'transit',
    label: 'In Transit',
    dotClass: 'bg-indigo-500',
    pillBg: 'bg-indigo-50',
    pillText: 'text-indigo-700',
    pillBorder: 'border-indigo-200',
  },
  {
    id: 'complete',
    label: 'Completed / In Progress',
    dotClass: 'bg-blue-500',
    pillBg: 'bg-blue-50',
    pillText: 'text-blue-700',
    pillBorder: 'border-blue-200',
  },
];

const LEGEND_BY_ID = new Map(DS_CATEGORY_LEGEND.map((c) => [c.id, c]));

/** Tailwind classes for a category pill. Unknown categories fall back to slate. */
export function dsCategoryPillClass(category: string): string {
  const style = LEGEND_BY_ID.get(category as DsCategory);
  return style
    ? `${style.pillBg} ${style.pillText} border ${style.pillBorder}`
    : 'bg-slate-50 text-slate-700 border border-slate-200';
}

/** Tailwind classes for one code's pill, looked up through its category. */
export function dsPillClass(code: string | null | undefined): string {
  const entry = getDsCode(code);
  return dsCategoryPillClass(entry?.category ?? '');
}
