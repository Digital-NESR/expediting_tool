'use client';

/*
 * Supplier library. Suppliers are searched in the SAP vendor master (SourceGuide supplier_avl) by
 * name or code, with filters; picking one opens a card laid out like PO Expediting's queue: the
 * supplier across the top, the email recipients down the side.
 *
 *   TO, dark green      supplier_avl.email, the vendor master's addresses
 *   TO, outlined green  added by the team here, remembered for this supplier in this country
 *   CC, locked          whoever is signed in; they are copied on everything they send
 *   CC, outlined green  added by the team here, remembered the same way
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import { Building2, Check, Loader2, Mail, Plus, Search, Trash2 } from 'lucide-react';
import EmployeeSearchInput, { type Employee } from '@/components/EmployeeSearchInput';
import {
  addRecipient,
  addToLibrary,
  hideMasterEmail,
  loadSupplier,
  removeFromLibrary,
  removeRecipient,
  restoreMasterEmail,
  searchLibrary,
  type CardResult,
} from '@/app/actions/safesign/library';
import type {
  EmailFilter,
  LibraryScope,
  StatusFilter,
  SupplierCard,
  SupplierRow,
} from '@/lib/safesign/suppliers';
import { BUTTON, BUTTON_SECONDARY, CARD, INPUT } from '../../components/SafeSignShell';

const PAGE = 25;
const SELECT = `${INPUT} py-1.5 text-xs`;

interface Props {
  countryName: string;
  categories: string[];
  initialScope: LibraryScope;
  initial: { rows: SupplierRow[]; total: number };
  librarySize: number;
  me: { name: string; email: string };
}

export default function SuppliersClient({ countryName, categories, initialScope, initial, librarySize, me }: Props) {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<LibraryScope>(initialScope);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<StatusFilter>('');
  const [email, setEmail] = useState<EmailFilter>('');
  const [rows, setRows] = useState<SupplierRow[]>(initial.rows);
  const [total, setTotal] = useState(initial.total);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(initial.rows[0]?.code ?? null);
  const first = useRef(true);
  const seq = useRef(0);

  /* Search again whenever the text or a filter changes; the text is debounced. */
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      const r = await searchLibrary({ q, scope, category, status, email, offset: 0 });
      if (mine !== seq.current) return;
      setRows(r.rows);
      setTotal(r.total);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [q, scope, category, status, email]);

  async function more() {
    setLoading(true);
    const r = await searchLibrary({ q, scope, category, status, email, offset: rows.length });
    setRows((prev) => [...prev, ...r.rows]);
    setTotal(r.total);
    setLoading(false);
  }

  function onLibraryChange(code: string, inLibrary: boolean) {
    setRows((prev) => prev.map((r) => (r.code === code ? { ...r, inLibrary } : r)));
  }

  return (
    <div className="space-y-4">
      {/* ── Search and filters ── */}
      <section className={`${CARD} p-4`}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))]">
          <label className="relative block">
            <span className="sr-only">Search suppliers</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Supplier name or SAP code"
              className={`${INPUT} pl-9`}
            />
          </label>
          <Filter label="Show" value={scope} onChange={(v) => setScope(v as LibraryScope)}>
            <option value="library">In {countryName} library ({librarySize})</option>
            <option value="bought">Bought from in {countryName}</option>
            <option value="all">All suppliers</option>
          </Filter>
          <Filter label="Category" value={category} onChange={setCategory}>
            <option value="">Any category</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Filter>
          <Filter label="SAP status" value={status} onChange={(v) => setStatus(v as StatusFilter)}>
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="blocked">Centrally blocked</option>
          </Filter>
          <Filter label="Email" value={email} onChange={(v) => setEmail(v as EmailFilter)}>
            <option value="">With or without email</option>
            <option value="with">Has an email</option>
            <option value="without">No email in SAP</option>
          </Filter>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* ── Results ── */}
        <section className={`${CARD} flex max-h-[720px] flex-col overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500">
            <span>
              {total.toLocaleString()} supplier{total === 1 ? '' : 's'}
            </span>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              {scope === 'library'
                ? `Nothing in the ${countryName} library matches. Switch Show to "Bought from" or "All suppliers" to add some.`
                : 'No supplier matches.'}
            </p>
          ) : (
            <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {rows.map((r) => (
                <li key={r.code}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.code)}
                    className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                      selected === r.code ? 'bg-[#307c4c]/10' : 'hover:bg-slate-50'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-800">{r.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
                        <span className="font-mono">{r.code}</span>
                        <span>
                          {r.emailCount} email{r.emailCount === 1 ? '' : 's'}
                        </span>
                        {r.blocked && <span className="font-semibold text-rose-600">Blocked</span>}
                      </span>
                    </span>
                    {r.inLibrary && (
                      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-[#307c4c]/10 px-2 py-0.5 text-[10px] font-semibold text-[#1d4f31]">
                        <Check className="h-3 w-3" /> Library
                      </span>
                    )}
                  </button>
                </li>
              ))}
              {rows.length < total && (
                <li className="p-3 text-center">
                  <button type="button" onClick={more} disabled={loading} className={BUTTON_SECONDARY}>
                    Load {Math.min(PAGE, total - rows.length)} more
                  </button>
                </li>
              )}
            </ul>
          )}
        </section>

        {/* ── The supplier ── */}
        {selected ? (
          <SupplierPanel key={selected} code={selected} me={me} countryName={countryName} onLibraryChange={onLibraryChange} />
        ) : (
          <div className={`${CARD} flex items-center justify-center p-10 text-sm text-slate-500`}>
            Pick a supplier to see who receives communications.
          </div>
        )}
      </div>
    </div>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        {children}
      </select>
    </label>
  );
}

function SupplierPanel({
  code,
  me,
  countryName,
  onLibraryChange,
}: {
  code: string;
  me: { name: string; email: string };
  countryName: string;
  onLibraryChange: (code: string, inLibrary: boolean) => void;
}) {
  const [card, setCard] = useState<SupplierCard | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [toInput, setToInput] = useState('');
  const [ccInput, setCcInput] = useState('');

  useEffect(() => {
    let live = true;
    loadSupplier(code).then((r) => {
      if (!live) return;
      if (r.success) setCard(r.card ?? null);
      else setError(r.error ?? 'Could not load the supplier.');
    });
    return () => {
      live = false;
    };
  }, [code]);

  function run(action: () => Promise<CardResult>, after?: () => void) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.success) {
        setError(r.error ?? 'Something went wrong.');
        return;
      }
      if (r.card !== undefined) {
        setCard(r.card);
        if (r.card) onLibraryChange(code, Boolean(r.card.vendorId && r.card.active));
      }
      after?.();
    });
  }

  if (card === undefined) {
    return (
      <div className={`${CARD} flex items-center justify-center p-10 text-sm text-slate-500`}>
        {error ?? <Loader2 className="h-5 w-5 animate-spin" />}
      </div>
    );
  }
  if (card === null) {
    return <div className={`${CARD} p-10 text-center text-sm text-slate-500`}>That supplier is no longer in the SAP vendor master.</div>;
  }

  const inLibrary = Boolean(card.vendorId && card.active);
  const addedTo = card.added.filter((c) => c.kind === 'to');
  const addedCc = card.added.filter((c) => c.kind === 'cc');
  const toCount = card.masterTo.length + addedTo.length;

  return (
    <section className={`${CARD} overflow-hidden`}>
      {/* Header: the supplier */}
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500">
            <Building2 className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold uppercase tracking-tight text-slate-900">{card.name}</h2>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono tracking-wider">{card.code}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  card.blocked ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {card.blockStatus || 'Active'}
              </span>
              {card.categories.map((c) => (
                <span key={c} className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {c}
                </span>
              ))}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {inLibrary ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => run(() => removeFromLibrary(code))}
              className={`${BUTTON_SECONDARY} text-xs`}
            >
              <Trash2 className="h-3.5 w-3.5" /> Remove from library
            </button>
          ) : (
            <button type="button" disabled={pending || toCount === 0} onClick={() => run(() => addToLibrary(code))} className={`${BUTTON} text-xs`}>
              <Plus className="h-3.5 w-3.5" /> Add to {countryName} library
            </button>
          )}
          <span className="text-[11px] text-slate-400">
            {inLibrary ? `In the ${countryName} library` : toCount === 0 ? 'Add a TO email first' : 'Not in the library yet'}
          </span>
        </div>
      </div>

      <div className="grid md:grid-cols-[minmax(0,1fr)_320px]">
        {/* Left: what this means */}
        <div className="space-y-4 px-5 py-4 text-sm text-slate-600">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="TO recipients" value={String(toCount)} />
            <Stat label="CC recipients" value={String(addedCc.length + 1)} />
            <Stat label="Communications" value={String(card.communications)} hint={countryName} />
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-500">
            <p className="mb-2 font-semibold text-slate-600">How recipients work</p>
            <p className="flex items-center gap-2">
              <span className="inline-block h-3 w-6 rounded bg-[#307c4c]" /> From the SAP vendor master. Removing one stops it for {countryName} only; SAP is not changed.
            </p>
            <p className="mt-1.5 flex items-center gap-2">
              <span className="inline-block h-3 w-6 rounded border border-[#307c4c] bg-white" /> Added by your team. Remembered for the next communication to this supplier.
            </p>
            <p className="mt-1.5">You are always copied on what you send. Everyone in TO can respond for the supplier.</p>
          </div>
          {!inLibrary && toCount > 0 && (
            <p className="text-xs text-slate-500">
              Add the supplier to the library to include it in new communications. Adding a recipient adds it too.
            </p>
          )}
          {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
        </div>

        {/* Right: recipients */}
        <aside className="border-t border-slate-100 bg-slate-50/40 md:border-l md:border-t-0">
          <div className="border-b border-slate-100 bg-white px-4 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <Mail className="h-3 w-3" /> Email recipients
            </p>
          </div>
          <div className="space-y-5 p-4">
            <section>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">To</p>
              <p className="mb-2 text-[11px] text-slate-400">Add or remove supplier emails</p>
              <div className="mb-2 flex min-h-[24px] flex-wrap gap-1.5">
                {toCount === 0 && <p className="text-xs italic text-slate-400">No email in SAP. Add one below.</p>}
                {card.masterTo.map((e) => (
                  <Pill key={e} solid label={e} disabled={pending} onRemove={() => run(() => hideMasterEmail(code, e))} />
                ))}
                {addedTo.map((c) => (
                  <Pill
                    key={c.id}
                    label={c.email}
                    title={c.addedBy ? `Added by ${c.addedBy}` : undefined}
                    disabled={pending}
                    onRemove={() => run(() => removeRecipient(code, c.id))}
                  />
                ))}
              </div>
              <AddEmail
                value={toInput}
                onChange={setToInput}
                disabled={pending}
                onAdd={() => run(() => addRecipient({ code, email: toInput, kind: 'to' }), () => setToInput(''))}
              />
              {card.hidden.length > 0 && (
                <div className="mt-2 text-[11px] text-slate-400">
                  Removed from SAP list:{' '}
                  {card.hidden.map((h, i) => (
                    <span key={h.id}>
                      {i > 0 && ', '}
                      <span className="line-through">{h.email}</span>{' '}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => restoreMasterEmail(code, h.id))}
                        className="font-semibold text-[#307c4c] hover:underline"
                      >
                        restore
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </section>

            <div className="border-t border-slate-100" />

            <section>
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">CC</p>
              <p className="mb-2 text-[11px] text-slate-400">Add relevant buyers or team members</p>
              <div className="mb-2 flex min-h-[24px] flex-wrap gap-1.5">
                <LockedPill label={me.name || me.email} title={`${me.email}. You are always copied on what you send.`} />
                {addedCc.map((c) => (
                  <Pill
                    key={c.id}
                    label={c.name || c.email}
                    title={`${c.email}${c.addedBy ? ` · added by ${c.addedBy}` : ''}`}
                    disabled={pending}
                    onRemove={() => run(() => removeRecipient(code, c.id))}
                  />
                ))}
              </div>
              <EmployeeSearchInput
                placeholder="Search NESR employees to CC…"
                excludeEmails={[me.email, ...addedCc.map((c) => c.email)]}
                onSelect={(emp: Employee) =>
                  run(() => addRecipient({ code, email: emp.mail, name: emp.display_name, kind: 'cc' }))
                }
              />
              <p className="mb-1 mt-2 text-[10px] text-slate-400">Or type any email</p>
              <AddEmail
                value={ccInput}
                onChange={setCcInput}
                disabled={pending}
                onAdd={() => run(() => addRecipient({ code, email: ccInput, kind: 'cc' }), () => setCcInput(''))}
              />
              <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
                Changes are saved for this supplier in {countryName}.
              </p>
            </section>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="text-lg font-bold text-slate-800">{value}</p>
      {hint && <p className="text-[10px] text-slate-400">{hint}</p>}
    </div>
  );
}

function AddEmail({
  value,
  onChange,
  onAdd,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onAdd: () => void;
  disabled: boolean;
}) {
  return (
    <div className="flex gap-1.5">
      <input
        type="email"
        placeholder="add@email.com"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            e.preventDefault();
            onAdd();
          }
        }}
        className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 placeholder-slate-400 focus:border-[#307c4c] focus:outline-none focus:ring-1 focus:ring-[#307c4c]"
      />
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || !value.trim()}
        className="shrink-0 rounded-md bg-[#307c4c] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#26663e] disabled:cursor-not-allowed disabled:opacity-60"
      >
        Add
      </button>
    </div>
  );
}

const X_ICON = (
  <svg className="h-2.5 w-2.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
    <path
      fillRule="evenodd"
      d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
      clipRule="evenodd"
    />
  </svg>
);

/** Solid: from the vendor master. Outlined: added by the team. */
function Pill({
  label,
  title,
  solid,
  disabled,
  onRemove,
}: {
  label: string;
  title?: string;
  solid?: boolean;
  disabled?: boolean;
  onRemove: () => void;
}) {
  return (
    <span
      title={title ?? label}
      className={`inline-flex max-w-full items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${
        solid ? 'bg-[#307c4c] text-white' : 'border border-[#307c4c] bg-white text-[#307c4c]'
      }`}
    >
      <span className="truncate">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className={`ml-0.5 shrink-0 transition-colors disabled:opacity-40 ${
          solid ? 'text-white/70 hover:text-green-200' : 'text-[#307c4c]/70 hover:text-green-900'
        }`}
      >
        {X_ICON}
      </button>
    </span>
  );
}

function LockedPill({ label, title }: { label: string; title: string }) {
  return (
    <span title={title} className="inline-flex max-w-full items-center gap-1 rounded-md bg-[#307c4c] px-2 py-0.5 text-xs font-medium text-white">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 opacity-80" aria-hidden>
        <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z" />
      </svg>
      <span className="truncate">{label}</span>
    </span>
  );
}
