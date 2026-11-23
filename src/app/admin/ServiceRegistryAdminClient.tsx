'use client';

/* Admin → RRSM → Service Registry: move RRSM's rows into the shared registry (preview first),
   and switch registry approvals on or off. */

import { useEffect, useState } from 'react';
import { CheckCircle2, Eye, Loader2, Play, ShieldCheck, ShieldOff } from 'lucide-react';
import {
  previewRegistryMigration,
  runRegistryMigration,
  setServiceRegistryApprovals,
  type MigrationSummary,
} from '@/app/actions/rrsm/registry-migration';

const BRAND = '#307c4c';
const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 });

export default function ServiceRegistryAdminClient() {
  const [summary, setSummary] = useState<MigrationSummary | null>(null);
  const [busy, setBusy] = useState<'preview' | 'run' | 'approvals' | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'new' | 'merge' | 'confirm'>('all');

  async function preview() {
    setBusy('preview');
    setError('');
    const s = await previewRegistryMigration();
    if (!s.ok) setError(s.error ?? 'The preview failed.');
    setSummary(s);
    setBusy(null);
  }
  /* The first preview loads on open; the button re-runs it. */
  useEffect(() => {
    let live = true;
    void previewRegistryMigration().then((s) => {
      if (!live) return;
      setSummary(s);
      if (!s.ok) setError(s.error ?? 'The preview failed.');
    });
    return () => {
      live = false;
    };
  }, []);

  async function run() {
    if (
      !window.confirm(
        'Move these rows into the Service Registry now? New items are created in the Catalog and RRSM rows are linked to them. Rows already linked are skipped.',
      )
    )
      return;
    setBusy('run');
    setError('');
    const s = await runRegistryMigration();
    if (!s.ok) setError(s.error ?? 'The migration failed.');
    setSummary(s);
    setBusy(null);
  }

  async function toggleApprovals(on: boolean) {
    setBusy('approvals');
    const r = await setServiceRegistryApprovals(on);
    if (!r.ok) setError(r.error ?? 'Could not change approvals.');
    else setSummary((s) => (s ? { ...s, approvalsEnabled: on } : s));
    setBusy(null);
  }

  const items = (summary?.items ?? []).filter((i) =>
    filter === 'new'
      ? !i.existingCode
      : filter === 'merge'
        ? !!i.existingCode
        : filter === 'confirm'
          ? i.rateToConfirm
          : true,
  );

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-bold text-slate-900">Service Registry</h2>
        <p className="mt-1 max-w-3xl text-[13px] text-slate-500">
          RRSM and the Catalog share one Service Registry, kept in the Catalog&apos;s database. This
          moves RRSM&apos;s rental lines (as units of an item) and recurrent services into it.
          Matching items merge by vendor code and name; the rest are created new.
        </p>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2.5">
          {summary?.approvalsEnabled ? (
            <ShieldCheck className="h-5 w-5 text-[#307c4c]" />
          ) : (
            <ShieldOff className="h-5 w-5 text-amber-600" />
          )}
          <div>
            <p className="text-[13.5px] font-semibold text-slate-800">
              Approvals are {summary?.approvalsEnabled ? 'on' : 'paused'}
            </p>
            <p className="text-[12px] text-slate-500">
              {summary?.approvalsEnabled
                ? 'Higher-value items wait for the country approver, in both tools.'
                : 'Items added or changed in either tool are Active straight away.'}
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy !== null || !summary}
          onClick={() => void toggleApprovals(!summary?.approvalsEnabled)}
          className="rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:border-[#307c4c] disabled:opacity-50"
        >
          {busy === 'approvals'
            ? 'Saving…'
            : summary?.approvalsEnabled
              ? 'Pause approvals'
              : 'Switch approvals on'}
        </button>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h3 className="text-[13.5px] font-semibold text-slate-800">
            Move RRSM into the registry
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void preview()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:border-[#307c4c] disabled:opacity-50"
            >
              {busy === 'preview' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Preview
            </button>
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy !== null || !summary?.ok || !summary.items.length}
              className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
              style={{ background: BRAND }}
            >
              {busy === 'run' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Migrate
            </button>
          </div>
        </div>

        {summary?.done && (
          <div className="m-4 rounded-lg border border-[#a9d3bb] bg-[#e6f1ea] px-3.5 py-2.5 text-[13px] text-[#1d4f31]">
            <CheckCircle2 className="mr-1.5 inline h-4 w-4" />
            Done: {summary.done.created} items created, {summary.done.linked} RRSM rows linked
            {summary.done.failed.length ? `, ${summary.done.failed.length} failed:` : '.'}
            {summary.done.failed.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-red-700">
                {summary.done.failed.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {summary?.ok && (
          <>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2 text-left font-semibold">Country</th>
                  <th className="px-3 py-2 text-right font-semibold">Rental lines → items</th>
                  <th className="px-3 py-2 text-right font-semibold">Recurrent items</th>
                  <th className="px-3 py-2 text-right font-semibold">Merge</th>
                  <th className="px-3 py-2 text-right font-semibold">New</th>
                  <th className="px-4 py-2 text-right font-semibold">Rate to confirm</th>
                </tr>
              </thead>
              <tbody>
                {summary.countries.map((c) => (
                  <tr key={c.code} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-semibold text-slate-700">{c.code}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {c.rentalLines} → {c.rentalItems}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{c.recurrentItems}</td>
                    <td className="px-3 py-2 text-right font-mono">{c.merged}</td>
                    <td className="px-3 py-2 text-right font-mono">{c.created}</td>
                    <td className="px-4 py-2 text-right font-mono">{c.rateToConfirm}</td>
                  </tr>
                ))}
                {!summary.countries.length && (
                  <tr>
                    <td colSpan={6} className="px-4 py-5 text-center text-slate-400">
                      Everything in RRSM is already in the registry.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {summary.skipped.length > 0 && (
              <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-amber-800">
                Not moved:{' '}
                {summary.skipped.map((s) => `${s.kind} #${s.id} (${s.reason})`).join(', ')}. Give
                them a vendor code in RRSM, then run again.
              </p>
            )}

            {summary.items.length > 0 && (
              <div className="border-t border-slate-100">
                <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                  {(
                    [
                      ['all', 'All items'],
                      ['new', 'New'],
                      ['merge', 'Merging'],
                      ['confirm', 'Rate to confirm'],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setFilter(k)}
                      className={`rounded-full border px-3 py-1 text-[12px] font-medium ${
                        filter === k
                          ? 'border-[#307c4c] bg-[#307c4c] text-white'
                          : 'border-slate-200 text-slate-600'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="max-h-[28rem] overflow-auto">
                  <table className="w-full text-[12.5px]">
                    <thead className="sticky top-0 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-2 text-left font-semibold">Item</th>
                        <th className="px-3 py-2 text-left font-semibold">Supplier</th>
                        <th className="px-3 py-2 text-left font-semibold">Category</th>
                        <th className="px-3 py-2 text-right font-semibold">Rate</th>
                        <th className="px-3 py-2 text-right font-semibold">Units</th>
                        <th className="px-4 py-2 text-left font-semibold">Goes to</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((i, n) => (
                        <tr key={n} className="border-t border-slate-100">
                          <td className="px-4 py-1.5 text-slate-800">
                            {i.itemName}
                            <span className="ml-1.5 text-[10.5px] text-slate-400">
                              {i.countryCode} · {i.type}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 text-slate-600">{i.supplierName}</td>
                          <td className="px-3 py-1.5 text-slate-500">
                            {i.category.category}
                            {i.category.subcategory ? ` / ${i.category.subcategory}` : ''}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">
                            {i.rateToConfirm ? (
                              <span className="rounded bg-amber-50 px-1 text-amber-800">
                                to confirm
                              </span>
                            ) : (
                              `${money.format(i.unitPrice)} / ${i.uomName}`
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono">{i.units || ''}</td>
                          <td className="px-4 py-1.5">
                            {i.existingCode ? (
                              <span className="font-mono text-[#1d4f31]">
                                merge into {i.existingCode}
                              </span>
                            ) : (
                              <span className="text-slate-500">new item</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
        {!summary && (
          <p className="px-4 py-5 text-[13px] text-slate-400">Reading both databases…</p>
        )}
      </section>
    </div>
  );
}
