'use client';

import { KpiCard } from '@/app/po-expediting/_components/KpiCard';
import { formatCurrency, formatCurrencyCompact } from '@/app/po-expediting/_lib/format';

/**
 * The dashboard's KPI row, with figures that exercise the awkward cases rather than the tidy
 * ones: a seven-figure line count beside a seven-figure PO count, a zero, a single line (which
 * must read "1 line", not "1 lines"), and a currency string long enough to fight the divider.
 *
 * The money runs through the REAL formatters rather than hand-written strings. The first pass
 * of this preview hard-coded "$118,409,052" and so understated the problem by the width of
 * ".18" -- formatCurrency shows cents, and the string that actually overflowed was longer than
 * the one being looked at. A preview that invents its own data proves nothing about the data.
 */
export default function KpiPreview() {
  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Typical figures
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Distinct Open POs" value="1,284" lines={7299} accent />
          <KpiCard label="Past Due" value="412" lines={2174} danger />
          <KpiCard label="Due This Week" value="63" lines={229} warning />
          <KpiCard
            label="Total Open Value"
            value={formatCurrency(118409052.18)}
            compactValue={formatCurrencyCompact(118409052.18)}
            lines={7299}
            accent
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Edge cases
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Nothing past due" value="0" lines={0} />
          <KpiCard label="One line" value="1" lines={1} accent />
          {/* The widest a count card can get before it breaks, measured at 375px: six digits
              needs 92px of the 106px available, and "999,999 lines" needs 103px. Seven digits
              on either overflows.

              Counts are deliberately NOT abbreviated the way the currency is — "1.3M POs"
              tells a buyer nothing — so this really is the ceiling rather than a formatting
              choice. It is a long way off: the whole estate is 7,299 open POs and 23,563
              expedited lines today, which renders at 61px and 96px. If a card ever does
              overflow again, this is where it shows first. */}
          <KpiCard label="Widest count" value="999,999" lines={999_999} accent />
          <KpiCard
            label="Small total"
            value={formatCurrency(950)}
            compactValue={formatCurrencyCompact(950)}
            accent
          />
        </div>
      </div>
    </div>
  );
}
