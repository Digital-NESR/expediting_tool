/**
 * What SAP says about a cycle line's PR and PO, reduced to the few states a buyer acts on.
 *
 * Pure, so the rules can be tested without the warehouse. The reading itself is in
 * `sap-status.ts`, against Materials DB's `track` views.
 *
 * THE RECEIPT RULE IS DIFFERENT FOR SERVICES. Rentals and services are item category 9 in SAP:
 * ordered qty 1, received qty 0, nothing outstanding. So `track.po_line.receipt_state` reads
 * "Closed, no GRN" on almost every one of them whether or not anything was received, and taking
 * it at face value would show every AUH PO as done. A service is received by a service entry
 * sheet, which posts a GR date, so for a service line the GR date is the evidence and the
 * receipt state is not.
 */

export type SapPoRelease = 'released' | 'under_release' | 'draft' | 'deleted';
export type SapReceipt =
  'received' | 'partial' | 'not_received' | 'service_posted' | 'no_service_entry' | 'unapproved';
export type SapPrRelease = 'released' | 'under_release' | 'not_submitted';

export interface SapPo {
  po: string;
  release: SapPoRelease;
  /** The SAP user the PO is waiting with, while it is under release. */
  waitingWith: string | null;
  daysWaiting: number | null;
  receipt: SapReceipt;
  value: number | null;
  currency: string;
  createdOn: string;
  releasedOn: string;
  lastReceiptOn: string;
}

export interface SapPr {
  pr: string;
  release: SapPrRelease;
  /** True once every line of it is on a PO. */
  converted: boolean;
  waitingWith: string | null;
  daysWaiting: number | null;
  /** The latest date SAP put one of its lines on a PO, `yyyy-mm-dd`, or ''. */
  convertedOn: string;
  /**
   * The POs SAP has raised from this PR, from the PO side (`supplychain` carries the PR on each PO
   * line, released or not). The PR table knows THAT a PR was converted, never the PO number.
   */
  pos: string[];
}

export interface SapStatus {
  /** False when Materials DB could not be read; the page says so rather than showing blanks. */
  ok: boolean;
  pos: Record<string, SapPo>;
  prs: Record<string, SapPr>;
  /** When the warehouse last loaded PO data, `yyyy-mm-ddThh:mm`, or '' if unknown. */
  loadedAt: string;
}

export const EMPTY_SAP: SapStatus = { ok: true, pos: {}, prs: {}, loadedAt: '' };

/**
 * One PO from its lines' states. The least advanced line decides: a PO with one line still under
 * release is not released, and a PO whose every line is deleted is gone.
 */
export function poReleaseFrom(lines: { state: string; deleted: boolean }[]): SapPoRelease {
  const live = lines.filter((l) => !l.deleted);
  if (!live.length) return 'deleted';
  if (live.some((l) => l.state === 'Draft')) return 'draft';
  if (live.some((l) => l.state === 'Under Release')) return 'under_release';
  return 'released';
}

export function receiptFrom(input: {
  release: SapPoRelease;
  isService: boolean;
  receiptStates: string[];
  hasReceiptDate: boolean;
}): SapReceipt {
  if (input.release === 'under_release' || input.release === 'draft') return 'unapproved';
  if (input.isService) return input.hasReceiptDate ? 'service_posted' : 'no_service_entry';
  const s = input.receiptStates;
  if (s.length && s.every((x) => x === "Fully GRN'ed")) return 'received';
  if (s.some((x) => x === "Fully GRN'ed" || x === "Partially GRN'ed")) return 'partial';
  return 'not_received';
}

export function prReleaseFrom(states: string[]): SapPrRelease {
  if (!states.length || states.some((s) => s === 'Not Submitted')) return 'not_submitted';
  if (states.some((s) => s === 'Under Release')) return 'under_release';
  return 'released';
}

export const PO_RELEASE_LABEL: Record<SapPoRelease, string> = {
  released: 'Released',
  under_release: 'Under release',
  draft: 'Draft',
  deleted: 'Deleted',
};

export const RECEIPT_LABEL: Record<SapReceipt, string> = {
  received: 'GRN done',
  partial: 'Part GRN',
  not_received: 'No GRN yet',
  service_posted: 'Service entry done',
  no_service_entry: 'No service entry yet',
  unapproved: 'Not approved yet',
};

export const PR_RELEASE_LABEL: Record<SapPrRelease, string> = {
  released: 'Released',
  under_release: 'Under release',
  not_submitted: 'Not submitted',
};

/* ─── one cycle line, PR to service entry ────────────────────────────────────────────────── */

/**
 * Where a cycle line is between "nobody has linked a PR" and "the PO has a service entry".
 *
 * The link a person makes is the PR. Everything after it is read: SAP's PR table says whether the
 * PR is released and whether (and when) it went onto a PO; SAP's PO data says which PO, because
 * each PO line carries the PR it came from; and the PO says the rest.
 */
export type LinePrStage =
  | 'no_pr'
  | 'pr_not_found'
  | 'pr_not_submitted'
  | 'pr_under_release'
  | 'pr_released'
  /** SAP says the PR is on a PO, but no PO line naming it has been loaded yet. */
  | 'converted_po_pending'
  | 'po';

export interface LineSap {
  stage: LinePrStage;
  /** The POs whose status the line should show: the recorded one, or those SAP raised from the PR. */
  pos: string[];
  /**
   * A PO number to record on the line because SAP has exactly one PO for its PR and the line has
   * none yet. Null when there is nothing to fill, or when the PR split into several POs (a person
   * should say which belongs to this line).
   */
  autoPo: string | null;
  pr: SapPr | null;
}

