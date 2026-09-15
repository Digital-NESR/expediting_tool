'use client';

import type { SortDir } from '../_lib/types';
import { PAGE_SIZE } from '../_lib/constants';

/* Small presentational pieces the PO table needs: the sort caret, the expand chevron, and the
   loading skeleton. Grouped in one file because none is meaningful on its own. */

export function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span
      className={`ml-1 inline-flex flex-col leading-none text-[9px] ${active ? 'text-[#307c4c]' : 'text-slate-300'}`}
    >
      <span className={active && dir === 'asc' ? 'text-[#307c4c]' : ''}>▲</span>
      <span className={active && dir === 'desc' ? 'text-[#307c4c]' : ''}>▼</span>
    </span>
  );
}

/* ─── Chevron Icon ────────────────────────────────────────── */
export function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ease-in-out ${open ? 'rotate-90' : ''}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M7.293 4.707a1 1 0 011.414 0l5 5a1 1 0 010 1.414l-5 5a1 1 0 01-1.414-1.414L11.586 10 7.293 5.707a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

/* ─── Skeleton Rows ───────────────────────────────────────── */
export function SkeletonRows({ cols }: { cols: number }) {
  const pats = ['w-8', 'w-20', 'w-24', 'w-36', 'w-16', 'w-16', 'w-20', 'w-16'];
  return (
    <>
      {Array.from({ length: PAGE_SIZE }).map((_, i) => (
        <tr key={i} className="border-b border-slate-100">
          {Array.from({ length: cols }).map((__, j) => (
            <td key={j} className="p-4 pl-6">
              <div className={`h-3.5 ${pats[j % pats.length]} skeleton-shimmer`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
