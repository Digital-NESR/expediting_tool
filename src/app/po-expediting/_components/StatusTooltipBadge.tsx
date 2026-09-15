'use client';

import { useRef, useState } from 'react';
import type { StatusSummary } from '../_lib/po-status';

/* The collapsed PO row's status pill, with the per-line breakdown on hover. */
export function StatusTooltipBadge({ majority, breakdown }: StatusSummary) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), 150);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  const parts: string[] = [];
  if (breakdown.pastDue > 0) parts.push(`${breakdown.pastDue} Past Due`);
  if (breakdown.dueSoon > 0) parts.push(`${breakdown.dueSoon} Due Soon`);
  if (breakdown.onTrack > 0) parts.push(`${breakdown.onTrack} On Track`);

  const label =
    majority === 'PAST DUE' ? 'Past Due' : majority === 'DUE SOON' ? 'Due Soon' : 'On Track';
  const badgeCls =
    majority === 'PAST DUE'
      ? 'bg-red-100/80 border border-red-200 text-red-700'
      : majority === 'DUE SOON'
        ? 'bg-amber-100/80 border border-amber-200 text-amber-700'
        : 'bg-[#307c4c]/10 border border-[#307c4c]/20 text-[#307c4c]';

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <span
        className={`${badgeCls} text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 rounded-full whitespace-nowrap cursor-default select-none`}
      >
        {label}
      </span>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none select-none">
          <div
            className="text-white whitespace-nowrap"
            style={{
              background: '#1f2937',
              fontSize: '12px',
              padding: '6px 10px',
              borderRadius: '6px',
            }}
          >
            {parts.join(' · ')}
          </div>
          <div
            className="absolute top-full left-1/2 -translate-x-1/2"
            style={{
              width: 0,
              height: 0,
              borderLeft: '5px solid transparent',
              borderRight: '5px solid transparent',
              borderTop: '5px solid #1f2937',
            }}
          />
        </div>
      )}
    </div>
  );
}
