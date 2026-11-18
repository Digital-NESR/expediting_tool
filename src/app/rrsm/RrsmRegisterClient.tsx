'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · service register.

   Everything the country rents or receives on a recurring basis,
   whether or not it is in this month's cycle, and the suppliers
   behind it. Buyers and admins edit it here; Ops read it.

   Search runs over every column a person would type from memory —
   plate, description, supplier, cost center, service number —
   because "where is 23X70474" is the question this page answers
   most often.

   Each country's register is its own for now. The fields are the
   ones every country's sheets share, so standardising later is a
   matter of agreeing values, not of reshaping the table.
   ───────────────────────────────────────────────────────────── */

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Pencil, Plus, Search } from 'lucide-react';
import type { RegisterRow, RrsmScope } from '@/app/actions/rrsm/overview';
import type { RegisterEditorData, RegisterSupplier } from '@/app/actions/rrsm/register';
import { daysUntil } from '@/lib/rrsm/renewals';
import { OPERATING_MODEL_LABEL, type OperatingModel } from '@/lib/rrsm/register';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';
import { LineDrawer, SupplierDrawer } from './RegisterEditor';

type Filter = 'on' | 'off' | 'all';
type View = 'lines' | 'suppliers';

/** Which panel is open: a line (null id = new), a supplier (null = new), or nothing. */
type Panel =
  | { kind: 'line'; line: RegisterRow | null }
  | { kind: 'supplier'; supplier: RegisterSupplier | null; returnTo?: Panel }
  | null;

function isOnHire(r: RegisterRow): boolean {
  return r.active && !r.offHireDate;
}

