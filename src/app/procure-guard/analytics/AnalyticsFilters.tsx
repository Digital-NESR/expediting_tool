'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { formatProcureGuardStatusLabel } from '@/lib/procureGuard-utils';
import type { ProcureGuardAnalyticsRequest } from '@/types/procureGuard';

/**
 * Filters for the analytics page.
 *
 * Everything on that page is recomputed from one filtered array -- the KPI cards, the vendor
 * table, the breakdowns, the monthly trend, the review aging and the open-request list -- so a
 * filter is applied in exactly one place and the whole page follows. Keeping `applyAnalyticsFilters`
 * pure and separate from the bar is what lets that promise be tested rather than asserted.
 *
 * Client-side on purpose: the page already ships every request row to the browser for its table,
 * so filtering in place is instant and costs no round trip. The moment that stops being true --
 * if the row set grows past what is sensible to send -- this is the seam to move server-side.
 */

export type RequestScope = 'all' | 'adhoc' | 'advance';

/** Named windows over `created_at`. `custom` reads `from`/`to`; `all` ignores both. */
export type DatePreset =
  | 'all'
  | 'last7'
  | 'last30'
  | 'last90'
  | 'this-month'
  | 'last-month'
  | 'this-year'
  | 'custom'
  | 'tree';

/**
 * A node in the Year > Quarter > Month > Day tree, as a string key.
 *
 *   Y:2026   Q:2026-2   M:2026-05   D:2026-05-24
 *
 * A row is kept when ANY of its four keys is ticked, which is what makes the levels behave the
 * way the tree looks: ticking a year takes everything under it, ticking two months takes both,
 * and mixing levels is a union rather than an intersection. The keys come from the row's own
 * date, so no range arithmetic is involved and a day cannot fall between two nodes.
 */
export type DateNodeKey = string;

/** The four keys a date belongs to, outermost first. Empty when the date is unreadable. */
export function dateNodeKeys(iso: string): DateNodeKey[] {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return [];
  const y = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return [
    `Y:${y}`,
    `Q:${y}-${Math.floor(d.getMonth() / 3) + 1}`,
    `M:${y}-${mm}`,
    `D:${y}-${mm}-${String(d.getDate()).padStart(2, '0')}`,
  ];
}

export interface AnalyticsFilterState {
  scope: RequestScope;
  datePreset: DatePreset;
  /** `YYYY-MM-DD`, inclusive. Only read when `datePreset` is `custom`. */
  from: string;
  to: string;
  /** Ticked tree nodes. Only read when `datePreset` is `tree`; empty means no date filter. */
  dateNodes: DateNodeKey[];
  statuses: string[];
  priorities: string[];
  countries: string[];
  requesters: string[];
  vendorQuery: string;
  /** USD-equivalent bounds, as typed. Blank means unbounded. */
  minAmount: string;
  maxAmount: string;
}

export const EMPTY_FILTERS: AnalyticsFilterState = {
  scope: 'all',
  datePreset: 'all',
  from: '',
  to: '',
  dateNodes: [],
  statuses: [],
  priorities: [],
  countries: [],
  requesters: [],
  vendorQuery: '',
  minAmount: '',
  maxAmount: '',
};

const DATE_PRESETS: Array<{ value: DatePreset; label: string }> = [
  { value: 'all', label: 'All time' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'last30', label: 'Last 30 days' },
  { value: 'last90', label: 'Last 90 days' },
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'this-year', label: 'This year' },
  { value: 'custom', label: 'Custom range…' },
  { value: 'tree', label: 'Pick by year / quarter / month…' },
];

/** Local midnight, so a date typed by a user means that whole day in their own timezone. */
function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function endOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1;
}

/**
 * The window a preset covers, as millisecond bounds.
 *
 * `now` is a parameter rather than `Date.now()` so a test can pin it: a relative window that
 * silently depends on the wall clock is the kind of thing that passes in the morning and fails
 * at midnight.
 */
