'use client';

import { useState, useMemo, useRef } from 'react';
import type React from 'react';
import { DS_DESCRIPTIONS } from '@/lib/ds-codes';

/**
 * The analytics UI kit, shared by the three expediting analytics surfaces:
 *
 *   - /admin → PO Expediting → Analytics  (src/app/admin/PoAnalyticsPanel.tsx)
 *   - /po-expediting/team-analytics
 *   - /po-expediting/analytics            (the buyer's own numbers)
 *
 * Every component here was byte-for-byte (or whitespace-only) identical in all three
 * copies, so this is a pure de-duplication with no rendering change.
 *
 * The charts, data tables and detail modals are deliberately NOT here: they differ in
 * substance between the surfaces (the admin and team views carry a Buyer column and
 * buyer-detail drill-down the personal view has no data for), so folding them together
 * would change what a user sees rather than just where the code lives.
 */

/* ─── DSTooltipBadge ─────────────────────────────────────────── */

export function DSTooltipBadge({ code }: { code: string | null }) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!code) return <span className="text-slate-400">—</span>;

  const description = DS_DESCRIPTIONS[code];
  const show = () => {
    timer.current = setTimeout(() => setVisible(true), 150);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
  };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap cursor-default">
        {code}
      </span>
      {visible && description && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="bg-[#1f2937] text-white text-[11px] font-medium px-3 py-1.5 rounded-lg whitespace-nowrap shadow-lg">
            {description}
          </div>
          <div className="w-2 h-2 bg-[#1f2937] rotate-45 mx-auto -mt-1" />
        </div>
      )}
    </div>
  );
}

/* ─── ResponseBadge ──────────────────────────────────────────── */

export function ResponseBadge({ state }: { state: string }) {
  const responded = state === 'Submitted';
  return responded ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#307c4c]/10 text-[#307c4c] border border-[#307c4c]/20 whitespace-nowrap">
      Responded
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700 border border-amber-200 whitespace-nowrap">
      Pending
    </span>
  );
}

/* ─── RateBadge ──────────────────────────────────────────────── */

export function RateBadge({ rate }: { rate: number | null }) {
  if (rate === null || rate === undefined) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-400 border border-slate-200 whitespace-nowrap">
        —
      </span>
    );
  }
  const cls =
    rate >= 70
      ? 'bg-[#307c4c]/10 text-[#307c4c] border-[#307c4c]/20'
      : rate >= 30
        ? 'bg-amber-100 text-amber-700 border-amber-200'
        : 'bg-red-100 text-red-700 border-red-200';
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${cls}`}
    >
      {rate}%
    </span>
  );
}

/* ─── StatPill ───────────────────────────────────────────────── */

export function StatPill({ label, value }: { label: string; value: string | number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 rounded-full text-[12px] font-medium text-slate-600 border border-slate-200">
      <span className="font-bold text-slate-800">{value}</span>
      <span>{label}</span>
    </span>
  );
}

/* ─── Modal loading / empty ──────────────────────────────────── */

export function ModalLoading() {
  return (
    <div className="flex items-center justify-center py-16 gap-3 text-slate-500">
      <svg className="w-5 h-5 animate-spin text-[#307c4c]" viewBox="0 0 24 24" fill="none">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

export function ModalEmpty({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <svg
        className="w-10 h-10 mb-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
}

/* ─── Sorting ────────────────────────────────────────────────── */

export function SortIcon({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span
      className={`ml-1 inline-flex flex-col leading-none text-[9px] ${active ? 'text-[#307c4c]' : 'text-slate-300'}`}
    >
      <span className={active && dir === 'asc' ? 'opacity-100' : 'opacity-40'}>▲</span>
      <span className={active && dir === 'desc' ? 'opacity-100' : 'opacity-40'}>▼</span>
    </span>
  );
}

/**
 * Sorts a list of plain row objects by one column.
 *
 * `T extends object` rather than `Record<string, unknown>`: a row interface has
 * no index signature, so the old constraint forced every call site to write
 * `rows as unknown as Record<string, unknown>[]` and then cast each row back on
 * the way out. The one unavoidable dynamic read now lives here, and `sorted`
 * comes back as `T[]`. The comparison itself is unchanged.
 */
export function useSortable<T extends object>(
  data: T[],
  defaultKey: keyof T & string,
  defaultDir: 'asc' | 'desc' = 'desc',
) {
  const [sortKey, setSortKey] = useState<string>(defaultKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(defaultDir);

  function handleSort(key: string) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sorted = useMemo(() => {
    const read = (row: T): unknown => (row as Record<string, unknown>)[sortKey];
    return [...data].sort((a, b) => {
      const av = read(a) as string | number;
      const bv = read(b) as string | number;
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir]);

  return { sorted, sortKey, sortDir, handleSort };
}

/* ─── Layout shells ──────────────────────────────────────────── */

export function KpiCard({
  label,
  value,
  accent = false,
  warning = false,
  danger = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  const valueColor = danger
    ? 'text-red-600'
    : warning
      ? 'text-amber-600'
      : accent
        ? 'text-[#307c4c]'
        : 'text-slate-800';
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col gap-1 transition-shadow duration-300 hover:shadow-md">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${valueColor}`}>{value}</p>
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
      <span className="w-1 h-4 bg-[#307c4c] rounded-full inline-block shrink-0" />
      {children}
    </h2>
  );
}

