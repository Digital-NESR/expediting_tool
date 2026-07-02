'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import { Icon } from '../components/CatalogManagerUI';
import { createCatalogEntry, updateCatalogEntry } from '@/app/actions/catalog-manager';
import { SPEND_TAXONOMY } from '@/lib/catalog-taxonomy';
import type { CatalogEntry, SpendType } from '@/types/catalog-manager';
import { APPROVAL_THRESHOLD_USD, fmtUsd, toUsd, sirionUrlFor, SPEND_TYPE_OPTIONS } from '@/lib/catalog-manager-utils';

interface FormState {
  supplier_name: string;
  supplier_code: string;
  manager: string;
  country_code: string;
  category_name: string;
  subcategory_name: string;
  spend_type: SpendType | '';
  family: string;
  commodity: string;
  unspsc_code: string;
  item_name: string;
  description: string;
  uom_name: string;
  unit_price: string;
  currency_code: string;
  effective_date: string;
  expiry_date: string;
  notes: string;
  sirion_contract_id: string;
  sirion_url: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return <span className="text-[12.5px] font-semibold text-slate-600">{children}{required && <span className="ml-0.5 text-red-500">*</span>}</span>;
}

const inputCls = (err?: boolean) =>
  `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-[#307c4c]/20 ${err ? 'border-red-300 focus:border-red-400' : 'border-slate-300 focus:border-[#307c4c]'}`;

