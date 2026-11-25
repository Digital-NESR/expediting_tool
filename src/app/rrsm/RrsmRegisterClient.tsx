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
import { Check, ChevronDown, ChevronRight, Loader2, Pencil, Plus, Search } from 'lucide-react';
import type { RegisterRow, RrsmScope } from '@/app/actions/rrsm/overview';
import type { RegisterEditorData, RegisterSupplier } from '@/app/actions/rrsm/register';
import { daysUntil } from '@/lib/rrsm/renewals';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';
import { LineDrawer, SupplierDrawer, type UnitRegistryItem } from './RegisterEditor';
import RegistryItemDrawer from './RegistryItemDrawer';
import type { RrsmRegistry } from '@/app/actions/rrsm/registry';
import type { RegistryFormRefs } from '@/lib/service-registry/registry';
import { rrsmUom } from '@/lib/service-registry/migrate-plan';
import type { CatalogEntry } from '@/types/catalog-manager';

type Filter = 'on' | 'off' | 'all';
type View = 'items' | 'lines' | 'suppliers';

/** Which panel is open: a line (null id = new), a supplier (null = new), or nothing. */
type Panel =
  | { kind: 'line'; line: RegisterRow | null; item?: CatalogEntry | null }
  | { kind: 'item'; item: CatalogEntry | null }
  | { kind: 'supplier'; supplier: RegisterSupplier | null; returnTo?: Panel }
  | null;

function isOnHire(r: RegisterRow): boolean {
  return r.active && !r.offHireDate;
}

/** A registry item as the unit editor needs it. */
function unitItem(e: CatalogEntry): UnitRegistryItem {
  return {
    code: e.code,
    itemName: e.item_name,
    supplierCode: e.supplier_code.replace(/^0+(?=\d)/, ''),
    supplierName: e.supplier_name,
    unitPrice: e.unit_price,
    uomCode: rrsmUom(e.uom_name ?? ''),
    rateToConfirm: e.rate_to_confirm === true,
    category: e.subcategory_name || e.category_name || '',
    serviceNumber: e.sap_service_number ?? '',
  };
}

