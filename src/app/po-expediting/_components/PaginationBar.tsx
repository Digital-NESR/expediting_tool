'use client';

import { PAGE_SIZE } from '../_lib/constants';

export function PaginationBar({
  currentPage,
  totalPages,
  totalItems,
  setPage,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  setPage: (p: number) => void;
}) {
  const start = (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, totalItems);

  const pageNums = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => {
      if (totalPages <= 7) return true;
      if (p === 1 || p === totalPages) return true;
      return Math.abs(p - currentPage) <= 2;
    })
    .reduce<(number | '…')[]>((acc, p, idx, arr) => {
      if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);

  return (
    <div className="px-4 sm:px-6 py-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
      <p className="text-sm text-slate-500">
        Showing{' '}
        <span className="font-semibold text-slate-700">
          {start}–{end}
        </span>{' '}
        of <span className="font-semibold text-slate-700">{totalItems.toLocaleString()}</span>{' '}
        purchase orders
      </p>
      <div className="flex items-center gap-2">
        <button
          id="pagination-prev"
          onClick={() => setPage(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="h-9 px-4 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>

        <div className="flex items-center gap-1">
          {pageNums.map((p, i) =>
            p === '…' ? (
              <span key={`el-${i}`} className="px-2 text-slate-400 text-sm select-none">
                …
              </span>
            ) : (
              <button
                key={p}
                id={`pagination-page-${p}`}
                onClick={() => setPage(p as number)}
                className={[
                  'h-9 min-w-[36px] rounded-lg text-sm font-medium transition-all duration-150',
                  currentPage === p
                    ? 'bg-[#307c4c] text-white shadow-sm'
                    : 'border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900',
                ].join(' ')}
              >
                {p}
              </button>
            ),
          )}
        </div>

        <button
          id="pagination-next"
          onClick={() => setPage(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="h-9 px-4 rounded-lg text-sm font-medium border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 hover:text-slate-900 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Next →
        </button>
      </div>
    </div>
  );
}
