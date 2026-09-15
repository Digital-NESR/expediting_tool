'use client';

import { daysDiff } from '../_lib/format';

/* Past Due / Due Soon / On Track, derived from the delivery date alone. */
export function DeliveryBadge({ raw }: { raw: string | null | undefined }) {
  const diff = daysDiff(raw);
  if (!raw)
    return (
      <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-500">
        —
      </span>
    );
  if (diff < 0)
    return (
      <span className="bg-red-100/80 border border-red-200 text-red-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">
        Past Due
      </span>
    );
  if (diff <= 7)
    return (
      <span className="bg-amber-100/80 border border-amber-200 text-amber-700 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">
        Due Soon
      </span>
    );
  return (
    <span className="bg-[#307c4c]/10 border border-[#307c4c]/20 text-[#307c4c] text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap">
      On Track
    </span>
  );
}