export default function RrsmRegisterClient({
  scope,
  rows,
  editor,
  preview,
}: {
  scope: RrsmScope;
  rows: RegisterRow[];
  editor: RegisterEditorData;
  /** Dev preview: the forms check what is typed but send nothing. */
  preview?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('on');
  const [view, setView] = useState<View>('lines');
  const [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState('');
  const today = useMemo(() => new Date(), []);

  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [],
  );

  const counts = useMemo(() => {
    const on = rows.filter(isOnHire).length;
    return { on, off: rows.length - on, all: rows.length };
  }, [rows]);

  const needle = q.trim().toLowerCase();

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === 'on' && !isOnHire(r)) return false;
        if (filter === 'off' && isOnHire(r)) return false;
        if (!needle) return true;
        return [
          r.description,
          r.assetRef,
          r.supplierName,
          r.supplierCode,
          r.segment,
          r.costCenter,
          r.costCenterName,
          r.serviceNumber,
          r.ownerEmail,
        ].some((v) => v.toLowerCase().includes(needle));
      }),
    [rows, filter, needle],
  );

  const suppliers = useMemo(
    () =>
      editor.suppliers.filter(
        (s) =>
          !needle ||
          s.name.toLowerCase().includes(needle) ||
          s.code.toLowerCase().includes(needle) ||
          s.contactEmails.some((e) => e.includes(needle)),
      ),
    [editor.suppliers, needle],
  );

  function saved(message: string) {
    const back = panel?.kind === 'supplier' ? panel.returnTo : undefined;
    setPanel(back ?? null);
    setNotice(message);
    if (!preview) startTransition(() => router.refresh());
  }

  if (!scope.country) {
    return (
      <RrsmShell scope={scope} title="Service register">
        <RrsmNoCountry />
      </RrsmShell>
    );
  }
  const country = scope.country;
  const currency = country.currency;

  const lineUnder: Extract<Panel, { kind: 'line' }> | null =
    panel?.kind === 'line'
      ? panel
      : panel?.kind === 'supplier' && panel.returnTo?.kind === 'line'
        ? panel.returnTo
        : null;

  const actions = editor.canEdit ? (
    <>
      <button
        type="button"
        onClick={() => {
          setNotice('');
          setPanel({ kind: 'supplier', supplier: null });
        }}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 bg-white/10 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-white/20"
      >
        <Plus className="h-4 w-4" /> Add supplier
      </button>
      <button
        type="button"
        onClick={() => {
          setNotice('');
          setPanel({ kind: 'line', line: null });
        }}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1d4f31] shadow-sm transition-colors hover:bg-white/90"
      >
        <Plus className="h-4 w-4" /> Add line
      </button>
    </>
  ) : undefined;

  return (
    <RrsmShell
      scope={scope}
      title="Service register"
      subtitle={`Every rented asset and recurrent service in ${country.name}. ${counts.on} on hire, ${counts.off} off hire.${editor.canEdit ? '' : ' Buyers keep it up to date.'}`}
      actions={actions}
    >
      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-[#307c4c]/20 bg-[#307c4c]/[0.06] px-3.5 py-2.5 text-[13px] font-medium text-[#1d4f31]">
          <Check className="h-4 w-4 shrink-0" />
          <span className="flex-1">{notice}</span>
          {refreshing && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
      )}

      {/* ── view, search and filter ───────────────────────────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="inline-flex shrink-0 self-start rounded-lg border border-slate-200 bg-white p-0.5">
          {(
            [
              ['lines', `Lines ${counts.all}`],
              ['suppliers', `Suppliers ${editor.suppliers.filter((s) => s.linesHere).length}`],
            ] as [View, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                view === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={
              view === 'lines'
                ? 'Search plate, description, supplier, cost center, service number…'
                : 'Search supplier name, vendor code or contact…'
            }
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#307c4c]"
          />
        </label>
        {view === 'lines' && (
          <div className="inline-flex shrink-0 self-start rounded-lg border border-slate-200 bg-white p-0.5">
            {(
              [
                ['on', 'On hire'],
                ['off', 'Off hire'],
                ['all', 'All'],
              ] as [Filter, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                  filter === id ? 'bg-[#307c4c] text-white' : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                {label} <span className="opacity-70">{counts[id]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {view === 'lines' ? (
        !rows.length ? (
          <RrsmEmpty
            title="The register is empty"
            body={
              editor.canEdit
                ? 'Add the first line, or have the country’s register loaded from its workbook. Opening a month copies every line on hire from here.'
                : 'No service lines have been loaded for this country yet. A buyer adds them.'
            }
            action={
              editor.canEdit ? (
                <button
                  type="button"
                  onClick={() => setPanel({ kind: 'line', line: null })}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#307c4c] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#2b6f44]"
                >
                  <Plus className="h-4 w-4" /> Add line
                </button>
              ) : undefined
            }
          />
        ) : !shown.length ? (
          <RrsmEmpty title="Nothing matches" body="Try a shorter search, or switch the filter to All." />
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[60rem] text-[13px]">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5 text-left font-semibold">Asset / service</th>
                    <th className="px-2 py-2.5 text-left font-semibold">Supplier</th>
                    <th className="px-2 py-2.5 text-left font-semibold">Segment · cost center</th>
                    <th className="px-2 py-2.5 text-right font-semibold">Rate</th>
                    <th className="px-2 py-2.5 text-left font-semibold">Contract ends</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => {
                    const onHire = isOnHire(r);
                    const left = r.contractEndsOn
                      ? daysUntil(new Date(r.contractEndsOn + 'T00:00:00Z'), today)
                      : null;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => {
                          setNotice('');
                          setPanel({ kind: 'line', line: r });
                        }}
                        className="group cursor-pointer border-t border-slate-100 align-top transition-colors hover:bg-[#307c4c]/[0.03]"
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800">
                            {r.description}
                            {editor.canEdit && (
                              <Pencil className="h-3 w-3 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-slate-400">
                            {r.assetRef && <span>{r.assetRef}</span>}
                            {r.serviceNumber && <span>SN {r.serviceNumber}</span>}
                            <span>
                              {OPERATING_MODEL_LABEL[r.operatingModel as OperatingModel] ??
                                r.operatingModel}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="text-slate-700">{r.supplierName}</div>
                          <div className="font-mono text-[10.5px] text-slate-400">
                            {r.supplierCode}
                            {r.paymentTerms && ` · ${r.paymentTerms}`}
                          </div>
                        </td>
                        <td className="px-2 py-2.5">
                          <div className="text-slate-700">{r.segment}</div>
                          <div
                            className="font-mono text-[10.5px] text-slate-400"
                            title={r.costCenterName || undefined}
                          >
                            {r.costCenter}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12.5px] text-slate-700">
                          {r.rate === null ? (
                            <span className="text-amber-600">Not set</span>
                          ) : (
                            money.format(r.rate)
                          )}
                          <div className="text-[10.5px] text-slate-400">
                            {currency} / {r.uom}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2.5">
                          {r.contractEndsOn ? (
                            <>
                              <div className="text-slate-700">{r.contractEndsOn}</div>
                              {onHire && left !== null && left <= 90 && (
                                <div
                                  className={`text-[11px] font-semibold ${
                                    left < 0
                                      ? 'text-red-600'
                                      : left <= 30
                                        ? 'text-amber-600'
                                        : 'text-slate-500'
                                  }`}
                                >
                                  {left < 0
                                    ? `${-left} days ago`
                                    : left === 0
                                      ? 'Today'
                                      : `In ${left} days`}
                                </div>
                              )}
                            </>
                          ) : (
                            <span className="text-slate-300">No end date</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                              onHire ? 'bg-[#e6f1ea] text-[#1d4f31]' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {onHire ? 'On hire' : 'Off hire'}
                          </span>
                          {r.offHireDate && (
                            <div className="mt-1 text-[11px] text-slate-400">
                              since {r.offHireDate}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[12px] text-slate-500">
              Showing {shown.length} of {rows.length}
              {editor.canEdit && ' · click a line to edit it'}
            </div>
          </div>
        )
      ) : !editor.suppliers.length ? (
        <RrsmEmpty
          title="No suppliers yet"
          body={
            editor.canEdit
              ? 'Add a supplier before its first line: a line has to belong to one.'
              : 'A buyer adds suppliers as the register is built.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-[13px]">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 text-left font-semibold">Supplier</th>
                  <th className="px-2 py-2.5 text-left font-semibold">Contacts</th>
                  <th className="px-4 py-2.5 text-right font-semibold">
                    Lines in {country.name}
                  </th>
                </tr>
              </thead>
              <tbody>
                {suppliers.map((s) => (
                  <tr
                    key={s.code}
                    onClick={() => {
                      setNotice('');
                      setPanel({ kind: 'supplier', supplier: s });
                    }}
                    className="group cursor-pointer border-t border-slate-100 align-top transition-colors hover:bg-[#307c4c]/[0.03]"
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5 font-medium text-slate-800">
                        {s.name}
                        {!s.active && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                            Inactive
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[10.5px] text-slate-400">{s.code}</div>
                    </td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {s.contactEmails.length ? (
                        s.contactEmails.join(', ')
                      ) : (
                        <span className="text-amber-600">No contact email</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-700">{s.linesHere}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* The line form stays mounted under a supplier added from it, so what was typed into
          the line survives the detour. */}
      {lineUnder && (
        <LineDrawer
          key={lineUnder.line?.id ?? 'new'}
          countryCode={country.code}
          currency={currency}
          editor={editor}
          line={lineUnder.line}
          preview={preview}
          onClose={() => setPanel(null)}
          onSaved={saved}
          onAddSupplier={() =>
            setPanel({ kind: 'supplier', supplier: null, returnTo: lineUnder })
          }
        />
      )}
      {panel?.kind === 'supplier' && (
        <SupplierDrawer
          key={panel.supplier?.code ?? 'new'}
          countryCode={country.code}
          supplier={panel.supplier}
          canEdit={editor.canEdit}
          preview={preview}
          onClose={() => setPanel(panel.returnTo ?? null)}
          onSaved={saved}
        />
      )}
    </RrsmShell>
  );
}
