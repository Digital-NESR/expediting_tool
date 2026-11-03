'use client';

import { KpiCard } from '@/app/po-expediting/_components/KpiCard';

/**
 * The dashboard's KPI row, with figures that exercise the awkward cases rather than the tidy
 * ones: a seven-figure line count beside a seven-figure PO count, a zero, a single line (which
 * must read "1 line", not "1 lines"), and a currency string long enough to fight the divider.
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
          <KpiCard label="Total Open Value" value="$118,409,052" lines={7299} accent />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Edge cases
        </p>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard label="Nothing past due" value="0" lines={0} />
          <KpiCard label="One line" value="1" lines={1} accent />
          <KpiCard label="Very large" value="1,284,006" lines={7_299_412} accent />
          <KpiCard label="No line reading" value="$1,250" accent />
        </div>
      </div>
    </div>
  );
}
