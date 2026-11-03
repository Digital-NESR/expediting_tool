'use client';

import { useState } from 'react';
import { ExportToExcelButton } from '@/app/po-expediting/analytics/_components';

/** The header's own classes, copied from AnalyticsClient so the strip measures the same. */
const HEADER =
  'h-14 md:h-16 px-4 md:px-8 flex items-center justify-between border-b border-gray-100 bg-white/80 backdrop-blur-md';

const REFRESH =
  'inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-gray-600 bg-transparent border border-[#e5e7eb] rounded-md hover:bg-[#f9fafb] hover:border-[#d1d5db] transition-all disabled:opacity-60 disabled:cursor-not-allowed';

function Strip({
  label,
  isExporting,
  disabled,
  title,
}: {
  label: string;
  isExporting: boolean;
  disabled: boolean;
  title: string;
}) {
  const [clicks, setClicks] = useState(0);
  return (
    <div className="mb-5">
      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
        {clicks > 0 && <span className="ml-2 text-[#307c4c]">clicked ×{clicks}</span>}
      </p>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <header className={HEADER}>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#307c4c]" />
            <span className="text-lg font-bold tracking-tight text-gray-900">NESR</span>
            <span className="hidden select-none text-gray-300 sm:inline">·</span>
            <span className="hidden text-sm font-medium text-gray-500 sm:inline">My Analytics</span>
          </div>

          <div className="flex items-center gap-2">
            <ExportToExcelButton
              onClick={() => setClicks((n) => n + 1)}
              isExporting={isExporting}
              disabled={disabled}
              title={title}
            />
            <button className={REFRESH}>Refresh</button>
          </div>
        </header>
      </div>
    </div>
  );
}

export default function HeaderPreview() {
  return (
    <div>
      <Strip
        label="Ready"
        isExporting={false}
        disabled={false}
        title="Download your analytics as an Excel workbook"
      />
      <Strip
        label="Working"
        isExporting
        disabled
        title="Download your analytics as an Excel workbook"
      />
      <Strip label="Nothing to export" isExporting={false} disabled title="Nothing to export yet" />
      <p className="mt-6 text-sm text-slate-500">
        Narrow the window below 640px to see the labels collapse to “Export”, which is what keeps
        the two buttons on one line at phone width.
      </p>
    </div>
  );
}
