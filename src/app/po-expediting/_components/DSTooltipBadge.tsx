'use client';

import { useRef, useState } from 'react';
import { DS_DESCRIPTIONS } from '@/lib/ds-codes';

/* A bare DS code with its meaning on hover. The description comes from the one DS catalogue,
   so this can no longer disagree with the reference modal beside it. */
export function DSTooltipBadge({ code }: { code: string }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => setVisible(true), 150);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  const description = DS_DESCRIPTIONS[code];

  return (
    <div className="relative inline-block" onMouseEnter={show} onMouseLeave={hide}>
      <span className="px-2.5 py-1 bg-slate-100 rounded-md text-xs font-medium border border-slate-200 text-slate-600 cursor-default select-none">
        {code}
      </span>
      {visible && description && (
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
            {description}
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
