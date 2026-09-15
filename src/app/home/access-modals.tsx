'use client';

/* ─── Access-request modals ──────────────────────────────────────
   The launcher used to carry three near-identical copies of this modal
   (PO Expediting, TI-TE, SourceGuide). They are one component now:
   `AccessRequestModal` picks its body from the per-tool config below.

   This module is loaded lazily by the launcher, so its markup — and the
   TI-TE country list — only reach the browser when a modal is opened. */

import { useState, useMemo, useTransition, useEffect } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { submitAccessRequest, getCountries } from '@/app/actions/access';
import { submitTiteAccessRequest } from '@/app/actions/tite';
import { submitSourceGuideAccessRequest } from '@/app/actions/sourceguide';
import { TITE_COUNTRY_VALUES, TITE_VIEW_ALL_COUNTRIES } from '@/lib/tite-constants';
import type { StatusTool } from './tools';

/* ─── TI-TE country list ────────────────────────────────────────
   Same list the in-app request overlay offers, from the one canonical source.
   The copy that used to live here had drifted — it was missing Indonesia. */

const TITE_COUNTRIES = [TITE_VIEW_ALL_COUNTRIES, ...TITE_COUNTRY_VALUES];

export interface RequesterIdentity {
  userEmail: string;
  displayName: string;
  jobTitle?: string;
  department?: string;
}

/* ─── Spinner ────────────────────────────────────────────────── */

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

/* ─── Shared overlay + panel ─────────────────────────────────── */

function ModalShell({
  onClose,
  panelClass,
  children,
}: {
  onClose: () => void;
  panelClass: string;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className={panelClass}>{children}</div>
    </div>
  );
}

/* ─── Per-tool configuration ─────────────────────────────────── */

interface RequestConfig {
  title: string;
  blurb: string;
  accent: string;
  /** 'countries' = country picker, 'simple' = a short confirm panel. */
  layout: 'countries' | 'simple';
  /** Tailwind cannot build these at runtime, so they are spelled out. */
  inputFocusClass?: string;
  checkboxClass?: string;
  checkboxStyle?: CSSProperties;
  submitEnabledClass?: string;
  submitEnabledStyle?: CSSProperties;
}

const REQUEST_CONFIG: Record<StatusTool, RequestConfig> = {
  po_expediting: {
    title: 'Request Access - PO Expediting',
    blurb: 'Select the countries you need access to. An admin will review your request.',
    accent: '#307c4c',
    layout: 'countries',
    inputFocusClass: 'focus:ring-[#307c4c]/20 focus:border-[#307c4c]',
    checkboxClass: 'text-[#307c4c] focus:ring-[#307c4c]/20',
    submitEnabledClass: 'bg-[#307c4c] hover:bg-[#307c4c]/90',
  },
  tite: {
    title: 'Request Access - TI-TE',
    blurb: 'Select the countries you need access to. An admin will review your request.',
    accent: '#006B0C',
    layout: 'countries',
    inputFocusClass: 'focus:ring-[#006B0C]/20 focus:border-[#006B0C]',
    checkboxStyle: { accentColor: '#006B0C' },
    submitEnabledClass: 'hover:opacity-90',
    submitEnabledStyle: { background: '#006B0C' },
  },
  sourceguide: {
    title: 'Request Access - SourceGuide',
    blurb: '',
    accent: '#2A7E4F',
    layout: 'simple',
  },
};

/* ─── Access request modal ───────────────────────────────────── */

