'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  addSnsCategory,
  addSnsCommodity,
  addSnsCountry,
  addSnsFamily,
  addSnsReason,
  addSnsSegment,
  addSnsSubCategory,
  deleteSnsCountry,
  deleteSnsReason,
  deleteSnsSegment,
  deleteSnsTaxonomyNode,
  getSnsReferenceAdminData,
  setSnsCountryActive,
  setSnsReasonActive,
  setSnsSegmentActive,
  setSnsTaxonomyActive,
  updateSnsCategory,
  updateSnsCommodity,
  updateSnsCountry,
  updateSnsFamily,
  updateSnsReason,
  updateSnsSegment,
  updateSnsSubCategory,
} from '@/app/actions/sns-reference';
import type { SnsReferenceAdminData } from '@/app/actions/sns-reference';

const BRAND = '#2A7E4F';
type Tab = 'taxonomy' | 'countries' | 'segments' | 'reasons';
type Result = { success: boolean; error?: string };

const TABS: { key: Tab; label: string }[] = [
  { key: 'taxonomy', label: 'Taxonomy' },
  { key: 'countries', label: 'Countries' },
  { key: 'segments', label: 'Segments' },
  { key: 'reasons', label: 'Reason codes' },
];

export default function SnsReferenceDataClient() {
  const [data, setData] = useState<SnsReferenceAdminData | null>(null);
  const [tab, setTab] = useState<Tab>('taxonomy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setData(await getSnsReferenceAdminData());
  }, []);

  useEffect(() => {
    // Mount-time load from the database — the carve-out this rule allows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const run = useCallback(async (fn: () => Promise<Result>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (!res.success) { setError(res.error ?? 'Action failed.'); return false; }
    await reload();
    return true;
  }, [reload]);

  if (!data) return <div className="py-16 text-center text-sm text-slate-400">Loading reference data…</div>;

  return (
    <div>
      <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">S&amp;S Registry · Reference Data</h2>
      <p className="mb-5 max-w-3xl text-[13px] leading-relaxed text-slate-500">
        The lists the New Record wizard picks from. <span className="font-semibold text-slate-600">Deactivating</span> hides
        an entry from new records while leaving existing records intact — prefer it to deleting. Records store their scope as
        text, so editing the taxonomy never rewrites a record that has already been submitted.
      </p>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setError(null); }}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.key ? 'border-[#2A7E4F] text-[#1d5b39]' : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700">{error}</div>
      )}

      {tab === 'taxonomy' && <TaxonomyTab data={data} busy={busy} run={run} />}
      {tab === 'countries' && <CountriesTab data={data} busy={busy} run={run} />}
      {tab === 'segments' && <SegmentsTab data={data} busy={busy} run={run} />}
      {tab === 'reasons' && <ReasonsTab data={data} busy={busy} run={run} />}
    </div>
  );
}

/* ─── Shared bits ─────────────────────────────────────────────── */

type RunFn = (fn: () => Promise<Result>) => Promise<boolean>;

function Pill({ active }: { active: boolean }) {
  if (active) return null;
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-400">Inactive</span>
  );
}

