'use client';

import { useState } from 'react';
import { Icon } from './CatalogManagerUI';
import { decideCatalogEntry, bulkDecideEntries } from '@/app/actions/catalog-manager';
import type { CatalogEntry } from '@/types/catalog-manager';
import { fmtMoney, fmtUsd } from '@/lib/catalog-manager-utils';

export default function DecisionDialog({
  open, decision, entry, bulk, onClose, onDone,
}: {
  open: boolean;
  decision: 'approve' | 'reject';
  entry: CatalogEntry;
  bulk?: { supplier: string; entries: CatalogEntry[] };
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<'reject' | 'revise'>('reject');
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) return null;
  const approving = decision === 'approve';
  const isBulk = !!bulk && bulk.entries.length > 1;
  const bulkTotalUsd = bulk ? bulk.entries.reduce((s, e) => s + e.usd_equivalent, 0) : 0;

  async function confirm() {
    if (!comment.trim()) { setErr('A comment is required to record this decision.'); return; }
    setBusy(true);
    try {
      if (bulk) {
        await bulkDecideEntries(bulk.entries.map((e) => e.id), comment.trim());
      } else {
        await decideCatalogEntry(entry.id, approving ? 'approve' : mode, comment.trim());
      }
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center p-4 pt-[8vh]">
      <button aria-label="Close" className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
          <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${approving ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-red-50 text-red-600'}`}>
            <Icon name={approving ? 'approve' : 'x'} className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900">{isBulk ? `Approve ${bulk!.entries.length} entries` : approving ? 'Approve catalog entry' : 'Reject or request revision'}</h2>
            <p className="truncate text-[12.5px] text-slate-500">{isBulk ? bulk!.supplier : `${entry.code} · ${entry.supplier_name}`}</p>
          </div>
        </div>

        <div className="px-5 py-4">
          {isBulk ? (
            <div className="mb-3 max-h-48 overflow-y-auto rounded-lg border border-slate-200">
              {bulk!.entries.map((e, i) => (
                <div key={e.id} className={`flex items-center gap-2 px-3 py-2 text-[12.5px] ${i ? 'border-t border-slate-100' : ''}`}>
                  <span className="font-mono text-[11px] text-slate-400">{e.code}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-700">{e.commodity || e.item_name}</span>
                  <span className="shrink-0 font-mono font-semibold text-slate-900">{fmtMoney(e.unit_price, e.currency_code)} <span className="font-sans text-[11px] font-normal text-slate-400">{e.currency_code}</span></span>
                </div>
              ))}
            </div>
          ) : (
          <div className="mb-3 flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold text-slate-900">{entry.commodity || entry.item_name}</div>
              <div className="text-[12px] text-slate-400">{entry.category_name} · {entry.country_flag} {entry.country_name}</div>
            </div>
            <div className="ml-3 shrink-0 text-right">
              <div className="font-mono text-base font-bold text-slate-900">{fmtMoney(entry.unit_price, entry.currency_code)}</div>
              <div className="text-[11px] text-slate-400">{entry.currency_code} / {entry.uom_name} · ≈${fmtUsd(entry.usd_equivalent)}</div>
            </div>
          </div>
          )}

          {isBulk && (
            <div className="mb-3 flex items-center justify-between text-[12.5px] text-slate-500">
              <span>{bulk!.entries.length} lines · combined</span>
              <span className="font-mono font-bold text-slate-900">≈ USD {fmtUsd(bulkTotalUsd)}</span>
            </div>
          )}

          {!approving && !isBulk && (
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-1">
              {([['reject', 'Reject', 'x'], ['revise', 'Request revision', 'revise']] as const).map(([v, label, ic]) => (
                <button key={v} onClick={() => setMode(v)} className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-[13px] font-semibold ${mode === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>
                  <Icon name={ic} className="h-3.5 w-3.5" />{label}
                </button>
              ))}
            </div>
          )}

          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-slate-600">{approving ? 'Approval comment' : 'Reason (shared with submitter)'}<span className="ml-0.5 text-red-500">*</span></span>
            <textarea
              value={comment}
              onChange={(e) => { setComment(e.target.value); setErr(null); }}
              placeholder={isBulk ? 'e.g. Rate card reviewed against quotation — all lines within benchmark.' : approving ? 'e.g. Within benchmark for the region — approved.' : 'Explain what needs to change…'}
              className={`min-h-[88px] w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#307c4c]/20 ${err ? 'border-red-300' : 'border-slate-300 focus:border-[#307c4c]'}`}
            />
            {err && <span className="text-[11.5px] font-medium text-red-600">{err}</span>}
          </label>
        </div>

        <div className="flex justify-end gap-2.5 px-5 pb-5">
          <button onClick={onClose} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Cancel</button>
          <button
            onClick={confirm}
            disabled={busy}
            className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50 ${approving ? 'bg-[#307c4c] hover:bg-[#2b6f44]' : 'bg-red-600 hover:bg-red-700'}`}
          >
            <Icon name={approving ? 'check' : mode === 'revise' ? 'revise' : 'x'} className="h-4 w-4" />
            {isBulk ? `Approve all ${bulk!.entries.length}` : approving ? 'Approve & activate' : mode === 'revise' ? 'Send back for revision' : 'Reject entry'}
          </button>
        </div>
      </div>
    </div>
  );
}