export function AccessRequestModal({
  tool,
  identity,
  onClose,
  onSubmitted,
}: {
  tool: StatusTool;
  identity: RequesterIdentity;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const cfg = REQUEST_CONFIG[tool];

  const [countries, setCountries] = useState<string[]>(tool === 'tite' ? TITE_COUNTRIES : []);
  const [loadingCountries, setLoadingCountries] = useState(tool === 'po_expediting');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tool !== 'po_expediting') return;
    getCountries().then((c) => {
      setCountries(c);
      setLoadingCountries(false);
    });
  }, [tool]);

  const filtered = useMemo(
    () => countries.filter((c) => c.toLowerCase().includes(search.toLowerCase())),
    [countries, search],
  );

  function toggle(c: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(c)) {
        next.delete(c);
      } else {
        next.add(c);
      }
      return next;
    });
  }

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const { userEmail, displayName, jobTitle, department } = identity;
      const res =
        tool === 'po_expediting'
          ? await submitAccessRequest(userEmail, displayName, [...selected])
          : tool === 'tite'
            ? await submitTiteAccessRequest({
                userEmail,
                displayName,
                jobTitle: jobTitle ?? null,
                department: department ?? null,
                requestedCountries: [...selected],
              })
            : await submitSourceGuideAccessRequest({
                userEmail,
                displayName,
                jobTitle: jobTitle ?? null,
                department: department ?? null,
              });
      if (res.success) {
        await onSubmitted();
      } else {
        setError(res.error ?? 'Something went wrong.');
      }
    });
  }

  /* ── Simple confirm panel (SourceGuide) ── */
  if (cfg.layout === 'simple') {
    return (
      <ModalShell
        onClose={onClose}
        panelClass="relative z-10 w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl"
          style={{ background: '#2A7E4F18' }}
        >
          <Building2 className="h-6 w-6" style={{ color: cfg.accent }} />
        </div>
        <h2 className="mt-4 text-base font-bold text-slate-900">{cfg.title}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">
          SourceGuide lets you search NESR&apos;s approved suppliers across every country guide. An
          admin will review your request and grant access.
        </p>
        {error && (
          <p className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="mt-5 flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:opacity-90 disabled:opacity-60"
            style={{ background: cfg.accent }}
          >
            {isPending ? 'Submitting…' : 'Request Access'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="rounded-xl px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
        </div>
      </ModalShell>
    );
  }

  /* ── Country picker (PO Expediting, TI-TE) ── */
  const submitDisabled = isPending || selected.size === 0 || loadingCountries;

  return (
    <ModalShell
      onClose={onClose}
      panelClass="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md z-10 animate-in fade-in zoom-in-95 duration-200"
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-slate-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-tight">{cfg.title}</h2>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{cfg.blurb}</p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="px-6 py-4">
        <div className="relative mb-3">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="Search countries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none transition-colors placeholder-slate-400 ${cfg.inputFocusClass}`}
          />
        </div>

        {selected.size > 0 && (
          <p className="text-xs font-medium mb-2" style={{ color: cfg.accent }}>
            {selected.size} {selected.size === 1 ? 'country' : 'countries'} selected
          </p>
        )}

        <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg bg-white">
          {loadingCountries ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
              <Spinner />
              <span className="text-sm">Loading countries…</span>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No countries found.</p>
          ) : (
            <div className="p-1 space-y-0.5">
              {filtered.map((c) => (
                <label
                  key={c}
                  className="flex items-center gap-2.5 px-3 py-2 rounded cursor-pointer hover:bg-slate-50 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c)}
                    onChange={() => toggle(c)}
                    className={`w-4 h-4 rounded border-slate-300 cursor-pointer ${cfg.checkboxClass ?? ''}`}
                    style={cfg.checkboxStyle}
                  />
                  <span className="text-sm font-medium text-slate-700">{c}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-slate-100">
        {error && (
          <p className="text-sm text-red-600 mb-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={submitDisabled}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] shadow-sm ${
              submitDisabled
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                : cfg.submitEnabledClass
            }`}
            style={submitDisabled ? undefined : cfg.submitEnabledStyle}
          >
            {isPending ? 'Submitting…' : 'Submit Request'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ─── Pending Modal ──────────────────────────────────────────── */

export function PendingModal({
  onClose,
  onRefresh,
}: {
  onClose: () => void;
  onRefresh: () => Promise<void>;
}) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  }

  return (
    <ModalShell
      onClose={onClose}
      panelClass="relative bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm z-10 animate-in fade-in zoom-in-95 duration-200 p-6 text-center"
    >
      <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
        <svg
          className="w-7 h-7 text-amber-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.75}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <h2 className="text-base font-bold text-slate-900 mb-2">Access Request Pending</h2>
      <p className="text-sm text-slate-500 leading-relaxed mb-1">
        Your access request is pending admin approval.
      </p>
      <p className="text-sm text-slate-500 leading-relaxed mb-5">
        You will be notified once approved. You can also check back here.
      </p>

      <div className="flex flex-col gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-full py-2.5 rounded-xl text-sm font-semibold text-white bg-[#307c4c] hover:bg-[#307c4c]/90 disabled:opacity-60 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {refreshing && <Spinner />}
          {refreshing ? 'Checking…' : 'Refresh Status'}
        </button>
        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Close
        </button>
      </div>
    </ModalShell>
  );
}