export function dateRangeFor(
  filters: Pick<AnalyticsFilterState, 'datePreset' | 'from' | 'to'>,
  now: Date,
): { fromMs: number; toMs: number } {
  const everything = { fromMs: Number.NEGATIVE_INFINITY, toMs: Number.POSITIVE_INFINITY };
  switch (filters.datePreset) {
    case 'all':
    /* The tree ticks nodes rather than spanning a range, so it is applied separately and leaves
       the range unbounded here. Returning a range would filter the same rows twice. */
    case 'tree':
      return everything;
    case 'last7':
      return { fromMs: startOfDay(new Date(now.getTime() - 6 * 86_400_000)), toMs: endOfDay(now) };
    case 'last30':
      return { fromMs: startOfDay(new Date(now.getTime() - 29 * 86_400_000)), toMs: endOfDay(now) };
    case 'last90':
      return { fromMs: startOfDay(new Date(now.getTime() - 89 * 86_400_000)), toMs: endOfDay(now) };
    case 'this-month':
      return {
        fromMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime(),
        toMs: endOfDay(now),
      };
    case 'last-month':
      return {
        fromMs: new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime(),
        toMs: new Date(now.getFullYear(), now.getMonth(), 1).getTime() - 1,
      };
    case 'this-year':
      return { fromMs: new Date(now.getFullYear(), 0, 1).getTime(), toMs: endOfDay(now) };
    case 'custom': {
      // A half-filled custom range still filters on the end that was given.
      const from = filters.from ? new Date(`${filters.from}T00:00:00`) : null;
      const to = filters.to ? new Date(`${filters.to}T00:00:00`) : null;
      return {
        fromMs: from && !Number.isNaN(from.getTime()) ? startOfDay(from) : everything.fromMs,
        toMs: to && !Number.isNaN(to.getTime()) ? endOfDay(to) : everything.toMs,
      };
    }
    default:
      return everything;
  }
}

const norm = (v: string | null | undefined) => (v ?? '').trim() || 'Unspecified';

/** Every filter, applied in one pass. Pure: same rows and filters in, same rows out. */
export function applyAnalyticsFilters(
  requests: ProcureGuardAnalyticsRequest[],
  filters: AnalyticsFilterState,
  now: Date = new Date(),
): ProcureGuardAnalyticsRequest[] {
  const { fromMs, toMs } = dateRangeFor(filters, now);
  const vendorQuery = filters.vendorQuery.trim().toLowerCase();
  const min = filters.minAmount.trim() === '' ? null : Number(filters.minAmount);
  const max = filters.maxAmount.trim() === '' ? null : Number(filters.maxAmount);
  const statuses = new Set(filters.statuses);
  const priorities = new Set(filters.priorities);
  const countries = new Set(filters.countries);
  const requesters = new Set(filters.requesters);

  const nodes = filters.datePreset === 'tree' ? new Set(filters.dateNodes) : null;

  return requests.filter((r) => {
    if (filters.scope !== 'all' && r.request_type !== filters.scope) return false;

    if (nodes && nodes.size) {
      // No keys means an unreadable date, which cannot belong to any node that was ticked.
      if (!dateNodeKeys(r.created_at).some((k) => nodes.has(k))) return false;
    }

    if (fromMs !== Number.NEGATIVE_INFINITY || toMs !== Number.POSITIVE_INFINITY) {
      const createdMs = new Date(r.created_at).getTime();
      // A row with an unreadable date is kept only when no date filter is asked for, so it can
      // never silently inflate a window it may not belong to.
      if (Number.isNaN(createdMs)) return false;
      if (createdMs < fromMs || createdMs > toMs) return false;
    }

    if (statuses.size && !statuses.has(r.status)) return false;
    if (priorities.size && !priorities.has(norm(r.priority))) return false;
    if (countries.size && !countries.has(norm(r.country))) return false;
    if (requesters.size && !requesters.has(r.requested_by_email)) return false;
    if (vendorQuery && !r.vendor_name.toLowerCase().includes(vendorQuery)) return false;

    if (min !== null && Number.isFinite(min) && r.amount_usd < min) return false;
    if (max !== null && Number.isFinite(max) && r.amount_usd > max) return false;

    return true;
  });
}