export function lineSap(line: { prNumber: string; poNumber: string }, sap: SapStatus): LineSap {
  const prNumber = line.prNumber.trim();
  const poNumber = line.poNumber.trim();
  const pr = prNumber ? (sap.prs[prNumber] ?? null) : null;

  if (poNumber) return { stage: 'po', pos: [poNumber], autoPo: null, pr };
  if (!prNumber) return { stage: 'no_pr', pos: [], autoPo: null, pr: null };
  if (!pr) return { stage: 'pr_not_found', pos: [], autoPo: null, pr: null };
  if (pr.pos.length)
    return { stage: 'po', pos: pr.pos, autoPo: pr.pos.length === 1 ? pr.pos[0] : null, pr };
  if (pr.convertedOn) return { stage: 'converted_po_pending', pos: [], autoPo: null, pr };
  if (pr.release === 'not_submitted')
    return { stage: 'pr_not_submitted', pos: [], autoPo: null, pr };
  if (pr.release === 'under_release')
    return { stage: 'pr_under_release', pos: [], autoPo: null, pr };
  return { stage: 'pr_released', pos: [], autoPo: null, pr };
}

export const LINE_PR_STAGE_LABEL: Record<Exclude<LinePrStage, 'po'>, string> = {
  no_pr: 'No PR linked',
  pr_not_found: 'PR not in SAP data yet',
  pr_not_submitted: 'PR not submitted',
  pr_under_release: 'PR under release',
  pr_released: 'PR released · no PO yet',
  converted_po_pending: 'On a PO · number not in the data yet',
};

/* ─── suggesting a PR ────────────────────────────────────────────────────────────────────── */

/** A PR SAP has put on a service PO for this supplier, as a candidate for a line. */
export interface PrCandidate {
  pr: string;
  pos: string[];
  /** Total of the PR's PO lines for this supplier. */
  value: number | null;
  currency: string;
  createdOn: string;
  description: string;
}

/**
 * Candidates nearest the line's value first, then newest.
 *
 * Value because a monthly rental PO is usually raised for exactly the month's amount: on Abu
 * Dhabi's November cycle the nearest-value PR was the right one on 189 of 208 lines.
 */
export function rankCandidates(cands: PrCandidate[], lineValue: number): PrCandidate[] {
  const gap = (c: PrCandidate) => (c.value === null ? Infinity : Math.abs(c.value - lineValue));
  return [...cands].sort(
    (a, b) => gap(a) - gap(b) || b.createdOn.localeCompare(a.createdOn) || a.pr.localeCompare(b.pr),
  );
}

/**
 * How a PR was linked to a line without a buyer:
 *   exact  the one PR worth the line's value to the fils: taken as sure;
 *   near   the one PR within 1 % of it: for a buyer to check;
 *   only   the vendor's only PR in the cycle window: for a buyer to check.
 */
export type PrAutoReason = 'exact' | 'near' | 'only';

/** True when an automatic link is not sure enough to stand without a buyer's look. */
export function prNeedsCheck(reason: PrAutoReason | null | undefined): boolean {
  return reason === 'near' || reason === 'only';
}

/**
 * The PR to link to a line on its own, or null when a buyer should choose.
 *
 * SAP's rental PRs name no vendor (on the UAE's November cycle none of 97 did), so a PR can be
 * tied to a supplier only once SAP has raised a PO from it. From then on, among the vendor's
 * service PRs on POs in the cycle window:
 *   - exactly one PR worth the line's value (to the fils, else within 1 %), or
 *   - the vendor's only PR, which carries all of that vendor's lines for the month.
 * Measured on the UAE's November cycle against the 208 lines linked by hand: 174 linked, 173
 * right; the one miss was a PR raised outside the window. So an auto-linked PR is marked as
 * such on the board, and the buyer can change it.
 */
export function autoPrFor(
  cands: PrCandidate[],
  lineValue: number,
): { pr: string; reason: PrAutoReason } | null {
  if (!cands.length) return null;
  const exact = cands.filter((c) => c.value !== null && Math.abs(c.value - lineValue) < 0.01);
  if (exact.length === 1) return { pr: exact[0].pr, reason: 'exact' };
  if (!exact.length && lineValue > 0) {
    const near = cands.filter(
      (c) => c.value !== null && Math.abs(c.value - lineValue) / lineValue <= 0.01,
    );
    if (near.length === 1) return { pr: near[0].pr, reason: 'near' };
  }
  if (cands.length === 1) return { pr: cands[0].pr, reason: 'only' };
  return null;
}

/** A PR number as SAP writes it: digits only, leading zeros dropped. Null when it is not one. */
export function cleanPrNumber(raw: string): string | null {
  const s = String(raw ?? '').replace(/\s+/g, '');
  if (!/^\d{6,12}$/.test(s)) return null;
  return s.replace(/^0+(?=\d)/, '');
}

/** Counts for the Dashboard, over the lines' POs (each PO counted once). */
export function summarisePos(
  poNumbers: string[],
  sap: SapStatus,
): {
  total: number;
  released: number;
  underRelease: number;
  notInSap: number;
  serviceEntered: number;
} {
  const seen = new Set(poNumbers.map((p) => p.trim()).filter(Boolean));
  let released = 0;
  let underRelease = 0;
  let notInSap = 0;
  let serviceEntered = 0;
  for (const p of seen) {
    const s = sap.pos[p];
    if (!s) notInSap++;
    else if (s.release === 'released') {
      released++;
      if (s.receipt === 'service_posted' || s.receipt === 'received') serviceEntered++;
    } else if (s.release === 'under_release' || s.release === 'draft') underRelease++;
  }
  return { total: seen.size, released, underRelease, notInSap, serviceEntered };
}