export default function RrsmRegisterClient({
  scope,
  rows,
  editor,
  registry,
  preview,
  previewRefs,
}: {
  scope: RrsmScope;
  rows: RegisterRow[];
  editor: RegisterEditorData;
  /** The country's Service Registry items (shared with the Catalog). */
  registry: RrsmRegistry;
  previewRefs?: RegistryFormRefs;
  /** Dev preview: the forms check what is typed but send nothing. */
  preview?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startTransition] = useTransition();
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('on');
  const [category, setCategory] = useState('');
  const [view, setView] = useState<View>(registry.ok ? 'items' : 'lines');
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
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

  /* Every category on the register, with how many lines carry it, for the filter and for the
     editor's suggestions. */
  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) if (r.category) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const shown = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === 'on' && !isOnHire(r)) return false;
        if (filter === 'off' && isOnHire(r)) return false;
        if (category && r.category !== category) return false;
        if (!needle) return true;
        return [
          r.category,
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
    [rows, filter, category, needle],
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

  const unitsOf = useMemo(() => {
    const m = new Map<string, RegisterRow[]>();
    for (const r of rows)
      if (r.registryCode)
        (m.get(r.registryCode) ?? m.set(r.registryCode, []).get(r.registryCode)!).push(r);
    return m;
  }, [rows]);
  const unlinked = useMemo(() => rows.filter((r) => !r.registryCode && isOnHire(r)), [rows]);
  const items = useMemo(
    () =>
      registry.items.filter(
        (e) =>
          !needle ||
          [
            e.item_name,
            e.supplier_name,
            e.supplier_code,
            e.code,
            e.category_name ?? '',
            e.subcategory_name ?? '',
          ].some((v) => v.toLowerCase().includes(needle)) ||
          (unitsOf.get(e.code) ?? []).some((u) =>
            [u.assetRef, u.costCenter, u.segment, u.description].some((v) =>
              v.toLowerCase().includes(needle),
            ),
          ),
      ),
    [registry.items, needle, unitsOf],
  );
  const itemByCode = useMemo(
    () => new Map(registry.items.map((e) => [e.code, e])),
    [registry.items],
  );

  function saved(message: string) {
    const back = panel?.kind === 'supplier' ? panel.returnTo : undefined;
    setPanel(back ?? null);
    setNotice(message);
    if (!preview) startTransition(() => router.refresh());
  }

  if (!scope.country) {
    return (
      <RrsmShell scope={scope} title="Service Registry">
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
      {registry.ok && (
        <button
          type="button"
          onClick={() => {
            setNotice('');
            setPanel({ kind: 'item', item: null });
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-semibold text-[#1d4f31] shadow-sm transition-colors hover:bg-white/90"
        >
          <Plus className="h-4 w-4" /> Add item
        </button>
      )}
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
      {!registry.ok && (
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
      )}
    </>
  ) : undefined;

  return (
    <RrsmShell
      scope={scope}
      title="Service Registry"
      subtitle={`What ${country.name} rents, shared with the Catalog: ${registry.items.length} items, ${counts.on} units on hire, ${counts.off} off hire.${editor.canEdit ? '' : ' Buyers keep it up to date.'}`}
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
              ...(registry.ok
                ? ([['items', `Items ${registry.items.length}`]] as [View, string][])
                : []),
              ['lines', `Units ${counts.all}`],
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
              view === 'suppliers'
                ? 'Search supplier name, vendor code or contact…'
                : view === 'items'
                  ? 'Search item, supplier, CAT code, category, plate, cost center…'
                  : 'Search plate, description, supplier, cost center, service number…'
            }
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-[#307c4c]"
          />
        </label>
        {view === 'lines' && categories.length > 0 && (
          <select
            aria-label="Category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="shrink-0 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-700 outline-none focus:border-[#307c4c]"
          >
            <option value="">All categories</option>
            {categories.map(([c, n]) => (
              <option key={c} value={c}>
                {c} ({n})
              </option>
            ))}
          </select>
        )}
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

      {!registry.ok && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          The Service Registry could not be reached, so this shows RRSM’s units only. Items come
          back when it is reachable again.
        </div>
      )}

      {view === 'items' ? (
        <>
          {unlinked.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
              {unlinked.length} unit{unlinked.length === 1 ? ' is' : 's are'} on hire but not under
              a registry item yet (see Units). They still run every month; ask the RRSM team to put
              them under an item.
            </div>
          )}
          {!items.length ? (
            <RrsmEmpty
              title={registry.items.length ? 'Nothing matches' : 'No registry items yet'}
              body={
                registry.items.length
                  ? 'Try a shorter search.'
                  : 'Add the first item, or have an admin move this country’s register in.'
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[56rem] text-[13px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-[10.5px] uppercase tracking-wider text-slate-400">
                      <th className="px-4 py-2.5 text-left font-semibold">Item</th>
                      <th className="px-2 py-2.5 text-left font-semibold">Supplier</th>
                      <th className="px-2 py-2.5 text-left font-semibold">Category</th>
                      <th className="px-2 py-2.5 text-left font-semibold">Cost center</th>
                      <th className="px-2 py-2.5 text-right font-semibold">Rate</th>
                      <th className="px-2 py-2.5 text-right font-semibold">On hire</th>
                      <th className="px-4 py-2.5 text-right font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((e) => {
                      const units = unitsOf.get(e.code) ?? [];
                      const onHire = units.filter(isOnHire).length;
                      const open = openItems.has(e.code);
                      return (
                        <ItemRows
                          key={e.code}
                          item={e}
                          units={units}
                          onHire={onHire}
                          open={open}
                          money={money}
                          canEdit={editor.canEdit}
                          onToggle={() =>
                            setOpenItems((s) => {
                              const n = new Set(s);
                              if (n.has(e.code)) n.delete(e.code);
                              else n.add(e.code);
                              return n;
                            })
                          }
                          onEdit={() => {
                            setNotice('');
                            setPanel({ kind: 'item', item: e });
                          }}
                          onAddUnit={() => {
                            setNotice('');
                            setPanel({ kind: 'line', line: null, item: e });
                          }}
                          onUnit={(u) => {
                            setNotice('');
                            setPanel({ kind: 'line', line: u, item: e });
                          }}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[12px] text-slate-500">
                Showing {items.length} of {registry.items.length} items · click an item to see its
                units
              </div>
            </div>
          )}
        </>
      ) : view === 'lines' ? (
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
          <RrsmEmpty
            title="Nothing matches"
            body="Try a shorter search, or switch the filter to All."
          />
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
                          {r.category && (
                            <div className="mb-0.5 text-[10.5px] font-semibold uppercase tracking-wider text-[#307c4c]">
                              {r.category}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 font-medium text-slate-800">
                            {r.description}
                            {editor.canEdit && (
                              <Pencil className="h-3 w-3 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                            )}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-x-2 font-mono text-[10.5px] text-slate-400">
                            {r.assetRef && <span>{r.assetRef}</span>}
                            {r.serviceNumber && <span>SN {r.serviceNumber}</span>}
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
                            className={`font-mono text-[10.5px] ${
                              r.costCenter === 'TBC'
                                ? 'font-semibold text-amber-600'
                                : 'text-slate-400'
                            }`}
                            title={
                              r.costCenter === 'TBC'
                                ? 'Cost center still to be confirmed'
                                : r.costCenterName || undefined
                            }
                          >
                            {r.costCenter === 'TBC' ? 'Cost center TBC' : r.costCenter}
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
                  <th className="px-4 py-2.5 text-right font-semibold">Lines in {country.name}</th>
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
          categories={categories.map(([c]) => c)}
          line={lineUnder.line}
          item={
            lineUnder.item
              ? unitItem(lineUnder.item)
              : lineUnder.line?.registryCode && itemByCode.get(lineUnder.line.registryCode)
                ? unitItem(itemByCode.get(lineUnder.line.registryCode)!)
                : null
          }
          preview={preview}
          onClose={() => setPanel(null)}
          onSaved={saved}
          onAddSupplier={() => setPanel({ kind: 'supplier', supplier: null, returnTo: lineUnder })}
        />
      )}
      {panel?.kind === 'item' && (
        <RegistryItemDrawer
          key={panel.item?.code ?? 'new-item'}
          countryCode={country.code}
          item={panel.item}
          preview={preview}
          previewRefs={previewRefs}
          onClose={() => setPanel(null)}
          onSaved={(message) => saved(message)}
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

/** One registry item, and its units when opened. */
function ItemRows({
  item,
  units,
  onHire,
  open,
  money,
  canEdit,
  onToggle,
  onEdit,
  onAddUnit,
  onUnit,
}: {
  item: CatalogEntry;
  units: RegisterRow[];
  onHire: number;
  open: boolean;
  money: Intl.NumberFormat;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onAddUnit: () => void;
  onUnit: (u: RegisterRow) => void;
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer border-t border-slate-100 align-top transition-colors hover:bg-[#307c4c]/[0.03]"
      >
        <td className="px-4 py-2.5">
          <div className="flex items-start gap-1.5">
            {open ? (
              <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            ) : (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            )}
            <div className="min-w-0">
              <div className="font-medium text-slate-800">{item.item_name}</div>
              <div className="font-mono text-[10.5px] text-slate-400">
                {item.code}
                {item.sap_service_number && ` · SN ${item.sap_service_number}`}
                {item.status !== 'Active' && ` · ${item.status}`}
              </div>
            </div>
          </div>
        </td>
        <td className="px-2 py-2.5">
          <div className="text-slate-700">{item.supplier_name}</div>
          <div className="font-mono text-[10.5px] text-slate-400">{item.supplier_code}</div>
        </td>
        <td className="px-2 py-2.5 text-slate-600">
          {item.category_name}
          {item.subcategory_name && (
            <div className="text-[11px] text-slate-400">{item.subcategory_name}</div>
          )}
        </td>
        {/* The cost centers this item's units are charged to (user request, 25 Nov 2026): one
            is shown as is; several show the first and how many more, all of them on hover. */}
        <td className="px-2 py-2.5 font-mono text-[11.5px] text-slate-600">
          <CostCenters units={units} />
        </td>
        <td className="whitespace-nowrap px-2 py-2.5 text-right font-mono text-[12.5px] text-slate-700">
          {item.rate_to_confirm ? (
            <span className="text-amber-600">To confirm</span>
          ) : (
            money.format(item.unit_price)
          )}
          <div className="text-[10.5px] text-slate-400">
            {item.currency_code} / {item.uom_name}
          </div>
        </td>
        <td className="px-2 py-2.5 text-right text-slate-700">
          {onHire}
          {units.length > onHire && (
            <span className="text-[11px] text-slate-400"> +{units.length - onHire} off</span>
          )}
        </td>
        <td
          className="whitespace-nowrap px-4 py-2.5 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          {canEdit && (
            <>
              <button
                type="button"
                onClick={onAddUnit}
                className="rounded px-2 py-1 text-[12px] font-semibold text-[#1d4f31] hover:bg-[#e6f1ea]"
              >
                + Unit
              </button>
              <button
                type="button"
                onClick={onEdit}
                className="rounded px-2 py-1 text-[12px] font-semibold text-slate-500 hover:bg-slate-100"
              >
                Edit item
              </button>
            </>
          )}
        </td>
      </tr>
      {open &&
        (units.length ? (
          units.map((u) => (
            <tr
              key={u.id}
              onClick={() => onUnit(u)}
              className="cursor-pointer border-t border-slate-50 bg-slate-50/40 text-[12.5px] hover:bg-[#307c4c]/[0.04]"
            >
              <td className="py-1.5 pl-11 pr-2 text-slate-700">
                {u.description}
                {u.assetRef && (
                  <span className="ml-1.5 font-mono text-[11px] text-slate-400">{u.assetRef}</span>
                )}
              </td>
              <td className="px-2 py-1.5 text-slate-500">{u.segment}</td>
              <td />
              <td className="px-2 py-1.5 font-mono text-[11.5px] text-slate-500">
                {u.costCenter === 'TBC' ? (
                  <span className="text-amber-600">Cost center TBC</span>
                ) : (
                  u.costCenter
                )}
              </td>
              <td className="px-2 py-1.5 text-right font-mono text-slate-600">
                {u.rate === null ? '—' : money.format(u.rate)}
              </td>
              <td className="px-2 py-1.5 text-right">
                <span
                  className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
                    isOnHire(u) ? 'bg-[#e6f1ea] text-[#1d4f31]' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {isOnHire(u) ? 'On hire' : 'Off hire'}
                </span>
              </td>
              <td />
            </tr>
          ))
        ) : (
          <tr className="border-t border-slate-50 bg-slate-50/40">
            <td colSpan={7} className="py-2 pl-11 text-[12.5px] text-slate-400">
              No units on hire under this item yet.
            </td>
          </tr>
        ))}
    </>
  );
}

/** An item's cost centers, from its units: TBC in amber, several as "first +N" with all on hover. */
function CostCenters({ units }: { units: RegisterRow[] }) {
  const all = [...new Set(units.map((u) => u.costCenter).filter(Boolean))].sort();
  if (!all.length) return <span className="text-slate-300">—</span>;
  const tbc = (cc: string) =>
    cc === 'TBC' ? <span className="text-amber-600">TBC</span> : <span>{cc}</span>;
  if (all.length === 1) return tbc(all[0]);
  return (
    <span title={all.join(', ')}>
      {tbc(all[0])}
      <span className="ml-1 font-sans text-[11px] text-slate-400">+{all.length - 1} more</span>
    </span>
  );
}