export default function CatalogEntryFormClient({
  initial, countries, currencies, uoms, managers, scope, pendingCount, roleLabel, canApprove, canAdmin,
}: {
  initial: CatalogEntry | null;
  countries: ScopeCountry[];
  currencies: { code: string }[];
  uoms: { name: string }[];
  managers: string[];
  scope: string;
  pendingCount: number;
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
}) {
  const router = useRouter();
  const isEdit = !!initial;

  const defaultCountry = scope !== 'ALL' ? scope : countries[0]?.code ?? 'SA';
  const defaultCcyOf = (code: string) => {
    const map: Record<string, string> = { SA: 'SAR', AE: 'AED', KW: 'KWD', OM: 'OMR', QA: 'QAR', IQ: 'USD', DZ: 'DZD', EG: 'EGP' };
    return map[code] ?? currencies[0]?.code ?? 'USD';
  };

  const [f, setF] = useState<FormState>(() =>
    initial
      ? {
          supplier_name: initial.supplier_name,
          supplier_code: initial.supplier_code,
          manager: initial.manager ?? '',
          country_code: initial.country_code,
          category_name: initial.category_name ?? '',
          subcategory_name: initial.subcategory_name ?? '',
          spend_type: initial.spend_type ?? '',
          family: initial.family ?? '',
          commodity: initial.commodity ?? '',
          unspsc_code: initial.unspsc_code ?? '',
          item_name: initial.item_name,
          description: initial.description ?? '',
          uom_name: initial.uom_name ?? '',
          unit_price: String(initial.unit_price ?? ''),
          currency_code: initial.currency_code,
          effective_date: initial.effective_date || todayStr(),
          expiry_date: initial.expiry_date ?? '',
          notes: initial.notes ?? '',
          sirion_contract_id: initial.sirion_contract_id ?? '',
          sirion_url: initial.sirion_url ?? '',
        }
      : {
          supplier_name: '', supplier_code: '', manager: '', country_code: defaultCountry,
          category_name: '', subcategory_name: '', spend_type: '', family: '', commodity: '', unspsc_code: '',
          item_name: '', description: '', uom_name: '', unit_price: '', currency_code: defaultCcyOf(defaultCountry),
          effective_date: todayStr(), expiry_date: '', notes: '', sirion_contract_id: '', sirion_url: '',
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const catObj = useMemo(() => SPEND_TAXONOMY.find((c) => c.name === f.category_name), [f.category_name]);
  const subObj = useMemo(() => catObj?.subs.find((s) => s.name === f.subcategory_name), [catObj, f.subcategory_name]);
  const commodityOptions = subObj?.commodities ?? [];

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'country_code') n.currency_code = defaultCcyOf(v as string);
      if (k === 'category_name') {
        const c = SPEND_TAXONOMY.find((x) => x.name === v);
        n.spend_type = c?.type ?? '';
        n.subcategory_name = ''; n.commodity = ''; n.family = ''; n.unspsc_code = '';
      }
      if (k === 'subcategory_name') { n.commodity = ''; }
      if (k === 'commodity') {
        const com = subObj?.commodities.find((c) => c.n === v);
        if (com) { n.family = com.f; n.unspsc_code = com.code; if (!n.description) n.description = com.desc; }
      }
      if (k === 'sirion_contract_id') {
        const auto = sirionUrlFor(p.sirion_contract_id);
        if (!p.sirion_url || p.sirion_url === auto) n.sirion_url = sirionUrlFor(v as string) ?? '';
      }
      return n;
    });
  }

  const usd = f.unit_price ? toUsd(Number(f.unit_price), f.currency_code) : 0;
  const needsApproval = usd >= APPROVAL_THRESHOLD_USD;

  function validate(): boolean {
    const e: Record<string, string> = {};
    (['supplier_name', 'supplier_code', 'country_code', 'category_name', 'item_name', 'uom_name', 'unit_price', 'currency_code', 'effective_date'] as (keyof FormState)[])
      .forEach((k) => { if (!String(f[k]).trim()) e[k] = 'Required'; });
    if (f.unit_price && Number(f.unit_price) <= 0) e.unit_price = 'Must be greater than 0';
    if (f.expiry_date && f.expiry_date < f.effective_date) e.expiry_date = 'Expiry must be after effective date';
    if (f.sirion_url && !/^https?:\/\//i.test(f.sirion_url.trim())) e.sirion_url = 'Enter a full URL (https://…)';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(mode: 'draft' | 'submit') {
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    const input = {
      id: initial?.id,
      supplier_name: f.supplier_name.trim(),
      supplier_code: f.supplier_code.trim(),
      manager: f.manager || null,
      country_code: f.country_code,
      category_name: f.category_name,
      subcategory_name: f.subcategory_name || null,
      spend_type: (f.spend_type || null) as SpendType | null,
      family: f.family || null,
      commodity: f.commodity || null,
      unspsc_code: f.unspsc_code || null,
      item_name: f.item_name.trim(),
      description: f.description || null,
      uom_name: f.uom_name,
      unit_price: Number(f.unit_price),
      currency_code: f.currency_code,
      effective_date: f.effective_date,
      expiry_date: f.expiry_date || null,
      notes: f.notes || null,
      sirion_contract_id: f.sirion_contract_id || null,
      sirion_url: f.sirion_url || null,
    };
    try {
      if (isEdit) {
        const res = await updateCatalogEntry(input, mode);
        router.push(`/catalog-manager/catalog/${res.id}`);
      } else {
        const res = await createCatalogEntry(input, mode);
        router.push(`/catalog-manager/catalog/${res.id}`);
      }
      router.refresh();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.');
      setSubmitting(false);
    }
  }

  const catGroups = SPEND_TYPE_OPTIONS.map((t) => ({ type: t, cats: SPEND_TAXONOMY.filter((c) => c.type === t) })).filter((g) => g.cats.length);

  return (
    <CatalogManagerShell
      title={isEdit ? `Edit ${initial!.code}` : 'New catalog entry'}
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      showScope={false}
    >
      <div className="mx-auto max-w-3xl">
        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">{isEdit ? `Edit entry ${initial!.code}` : 'New catalog entry'}</h1>
          <p className="mt-1 text-sm text-slate-500">{isEdit ? 'Saving creates a new version; history is retained.' : 'Add a supplier service or indirect-item rate.'}</p>
        </div>

        {serverError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>}

        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <Label required>Supplier name</Label>
              <input list="supplierList" className={inputCls(!!errors.supplier_name)} value={f.supplier_name} onChange={(e) => set('supplier_name', e.target.value)} placeholder="e.g. Gulf Cementing Co." />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label required>Supplier code (SAP vendor)</Label>
              <input className={`${inputCls(!!errors.supplier_code)} font-mono`} value={f.supplier_code} onChange={(e) => set('supplier_code', e.target.value)} placeholder="V-100000" />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Supplier manager</Label>
              <input list="managerList" className={inputCls()} value={f.manager} onChange={(e) => set('manager', e.target.value)} placeholder="Accountable owner for this supplier" />
            </label>

            <label className="flex flex-col gap-1.5">
              <Label required>Country</Label>
              <select className={inputCls(!!errors.country_code)} value={f.country_code} onChange={(e) => set('country_code', e.target.value)}>
                {countries.map((c) => <option key={c.code} value={c.code}>{c.flag ? `${c.flag} ` : ''}{c.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <Label required>Spend category</Label>
              <select className={inputCls(!!errors.category_name)} value={f.category_name} onChange={(e) => set('category_name', e.target.value)}>
                <option value="">Select category…</option>
                {catGroups.map((g) => <optgroup key={g.type} label={g.type}>{g.cats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}</optgroup>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5">
              <Label>Sub-category</Label>
              <select className={inputCls()} value={f.subcategory_name} onChange={(e) => set('subcategory_name', e.target.value)} disabled={!catObj}>
                <option value="">{catObj ? 'Select…' : 'Pick a category first'}</option>
                {catObj?.subs.map((s) => <option key={s.name} value={s.name}>{s.name}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>Unit of measure <span className="text-red-500">*</span></Label>
              <select className={inputCls(!!errors.uom_name)} value={f.uom_name} onChange={(e) => set('uom_name', e.target.value)}>
                <option value="">Select UOM…</option>
                {uoms.map((u) => <option key={u.name} value={u.name}>{u.name}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Commodity {f.spend_type ? <span className="font-normal text-slate-400">· Spend type: {f.spend_type}</span> : null}</Label>
              <select className={inputCls()} value={f.commodity} onChange={(e) => set('commodity', e.target.value)} disabled={!f.subcategory_name}>
                <option value="">{f.subcategory_name ? (commodityOptions.length ? 'Select commodity…' : 'No commodities listed — enter a description below') : 'Pick a sub-category first'}</option>
                {commodityOptions.map((c) => <option key={c.n} value={c.n}>{c.n}{c.code ? ` · ${c.code}` : ''}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <Label required>Service / item description</Label>
              <input className={inputCls(!!errors.item_name)} value={f.item_name} onChange={(e) => set('item_name', e.target.value)} placeholder="Short title for this priced item" />
            </label>
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Detailed description</Label>
              <textarea className={`${inputCls()} min-h-[64px]`} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Describe the service or indirect item being priced…" />
            </label>

            <label className="flex flex-col gap-1.5">
              <Label required>Unit price</Label>
              <div className="flex gap-2">
                <div className="min-w-0 flex-1">
                  <input type="number" inputMode="decimal" className={`${inputCls(!!errors.unit_price)} font-mono`} value={f.unit_price} onChange={(e) => set('unit_price', e.target.value)} placeholder="0.00" />
                </div>
                <div className="w-[96px] shrink-0">
                  <select className={inputCls()} value={f.currency_code} onChange={(e) => set('currency_code', e.target.value)}>
                    {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </div>
              </div>
            </label>
            <div className="hidden sm:block" />

            <label className="flex flex-col gap-1.5">
              <Label required>Effective date</Label>
              <input type="date" className={inputCls(!!errors.effective_date)} value={f.effective_date} onChange={(e) => set('effective_date', e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>Expiry date <span className="font-normal text-slate-400">· triggers renewal alerts</span></Label>
              <input type="date" className={inputCls(!!errors.expiry_date)} value={f.expiry_date} onChange={(e) => set('expiry_date', e.target.value)} />
            </label>

            <label className="flex flex-col gap-1.5">
              <Label>Sirion Contract ID</Label>
              <input className={`${inputCls()} font-mono`} value={f.sirion_contract_id} onChange={(e) => set('sirion_contract_id', e.target.value)} placeholder="SIR-CN-000000" />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>Contract link</Label>
              <input className={inputCls(!!errors.sirion_url)} value={f.sirion_url} onChange={(e) => set('sirion_url', e.target.value)} placeholder="https://nesr.sirion.ai/contracts/…" />
            </label>

            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <textarea className={`${inputCls()} min-h-[52px]`} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Internal notes — MSA reference, mobilization terms, etc." />
            </label>
          </div>

          {f.unit_price && (
            <div className={`mt-4 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] ${needsApproval ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[#307c4c]/20 bg-[#307c4c]/10 text-[#1d4f31]'}`}>
              <Icon name={needsApproval ? 'approve' : 'check'} className="h-4 w-4" />
              <span className="font-semibold">{needsApproval ? 'Tier 2 — requires Approver sign-off' : 'Tier 1 — auto-approved on submit'}</span>
              <span className="ml-auto font-mono text-[12px] text-slate-500">≈ USD {fmtUsd(usd)} · threshold ${APPROVAL_THRESHOLD_USD / 1000}k</span>
            </div>
          )}

          <div className="mt-5 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
            <button onClick={() => router.back()} disabled={submitting} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50">Cancel</button>
            <button onClick={() => submit('draft')} disabled={submitting} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-[#6aaf8e] active:scale-[0.98] disabled:opacity-50">Save as draft</button>
            <button onClick={() => submit('submit')} disabled={submitting} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100">
              <Icon name="arrowRight" className="h-4 w-4" /> {submitting ? 'Saving…' : needsApproval ? 'Submit for approval' : 'Save & activate'}
            </button>
          </div>
        </div>
      </div>

      <datalist id="supplierList" />
      <datalist id="managerList">{managers.map((m) => <option key={m} value={m} />)}</datalist>
    </CatalogManagerShell>
  );
}
