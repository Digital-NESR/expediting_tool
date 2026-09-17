'use client';

import type { TableControlsVM } from '../types';

/**
 * Search box and pager for the two vendor tables.
 *
 * Saudi Arabia has 270 in-scope vendors; the prototype's 24 fixtures let both tables render every
 * row with no way to find one. Deliberately plain — a controlled input and two buttons, no
 * dependency, no virtualiser — because a page of 50 rows is cheap and a champion looking for one
 * vendor types its name.
 */
export default function TableToolbar({
  table,
  placeholder,
}: {
  table: TableControlsVM;
  placeholder: string;
}) {
  return (
    <div className="flex items-center gap-2.5 flex-wrap mb-2.5">
      <div className="relative">
        <input
          type="search"
          value={table.search}
          onChange={(e) => table.onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-[260px] rounded-[7px] border border-sns-line bg-white px-3 py-[7px] text-[12px] text-sns-ink placeholder:text-sns-grey focus:border-sns-green focus:outline-none"
        />
      </div>
      <div className="text-[11px] text-sns-grey">{table.rangeLabel}</div>
      <div className="flex-1" />
      {table.showPager && (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={table.onPrev}
            disabled={!table.hasPrev}
            className="rounded-md border border-sns-line bg-white px-2.5 py-[5px] text-[11px] font-bold text-sns-ink disabled:cursor-not-allowed disabled:text-[#BDBDBD]"
          >
            ← Prev
          </button>
          <span className="text-[11px] text-sns-grey">
            Page {table.page + 1} of {table.pageCount}
          </span>
          <button
            type="button"
            onClick={table.onNext}
            disabled={!table.hasNext}
            className="rounded-md border border-sns-line bg-white px-2.5 py-[5px] text-[11px] font-bold text-sns-ink disabled:cursor-not-allowed disabled:text-[#BDBDBD]"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