/** Inline "add" input that clears itself once the row is created. */
function AddInline({
  placeholder,
  busy,
  onAdd,
}: {
  placeholder: string;
  busy: boolean;
  onAdd: (value: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState('');
  async function submit() {
    if (!value.trim()) return;
    if (await onAdd(value.trim())) setValue('');
  }
  return (
    <div className="flex gap-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void submit(); }}
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
      />
      <button
        disabled={busy || !value.trim()}
        onClick={submit}
        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        style={{ background: BRAND }}
      >
        Add
      </button>
    </div>
  );
}

/** A single editable row: rename in place, toggle active, delete. */
function EditableRow({
  name,
  active,
  busy,
  badge,
  onRename,
  onToggle,
  onDelete,
  deleteWarning,
  children,
}: {
  name: string;
  active: boolean;
  busy: boolean;
  /** Immutable identifier shown beside the name — currently the country code. */
  badge?: string;
  onRename: (v: string) => Promise<boolean>;
  onToggle: () => Promise<boolean>;
  onDelete: () => Promise<boolean>;
  deleteWarning: string;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  async function save() {
    if (!value.trim() || value.trim() === name) { setEditing(false); setValue(name); return; }
    if (await onRename(value.trim())) setEditing(false);
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void save(); if (e.key === 'Escape') { setEditing(false); setValue(name); } }}
            className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-[12.5px] outline-none focus:border-[#2A7E4F]"
          />
        ) : (
          <span className={`flex items-center gap-2 text-[12.5px] ${active ? 'text-slate-800' : 'text-slate-400'}`}>
            {name}
            {badge && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-slate-500">
                {badge}
              </span>
            )}
            <Pill active={active} />
          </span>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <button disabled={busy} onClick={save} className="rounded px-2 py-1 text-[11.5px] font-semibold text-[#1d5b39] hover:bg-slate-50">Save</button>
              <button onClick={() => { setEditing(false); setValue(name); }} className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-400 hover:bg-slate-50">Cancel</button>
            </>
          ) : (
            <>
              <button onClick={() => setEditing(true)} className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50">Rename</button>
              <button disabled={busy} onClick={onToggle} className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50">
                {active ? 'Deactivate' : 'Reactivate'}
              </button>
              <button
                disabled={busy}
                onClick={() => { if (confirm(deleteWarning)) void onDelete(); }}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-red-500 hover:bg-red-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

/* ─── Taxonomy ────────────────────────────────────────────────── */

function TaxonomyTab({ data, busy, run }: { data: SnsReferenceAdminData; busy: boolean; run: RunFn }) {
  const [openCat, setOpenCat] = useState<number | null>(null);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const [openFam, setOpenFam] = useState<number | null>(null);
  const [newCatType, setNewCatType] = useState<'Direct' | 'Indirect'>('Direct');

  const cat = data.categories.find((c) => c.id === openCat) ?? null;
  const sub = cat?.subs.find((s) => s.id === openSub) ?? null;
  const fam = sub?.families.find((f) => f.id === openFam) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      {/* Category */}
      <Column title="Category">
        {data.categories.map((c) => (
          <EditableRow
            key={c.id}
            name={`${c.name}`}
            active={c.active}
            busy={busy}
            onRename={(v) => run(() => updateSnsCategory(c.id, v, c.spendType))}
            onToggle={() => run(() => setSnsTaxonomyActive('category', c.id, !c.active))}
            onDelete={() => run(() => deleteSnsTaxonomyNode('category', c.id))}
            deleteWarning={`Delete "${c.name}" and every sub-category, family and commodity beneath it? Existing records keep their scope.`}
          >
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <button
                onClick={() => { setOpenCat(c.id); setOpenSub(null); setOpenFam(null); }}
                className={`text-[11.5px] font-semibold ${openCat === c.id ? 'text-[#1d5b39]' : 'text-slate-400 hover:text-slate-600'}`}
              >
                {c.subs.length} sub-categories →
              </button>
              <button
                disabled={busy}
                onClick={() => run(() => updateSnsCategory(c.id, c.name, c.spendType === 'Direct' ? 'Indirect' : 'Direct'))}
                title="Toggle spend type"
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-500 hover:bg-slate-200"
              >
                {c.spendType}
              </button>
            </div>
          </EditableRow>
        ))}
        <div className="mt-2 space-y-2">
          <div className="flex gap-1">
            {(['Direct', 'Indirect'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setNewCatType(t)}
                className={`flex-1 rounded-lg border px-2 py-1 text-[11.5px] font-semibold ${
                  newCatType === t ? 'border-[#2A7E4F] bg-[#2A7E4F] text-white' : 'border-slate-200 text-slate-500'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <AddInline placeholder="New category" busy={busy} onAdd={(v) => run(() => addSnsCategory(v, newCatType))} />
        </div>
      </Column>

      {/* Sub-category */}
      <Column title="Sub-category" empty={!cat ? 'Pick a category' : undefined}>
        {cat?.subs.map((s) => (
          <EditableRow
            key={s.id}
            name={s.name}
            active={s.active}
            busy={busy}
            onRename={(v) => run(() => updateSnsSubCategory(s.id, v))}
            onToggle={() => run(() => setSnsTaxonomyActive('sub', s.id, !s.active))}
            onDelete={() => run(() => deleteSnsTaxonomyNode('sub', s.id))}
            deleteWarning={`Delete "${s.name}" and everything beneath it?`}
          >
            <button
              onClick={() => { setOpenSub(s.id); setOpenFam(null); }}
              className={`mt-1.5 text-[11.5px] font-semibold ${openSub === s.id ? 'text-[#1d5b39]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {s.families.length} families →
            </button>
          </EditableRow>
        ))}
        {cat && (
          <div className="mt-2">
            <AddInline placeholder="New sub-category" busy={busy} onAdd={(v) => run(() => addSnsSubCategory(cat.id, v))} />
          </div>
        )}
      </Column>

      {/* Family */}
      <Column title="Family" empty={!sub ? 'Pick a sub-category' : undefined}>
        {sub?.families.map((f) => (
          <EditableRow
            key={f.id}
            name={f.name}
            active={f.active}
            busy={busy}
            onRename={(v) => run(() => updateSnsFamily(f.id, v))}
            onToggle={() => run(() => setSnsTaxonomyActive('family', f.id, !f.active))}
            onDelete={() => run(() => deleteSnsTaxonomyNode('family', f.id))}
            deleteWarning={`Delete "${f.name}" and its commodities?`}
          >
            <button
              onClick={() => setOpenFam(f.id)}
              className={`mt-1.5 text-[11.5px] font-semibold ${openFam === f.id ? 'text-[#1d5b39]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              {f.commodities.length} commodities →
            </button>
          </EditableRow>
        ))}
        {sub && (
          <div className="mt-2">
            <AddInline placeholder="New family" busy={busy} onAdd={(v) => run(() => addSnsFamily(sub.id, v))} />
          </div>
        )}
      </Column>

      {/* Commodity */}
      <Column title="Commodity" empty={!fam ? 'Pick a family' : undefined}>
        {fam?.commodities.map((cm) => (
          <EditableRow
            key={cm.id}
            name={cm.name}
            active={cm.active}
            busy={busy}
            onRename={(v) => run(() => updateSnsCommodity(cm.id, v))}
            onToggle={() => run(() => setSnsTaxonomyActive('commodity', cm.id, !cm.active))}
            onDelete={() => run(() => deleteSnsTaxonomyNode('commodity', cm.id))}
            deleteWarning={`Delete commodity "${cm.name}"?`}
          />
        ))}
        {fam && (
          <div className="mt-2">
            <AddInline placeholder="New commodity" busy={busy} onAdd={(v) => run(() => addSnsCommodity(fam.id, v))} />
          </div>
        )}
      </Column>
    </div>
  );
}

function Column({ title, empty, children }: { title: string; empty?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-wide text-slate-500">{title}</div>
      {empty ? (
        <div className="py-10 text-center text-[12px] text-slate-400">{empty}</div>
      ) : (
        <div className="max-h-[520px] space-y-1.5 overflow-y-auto">{children}</div>
      )}
    </div>
  );
}

/* ─── Countries ───────────────────────────────────────────────── */

function CountriesTab({ data, busy, run }: { data: SnsReferenceAdminData; busy: boolean; run: RunFn }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  async function add() {
    if (!code.trim() || !name.trim()) return;
    if (await run(() => addSnsCountry(code.trim(), name.trim()))) { setCode(''); setName(''); }
  }

  return (
    <div className="max-w-2xl">
      <p className="mb-3 text-[12.5px] leading-relaxed text-slate-500">
        The code is embedded in every issued Registry ID (e.g. <code className="rounded bg-slate-100 px-1">SGL-KWT-2026-0001</code>),
        so it cannot be changed after a country is created — only the display name can.
      </p>
      <div className="space-y-1.5">
        {data.countries.map((c) => (
          <EditableRow
            key={c.code}
            name={c.name}
            active={c.active}
            busy={busy}
            badge={c.code}
            onRename={(v) => run(() => updateSnsCountry(c.code, v))}
            onToggle={() => run(() => setSnsCountryActive(c.code, !c.active))}
            onDelete={() => run(() => deleteSnsCountry(c.code))}
            deleteWarning={`Delete "${c.name}"? This is refused if any record already uses it — deactivate instead.`}
          />
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={4}
          className="w-24 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] uppercase outline-none focus:border-[#2A7E4F]"
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void add(); }}
          placeholder="Country / entity name"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#2A7E4F]"
        />
        <button
          disabled={busy || !code.trim() || !name.trim()}
          onClick={add}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/* ─── Segments ────────────────────────────────────────────────── */

function SegmentsTab({ data, busy, run }: { data: SnsReferenceAdminData; busy: boolean; run: RunFn }) {
  return (
    <div className="max-w-2xl">
      <div className="space-y-1.5">
        {data.segments.map((s) => (
          <EditableRow
            key={s.id}
            name={s.name}
            active={s.active}
            busy={busy}
            onRename={(v) => run(() => updateSnsSegment(s.id, v))}
            onToggle={() => run(() => setSnsSegmentActive(s.id, !s.active))}
            onDelete={() => run(() => deleteSnsSegment(s.id))}
            deleteWarning={`Delete segment "${s.name}"? Existing records keep their tags.`}
          />
        ))}
      </div>
      <div className="mt-4">
        <AddInline placeholder="New business segment" busy={busy} onAdd={(v) => run(() => addSnsSegment(v))} />
      </div>
    </div>
  );
}

/* ─── Reason codes ────────────────────────────────────────────── */

function ReasonsTab({ data, busy, run }: { data: SnsReferenceAdminData; busy: boolean; run: RunFn }) {
  const groups: { cls: 'SGL' | 'SOL'; label: string; blurb: string }[] = [
    { cls: 'SGL', label: 'Single-source (SGL)', blurb: 'Why no alternative supplier exists.' },
    { cls: 'SOL', label: 'Sole-source (SOL)', blurb: 'Why NESR has restricted sourcing to one vendor.' },
  ];
  return (
    <div className="grid max-w-4xl gap-5 md:grid-cols-2">
      {groups.map((g) => (
        <div key={g.cls}>
          <div className="text-[13px] font-bold text-slate-900">{g.label}</div>
          <div className="mb-2.5 text-[12px] text-slate-500">{g.blurb}</div>
          <div className="space-y-1.5">
            {data.reasons.filter((r) => r.classification === g.cls).map((r) => (
              <EditableRow
                key={r.id}
                name={r.name}
                active={r.active}
                busy={busy}
                onRename={(v) => run(() => updateSnsReason(r.id, v))}
                onToggle={() => run(() => setSnsReasonActive(r.id, !r.active))}
                onDelete={() => run(() => deleteSnsReason(r.id))}
                deleteWarning={`Delete reason code "${r.name}"? Existing records keep theirs.`}
              />
            ))}
          </div>
          <div className="mt-3">
            <AddInline placeholder={`New ${g.cls} reason code`} busy={busy} onAdd={(v) => run(() => addSnsReason(g.cls, v))} />
          </div>
        </div>
      ))}
    </div>
  );
}
