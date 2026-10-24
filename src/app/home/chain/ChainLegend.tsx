'use client';

/**
 * The key.
 *
 * The diagram says five things at once -- which route a stage is on, which of our tools
 * serve it, whether you can open them, which enterprise system it runs on, and whether
 * anything covers it at all -- and a reader who has to infer that vocabulary will get some
 * of it wrong. A few lines spent saying it outright is the cheapest honesty available, and
 * a map of this kind is expected to carry a key.
 *
 * The interchange ring is the one that earns its place twice over. It is new, it is the
 * mark this drawing is organised around now that the lane bands are gone, and nothing else
 * on the page explains it.
 *
 * Only the marks that are not self-evident. A padlock does not need explaining; "this box
 * is hollow because nothing covers this step" does.
 */

import { SYSTEM_INK } from './chainTheme';

function Swatch({ children }: { children: React.ReactNode }) {
  return <span className="flex h-4 w-7 shrink-0 items-center justify-center">{children}</span>;
}

export default function ChainLegend({ showGaps }: { showGaps: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-2.5 text-[11px] text-slate-500">
      <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Key</span>

      <span className="inline-flex items-center gap-1.5">
        <Swatch>
          <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
            <rect
              x="1"
              y="2"
              width="26"
              height="12"
              rx="6"
              fill="#307c4c22"
              stroke="#307c4c"
              strokeWidth="1"
            />
          </svg>
        </Swatch>
        One of our tools
      </span>

      <span className="inline-flex items-center gap-1.5">
        <Swatch>
          <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
            <path d="M0 8 H28" stroke="#1F5C8B" strokeWidth="3" strokeLinecap="round" />
            <circle cx="14" cy="8" r="4.5" fill="#ffffff" stroke="#1F5C8B" strokeWidth="2" />
          </svg>
        </Swatch>
        A ring is where one line joins another
      </span>

      <span className="inline-flex items-center gap-1.5">
        <Swatch>
          <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
            <rect
              x="4"
              y="2"
              width="20"
              height="12"
              rx="2"
              fill="#ffffff"
              stroke={SYSTEM_INK}
              strokeWidth="1"
              strokeOpacity="0.7"
            />
          </svg>
        </Swatch>
        Runs on SAP or Ariba
      </span>

      <span className="inline-flex items-center gap-1.5">
        <Swatch>
          <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
            <circle cx="14" cy="8" r="5" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
            <path
              d="M14 5 L14 8 L16 9.5"
              fill="none"
              stroke="#94a3b8"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </Swatch>
        A padlock or clock means you cannot open it yet
      </span>

      {showGaps && (
        <span className="inline-flex items-center gap-1.5">
          <Swatch>
            <svg viewBox="0 0 28 16" className="h-4 w-7" aria-hidden>
              <rect
                x="1"
                y="1"
                width="26"
                height="14"
                rx="3"
                fill="#ffffff"
                stroke="#cbd5e1"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            </svg>
          </Swatch>
          Hollow: nothing covers this step
        </span>
      )}
    </div>
  );
}