export function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">{title}</p>
      {children}
    </div>
  );
}

/**
 * The Export to Excel button, in the analytics header beside Refresh.
 *
 * In the kit rather than inline in the page so it can be rendered at /dev-preview/my-analytics
 * and actually looked at: the page behind it is SSO-gated, and the last two layout bugs on
 * this surface shipped because nothing that runs locally can see that a control is squashed at
 * phone width. The three states a reader cares about -- ready, working, nothing to export --
 * are all props, so the preview can show them side by side.
 */
export function ExportToExcelButton({
  onClick,
  isExporting,
  disabled,
  title,
}: {
  onClick: () => void;
  isExporting: boolean;
  disabled: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-white bg-[#307c4c] border border-[#307c4c] rounded-md hover:bg-[#2a6b42] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg
        className={`w-3.5 h-3.5 shrink-0 ${isExporting ? 'animate-pulse' : ''}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M12 3v13m0 0l-4-4m4 4l4-4"
        />
      </svg>
      <span className="hidden sm:inline">
        {isExporting ? 'Preparing\u2026' : 'Export to Excel'}
      </span>
      <span className="sm:hidden">{isExporting ? '\u2026' : 'Export'}</span>
    </button>
  );
}

/**
 * "Closed in SAP" — the PO has left `sap_open_po_master` since it was expedited.
 *
 * Without this, a goods-received PO renders as a row of dashes and reads as a bug. It usually
 * is not: the master keeps only POs that are still open, so once a PO is received the live
 * columns are simply gone. Work expedited from 14 Sep 2026 carries a dispatch-time snapshot and
 * still reads correctly; lines dispatched before that have nothing left to show, which is what
 * `detailLost` says out loud rather than leaving the reader to guess.
 */
export function ClosedPoBadge({ detailLost }: { detailLost: boolean }) {
  return (
    <span
      title={
        detailLost
          ? 'This PO is no longer open in SAP, and it was expedited before the tool kept a copy of the line detail, so the original description, quantity and value cannot be recovered.'
          : 'This PO is no longer open in SAP — goods received, cancelled or otherwise closed. The figures shown are the ones captured when it was expedited.'
      }
      className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500"
    >
      Closed in SAP
      {detailLost && <span className="font-normal text-slate-400">· detail not captured</span>}
    </span>
  );
}

/** The three fields {@link closedPoState} reads. Both drill-down line shapes carry them. */
export interface ClosedPoLine {
  in_sap: boolean;
  item_description: string | null;
  open_qty: number | null;
}

/**
 * Whether a group of lines has left SAP, and whether anything is left to show for it.
 *
 * `closed` requires EVERY line to be gone: one still-open line means the PO is still live and a
 * badge would be a lie. `detailLost` is the narrower case -- closed AND nothing captured -- which
 * only happens for work dispatched before the snapshot landed on 14 Sep 2026. After that the
 * description, quantity and value survive the PO closing, so the group is marked closed but not
 * lost, and the figures on screen are the ones captured at dispatch.
 */
export function closedPoState(lines: ClosedPoLine[]): { closed: boolean; detailLost: boolean } {
  if (lines.length === 0) return { closed: false, detailLost: false };
  const closed = lines.every((l) => !l.in_sap);
  return {
    closed,
    detailLost: closed && lines.every((l) => !l.item_description && l.open_qty == null),
  };
}