/** How many filters are narrowing the view. Drives the "Clear all" affordance and its badge. */
export function activeFilterCount(filters: AnalyticsFilterState): number {
  let n = 0;
  if (filters.scope !== 'all') n += 1;
  // A tree with nothing ticked is not narrowing anything, so it does not count as active.
  if (filters.datePreset === 'tree') {
    if (filters.dateNodes.length) n += 1;
  } else if (filters.datePreset !== 'all') n += 1;
  if (filters.statuses.length) n += 1;
  if (filters.priorities.length) n += 1;
  if (filters.countries.length) n += 1;
  if (filters.requesters.length) n += 1;
  if (filters.vendorQuery.trim()) n += 1;
  if (filters.minAmount.trim() || filters.maxAmount.trim()) n += 1;
  return n;
}

/* ── the bar ─────────────────────────────────────────────────────────────── */

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [onClose]);
  return ref;
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  formatOption,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  formatOption?: (value: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  const summary =
    selected.length === 0 ? `All ${label.toLowerCase()}` : `${selected.length} selected`;

  return (
    <div ref={ref} className="relative">
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </label>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={options.length === 0}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors disabled:opacity-50 ${
          selected.length
            ? 'border-[#006B0C] bg-[#006B0C]/5 font-semibold text-[#006B0C]'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        <span className="truncate">{summary}</span>
        <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.3 7.3a1 1 0 011.4 0L10 10.6l3.3-3.3a1 1 0 111.4 1.4l-4 4a1 1 0 01-1.4 0l-4-4a1 1 0 010-1.4z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 z-40 mt-1 max-h-64 w-[260px] overflow-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="mb-1 w-full rounded px-2 py-1.5 text-left text-[12px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              Clear {label.toLowerCase()}
            </button>
          )}
          {options.map((opt) => (
            <label
              key={opt}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => toggle(opt)}
                className="h-3.5 w-3.5 accent-[#006B0C]"
              />
              <span className="truncate">{formatOption ? formatOption(opt) : opt}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

const QUARTER_MONTHS = ['Jan–Mar', 'Apr–Jun', 'Jul–Sep', 'Oct–Dec'];
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

interface TreeNode {
  key: DateNodeKey;
  label: string;
  count: number;
  children: TreeNode[];
}

/**
 * The Year > Quarter > Month > Day tree, built from the dates that actually occur.
 *
 * Only branches that contain requests are built, so the tree never offers an empty quarter and
 * its counts are the number of requests a tick would keep. Everything is sorted newest first,
 * because the question people bring to this page is almost always about recent months.
 */
export function buildDateTree(requests: ProcureGuardAnalyticsRequest[]): TreeNode[] {
  const years = new Map<number, Map<number, Map<number, Map<number, number>>>>();

  for (const r of requests) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getFullYear();
    const q = Math.floor(d.getMonth() / 3) + 1;
    const m = d.getMonth() + 1;
    const day = d.getDate();
    const quarters = years.get(y) ?? new Map();
    const months = quarters.get(q) ?? new Map();
    const days = months.get(m) ?? new Map();
    days.set(day, (days.get(day) ?? 0) + 1);
    months.set(m, days);
    quarters.set(q, months);
    years.set(y, quarters);
  }

  const total = (counts: Iterable<number>) => [...counts].reduce((a, b) => a + b, 0);
  const desc = (a: number, b: number) => b - a;

  return [...years.keys()].sort(desc).map((y) => {
    const quarters = years.get(y)!;
    const quarterNodes = [...quarters.keys()].sort(desc).map((q) => {
      const months = quarters.get(q)!;
      const monthNodes = [...months.keys()].sort(desc).map((m) => {
        const days = months.get(m)!;
        const mm = String(m).padStart(2, '0');
        const dayNodes = [...days.keys()].sort(desc).map((day) => ({
          key: `D:${y}-${mm}-${String(day).padStart(2, '0')}`,
          label: `${String(day).padStart(2, '0')} ${MONTH_NAMES[m - 1].slice(0, 3)}`,
          count: days.get(day)!,
          children: [],
        }));
        return {
          key: `M:${y}-${mm}`,
          label: MONTH_NAMES[m - 1],
          count: total(days.values()),
          children: dayNodes,
        };
      });
      return {
        key: `Q:${y}-${q}`,
        label: `Q${q} · ${QUARTER_MONTHS[q - 1]}`,
        count: monthNodes.reduce((a, n) => a + n.count, 0),
        children: monthNodes,
      };
    });
    return {
      key: `Y:${y}`,
      label: String(y),
      count: quarterNodes.reduce((a, n) => a + n.count, 0),
      children: quarterNodes,
    };
  });
}

function TreeBranch({
  node,
  depth,
  selected,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  selected: Set<DateNodeKey>;
  onToggle: (key: DateNodeKey) => void;
}) {
  /* Years open by default so the tree is useful on sight; everything deeper starts closed so a
     busy year does not unroll into hundreds of days. */
  const [open, setOpen] = useState(depth === 0);
  const isSelected = selected.has(node.key);
  const hasChildren = node.children.length > 0;

  return (
    <li>
      <div
        className="flex items-center gap-1 rounded hover:bg-slate-50"
        style={{ paddingLeft: depth * 14 }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? `Collapse ${node.label}` : `Expand ${node.label}`}
            aria-expanded={open}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          >
            <svg
              viewBox="0 0 20 20"
              fill="currentColor"
              className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`}
            >
              <path d="M7 5l6 5-6 5V5z" />
            </svg>
          </button>
        ) : (
          <span className="h-5 w-5 shrink-0" />
        )}
        <label className="flex flex-1 cursor-pointer items-center gap-2 py-1 text-[13px]">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => onToggle(node.key)}
            className="h-3.5 w-3.5 accent-[#006B0C]"
          />
          <span className={isSelected ? 'font-semibold text-[#006B0C]' : 'text-slate-700'}>
            {node.label}
          </span>
          <span className="ml-auto pr-2 text-[11px] tabular-nums text-slate-400">{node.count}</span>
        </label>
      </div>
      {open && hasChildren && (
        <ul>
          {node.children.map((child) => (
            <TreeBranch
              key={child.key}
              node={child}
              depth={depth + 1}
              selected={selected}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function DateTree({
  requests,
  selected,
  onChange,
}: {
  requests: ProcureGuardAnalyticsRequest[];
  selected: DateNodeKey[];
  onChange: (next: DateNodeKey[]) => void;
}) {
  const tree = useMemo(() => buildDateTree(requests), [requests]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const toggle = (key: DateNodeKey) =>
    onChange(selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  if (tree.length === 0)
    return (
      <p className="px-1 py-2 text-[13px] text-slate-400">No dated requests to choose from.</p>
    );

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[12px] text-slate-500">
          Tick any level. Ticking a year takes everything under it; ticking several is a union.
        </p>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[12px] font-semibold text-slate-500 hover:text-slate-700"
          >
            Clear {selected.length} selected
          </button>
        )}
      </div>
      <ul className="max-h-[320px] overflow-auto rounded-lg border border-slate-200 bg-white p-1">
        {tree.map((year) => (
          <TreeBranch
            key={year.key}
            node={year}
            depth={0}
            selected={selectedSet}
            onToggle={toggle}
          />
        ))}
      </ul>
    </div>
  );
}

export function AnalyticsFilterBar({
  requests,
  filters,
  onChange,
  resultCount,
}: {
  requests: ProcureGuardAnalyticsRequest[];
  filters: AnalyticsFilterState;
  onChange: (next: AnalyticsFilterState) => void;
  resultCount: number;
}) {
  const set = <K extends keyof AnalyticsFilterState>(key: K, value: AnalyticsFilterState[K]) =>
    onChange({ ...filters, [key]: value });

  /* Options come from the data, not a constant: a status or country nobody has used is noise in
     the list, and one that appears later shows up without a code change. */
  const options = useMemo(() => {
    const uniq = (values: Array<string | null | undefined>) =>
      [...new Set(values.map(norm))].sort((a, b) => a.localeCompare(b));
    return {
      statuses: uniq(requests.map((r) => r.status)),
      priorities: uniq(requests.map((r) => r.priority)),
      countries: uniq(requests.map((r) => r.country)),
      requesters: [...new Set(requests.map((r) => r.requested_by_email).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b),
      ),
    };
  }, [requests]);

  const requesterLabel = useMemo(() => {
    const byEmail = new Map<string, string>();
    for (const r of requests)
      if (!byEmail.has(r.requested_by_email))
        byEmail.set(r.requested_by_email, r.requested_by_name || r.requested_by_email);
    return (email: string) => byEmail.get(email) ?? email;
  }, [requests]);

  const active = activeFilterCount(filters);

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-slate-900">Filters</p>
          {active > 0 && (
            <span className="rounded-full bg-[#006B0C]/10 px-2 py-0.5 text-[11px] font-bold text-[#006B0C]">
              {active} active
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {resultCount.toLocaleString()} of {requests.length.toLocaleString()} requests
          </span>
          <button
            type="button"
            onClick={() => onChange(EMPTY_FILTERS)}
            disabled={active === 0}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
          >
            Clear all
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <label
            htmlFor="pg-date-preset"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Date
          </label>
          <select
            id="pg-date-preset"
            value={filters.datePreset}
            onChange={(e) => set('datePreset', e.target.value as DatePreset)}
            className={`w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors ${
              filters.datePreset !== 'all'
                ? 'border-[#006B0C] bg-[#006B0C]/5 font-semibold text-[#006B0C]'
                : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <MultiSelect
          label="Status"
          options={options.statuses}
          selected={filters.statuses}
          onChange={(v) => set('statuses', v)}
          formatOption={formatProcureGuardStatusLabel}
        />
        <MultiSelect
          label="Priority"
          options={options.priorities}
          selected={filters.priorities}
          onChange={(v) => set('priorities', v)}
        />
        <MultiSelect
          label="Country"
          options={options.countries}
          selected={filters.countries}
          onChange={(v) => set('countries', v)}
        />
        <MultiSelect
          label="Requester"
          options={options.requesters}
          selected={filters.requesters}
          onChange={(v) => set('requesters', v)}
          formatOption={requesterLabel}
        />

        <div>
          <label
            htmlFor="pg-vendor"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Vendor
          </label>
          <input
            id="pg-vendor"
            value={filters.vendorQuery}
            onChange={(e) => set('vendorQuery', e.target.value)}
            placeholder="Search vendor…"
            className={`w-full rounded-lg border px-3 py-2 text-[13px] outline-none transition-colors focus:border-[#006B0C] ${
              filters.vendorQuery.trim()
                ? 'border-[#006B0C] bg-[#006B0C]/5 text-[#006B0C]'
                : 'border-slate-200 bg-white text-slate-700'
            }`}
          />
        </div>
      </div>

      {filters.datePreset === 'tree' && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Year / Quarter / Month / Day
          </p>
          <DateTree
            requests={requests}
            selected={filters.dateNodes}
            onChange={(v) => set('dateNodes', v)}
          />
        </div>
      )}

      {(filters.datePreset === 'custom' || filters.minAmount || filters.maxAmount) && (
        <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          {filters.datePreset === 'custom' && (
            <>
              <div>
                <label
                  htmlFor="pg-from"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  From
                </label>
                <input
                  id="pg-from"
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => set('from', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-[#006B0C]"
                />
              </div>
              <div>
                <label
                  htmlFor="pg-to"
                  className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
                >
                  To
                </label>
                <input
                  id="pg-to"
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(e) => set('to', e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-[#006B0C]"
                />
              </div>
            </>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 gap-3 border-t border-slate-100 pt-3 sm:grid-cols-2 xl:grid-cols-4">
        <div>
          <label
            htmlFor="pg-min"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Min USD Eq.
          </label>
          <input
            id="pg-min"
            type="number"
            inputMode="decimal"
            min={0}
            value={filters.minAmount}
            onChange={(e) => set('minAmount', e.target.value)}
            placeholder="No minimum"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-[#006B0C]"
          />
        </div>
        <div>
          <label
            htmlFor="pg-max"
            className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400"
          >
            Max USD Eq.
          </label>
          <input
            id="pg-max"
            type="number"
            inputMode="decimal"
            min={0}
            value={filters.maxAmount}
            onChange={(e) => set('maxAmount', e.target.value)}
            placeholder="No maximum"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 outline-none focus:border-[#006B0C]"
          />
        </div>
      </div>
    </section>
  );
}
