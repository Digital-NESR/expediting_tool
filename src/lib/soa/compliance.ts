/**
 * The four control criteria from SOP NESR-SC-01-GR2PAY.
 *
 * Pure, and in `lib/` rather than in the screens, because two things need the same answer: the
 * Consolidation screen, which decides whether a champion may hand off, and the evidence pack, which
 * is what an auditor reads months later. Two implementations of a compliance rule eventually
 * disagree, and the version that disagrees is discovered by the auditor rather than by us.
 *
 * All four were once hardcoded to `pass: true`, which made the panel a decoration rather than a
 * control. They are computed now, and a criterion that genuinely cannot be answered reports
 * `unknown` rather than passing — a control that cannot fail proves nothing.
 */

export type CriterionState = 'pass' | 'fail' | 'unknown';

/** The minimum a vendor row has to carry to be judged. `VendorRow` satisfies this structurally. */
export interface ComplianceVendor {
  status: string;
  /** Display form; '—' when no request has been sent. */
  reqDate: string;
  remDate: string | null;
  requestedAt: string | null;
  remindedAt: string | null;
}

export interface Criterion {
  label: string;
  icon: string;
  detail: string;
  state: CriterionState;
}

/** The SOP's reminder window, in whole days after the initial request. */
export const REMINDER_WINDOW_DAYS = { min: 10, max: 14 } as const;

const icon = (s: CriterionState) => (s === 'pass' ? '✓' : s === 'fail' ? '✗' : '?');

/**
 * Whole elapsed days between a request and its reminder, or null when either is missing.
 *
 * Whole rather than fractional: somebody counting "has it been ten days" counts days that have
 * finished, and a reminder sent at nine days and twenty-three hours has not waited ten. Flooring is
 * the stricter reading, which is the right way round for a control.
 */
export function reminderGapDays(vendor: ComplianceVendor): number | null {
  if (!vendor.requestedAt || !vendor.remindedAt) return null;
  return Math.floor((Date.parse(vendor.remindedAt) - Date.parse(vendor.requestedAt)) / 86_400_000);
}

/** True when a reminder landed inside the SOP's window. Null gap (no reminder yet) is not judged. */
export function reminderInWindow(vendor: ComplianceVendor): boolean | null {
  const days = reminderGapDays(vendor);
  if (days === null) return null;
  return days >= REMINDER_WINDOW_DAYS.min && days <= REMINDER_WINDOW_DAYS.max;
}

export function complianceCriteria(
  vendors: ComplianceVendor[],
  coveragePct: number,
  coverageMet: boolean,
  targetPct: number,
  yearEndPct: number,
): Criterion[] {
  const outstanding = vendors.filter((v) => v.status !== 'received');
  const missingSecond = outstanding.filter((v) => v.reqDate === '—' || !v.remDate);
  const twoRequest: CriterionState = !vendors.length
    ? 'unknown'
    : missingSecond.length === 0
      ? 'pass'
      : 'fail';

  const nonResponders = vendors.filter((v) => v.status === 'non_responder');
  const undocumented = nonResponders.filter((v) => v.reqDate === '—' || !v.remDate);
  const nrState: CriterionState = undocumented.length === 0 ? 'pass' : 'fail';

  const coverage: CriterionState = coverageMet ? 'pass' : 'fail';

  /* The SOP wants a reminder to follow its request by 10 to 14 days: sooner and the vendor was not
     given a fair chance to answer, later and the chase stalled. So the test is a WINDOW, not a
     floor — an early reminder breaches it exactly as a late one does.

     Vendors with no reminder at all are not counted here. That is the 2-Request test's job, and
     failing them twice for one omission would double-count it. */
  const reminded = vendors.filter((v) => v.requestedAt && v.remindedAt);
  const outsideWindow = reminded.filter((v) => reminderInWindow(v) === false);
  const gapState: CriterionState = !reminded.length
    ? 'unknown'
    : outsideWindow.length
      ? 'fail'
      : 'pass';

  return [
    {
      label: '18-Month PO Coverage',
      icon: icon(coverage),
      detail: `${coveragePct}% of the 18-month PO balance is covered by received SOAs. Threshold: ${targetPct}% quarterly / ${yearEndPct}% year-end.`,
      state: coverage,
    },
    {
      label: '2-Request Evidence',
      icon: icon(twoRequest),
      detail: !vendors.length
        ? 'No vendors are in scope for this country yet, so there is nothing to test.'
        : missingSecond.length
          ? `${missingSecond.length} of ${outstanding.length} vendors without a response are missing an initial request or a reminder on file.`
          : outstanding.length
            ? `All ${outstanding.length} vendors without a response have both an initial request and a reminder recorded.`
            : 'Every in-scope vendor responded; no second request was owed.',
      state: twoRequest,
    },
    {
      label: '10–14 Day Gap Compliance',
      icon: icon(gapState),
      detail: !reminded.length
        ? 'No reminder has been sent yet, so there is no interval to measure.'
        : outsideWindow.length
          ? `${outsideWindow.length} of ${reminded.length} reminders fell outside the 10–14 day window after the initial request.`
          : `All ${reminded.length} reminders followed their initial request inside the 10–14 day window.`,
      state: gapState,
    },
    {
      label: 'Non-Responder Documentation',
      icon: icon(nrState),
      detail: !nonResponders.length
        ? 'No vendor has been flagged as a non-responder, so no correspondence evidence is owed.'
        : undocumented.length
          ? `${undocumented.length} of ${nonResponders.length} flagged non-responders have no complete request-and-reminder trail on file.`
          : `All ${nonResponders.length} flagged non-responders have time-stamped request and reminder correspondence retained.`,
      state: nrState,
    },
  ];
}
