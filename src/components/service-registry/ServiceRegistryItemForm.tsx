'use client';

/* ─────────────────────────────────────────────────────────────
   Service Registry · the one item form, used by Catalog Manager
   (its New / Edit entry pages) and by RRSM (its registry drawer).

   Same fields, same rules, same layout in both tools. What differs
   is passed in: how to save (each tool checks its own access), how
   to search suppliers, and whatever tool-specific fields go below
   (RRSM's units, a recurrent service's dates).

   Moved out of catalog-manager/catalog/CatalogEntryFormClient.tsx
   (23 Nov 2026); the field rules are unchanged.
   ───────────────────────────────────────────────────────────── */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { TaxCategory } from '@/lib/catalog-taxonomy-types';
import type { ApprovalThresholdRule, CatalogEntry, SpendType } from '@/types/catalog-manager';
import {
  effectiveThresholdUsd,
  fmtUsd,
  usdRateFor,
  usdRatesFrom,
  sirionUrlFor,
  SPEND_TYPE_OPTIONS,
  INCOTERMS,
} from '@/lib/catalog-manager-utils';

/** What the form hands to the tool's save action. Mirrors CatalogEntryInput. */
export interface RegistryItemInput {
  id?: number;
  supplier_name: string;
  supplier_code: string;
  manager: string | null;
  country_code: string;
  category_name: string;
  subcategory_name: string | null;
  spend_type: SpendType | null;
  family: string | null;
  commodity: string | null;
  unspsc_code: string | null;
  item_name: string;
  description: string | null;
  uom_name: string;
  unit_price: number;
  currency_code: string;
  effective_date: string;
  expiry_date: string | null;
  notes: string | null;
  sirion_contract_id: string | null;
  sirion_url: string | null;
  incoterms: string | null;
  incoterms_location: string | null;
  lead_time_days: number | null;
  sap_service_number: string | null;
}

export interface RegistrySupplierHit {
  code: string;
  name: string;
  email?: string;
  blocked?: boolean;
}

export interface RegistryCountry {
  code: string;
  name: string;
  flag?: string | null;
}

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
  incoterms: string;
  incoterms_location: string;
  lead_time: string;
  sap_service_number: string;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const DEFAULT_CCY: Record<string, string> = {
  SA: 'SAR',
  AE: 'AED',
  HQ: 'AED',
  KW: 'KWD',
  OM: 'OMR',
  QA: 'QAR',
  BH: 'BHD',
  IQ: 'USD',
  DZ: 'DZD',
  EG: 'EGP',
};

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="text-[12.5px] font-semibold text-slate-600">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  );
}

const inputCls = (err?: boolean) =>
  `w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors focus:ring-2 focus:ring-[#307c4c]/20 ${err ? 'border-red-300 focus:border-red-400' : 'border-slate-300 focus:border-[#307c4c]'}`;

export default function ServiceRegistryItemForm({
  initial,
  defaults,
  taxonomy: SPEND_TAXONOMY,
  countries,
  currencies,
  uoms,
  managers,
  thresholds,
  approvalsEnabled,
  serviceActivities,
  lockCountry = false,
  allowDraft = true,
  onSubmit,
  onCancel,
  searchSuppliers,
  children,
}: {
  /** The item being edited, or null for a new one. */
  initial: CatalogEntry | null;
  /** Starting values for a new item (RRSM fills supplier, country, UoM from what it knows). */
  defaults?: Partial<FormState>;
  taxonomy: TaxCategory[];
  countries: RegistryCountry[];
  currencies: { code: string; usd_rate: number }[];
  uoms: { name: string }[];
  managers: string[];
  thresholds: ApprovalThresholdRule[];
  /** False while approvals are paused: every save activates at once. */
  approvalsEnabled: boolean;
  /** SAP service master numbers, for the service number picker. */
  serviceActivities?: { no: string; text: string }[];
  /** RRSM works one country at a time and fixes it. */
  lockCountry?: boolean;
  allowDraft?: boolean;
  onSubmit: (input: RegistryItemInput, mode: 'draft' | 'submit') => Promise<void>;
  onCancel: () => void;
  /** Type-ahead on supplier name and code. Without it the fields are plain inputs. */
  searchSuppliers?: (query: string) => Promise<RegistrySupplierHit[]>;
  /** Tool-specific fields, shown below the shared ones and above the buttons. */
  children?: React.ReactNode;
}) {
  const defaultCountry = defaults?.country_code ?? countries[0]?.code ?? 'SA';
  const defaultCcyOf = (code: string) => DEFAULT_CCY[code] ?? currencies[0]?.code ?? 'USD';

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
          incoterms: initial.incoterms ?? '',
          incoterms_location: initial.incoterms_location ?? '',
          lead_time: initial.lead_time_days != null ? String(initial.lead_time_days) : '',
          sap_service_number: initial.sap_service_number ?? '',
        }
      : {
          supplier_name: '',
          supplier_code: '',
          manager: '',
          country_code: defaultCountry,
          category_name: '',
          subcategory_name: '',
          spend_type: '',
          family: '',
          commodity: '',
          unspsc_code: '',
          item_name: '',
          description: '',
          uom_name: '',
          unit_price: '',
          currency_code: defaultCcyOf(defaultCountry),
          effective_date: todayStr(),
          expiry_date: '',
          notes: '',
          sirion_contract_id: '',
          sirion_url: '',
          incoterms: '',
          incoterms_location: '',
          lead_time: '',
          sap_service_number: '',
          ...defaults,
        },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const catObj = useMemo(
    () => SPEND_TAXONOMY.find((c) => c.name === f.category_name),
    [SPEND_TAXONOMY, f.category_name],
  );
  const subObj = useMemo(
    () => catObj?.subs.find((s) => s.name === f.subcategory_name),
    [catObj, f.subcategory_name],
  );
  const commodityOptions = subObj?.commodities ?? [];

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setF((p) => {
      const n = { ...p, [k]: v };
      if (k === 'country_code') n.currency_code = defaultCcyOf(v as string);
      if (k === 'category_name') {
        const c = SPEND_TAXONOMY.find((x) => x.name === v);
        n.spend_type = c?.type ?? '';
        n.subcategory_name = '';
        n.commodity = '';
        n.family = '';
        n.unspsc_code = '';
      }
      if (k === 'subcategory_name') {
        n.commodity = '';
      }
      if (k === 'commodity') {
        const com = subObj?.commodities.find((c) => c.n === v);
        if (com) {
          n.family = com.f;
          n.unspsc_code = com.code;
          if (!n.description) n.description = com.desc;
        }
      }
      if (k === 'sirion_contract_id') {
        const auto = sirionUrlFor(p.sirion_contract_id);
        if (!p.sirion_url || p.sirion_url === auto) n.sirion_url = sirionUrlFor(v as string) ?? '';
      }
      return n;
    });
  }

  /* Preview only: the server recomputes the tier from the same tables before it routes the item. */
  const rates = useMemo(() => usdRatesFrom(currencies), [currencies]);
  const categoryIdByName = useMemo(
    () =>
      new Map(
        thresholds
          .filter((t) => t.spend_category_id != null && t.spend_category_name)
          .map((t) => [t.spend_category_name as string, t.spend_category_id as number] as const),
      ),
    [thresholds],
  );
  const rate = usdRateFor(f.currency_code, rates);
  const usd = f.unit_price && rate !== null ? Number(f.unit_price) * rate : 0;
  const thresholdUsd = effectiveThresholdUsd(
    thresholds,
    f.country_code,
    categoryIdByName.get(f.category_name) ?? null,
  );
  const needsApproval = approvalsEnabled && usd >= thresholdUsd;

  function validate(): boolean {
    const e: Record<string, string> = {};
    (
      [
        'supplier_name',
        'supplier_code',
        'country_code',
        'category_name',
        'item_name',
        'uom_name',
        'unit_price',
        'currency_code',
        'effective_date',
      ] as (keyof FormState)[]
    ).forEach((k) => {
      if (!String(f[k]).trim()) e[k] = 'Required';
    });
    if (f.unit_price && Number(f.unit_price) <= 0) e.unit_price = 'Must be greater than 0';
    if (f.expiry_date && f.expiry_date < f.effective_date)
      e.expiry_date = 'Expiry must be after effective date';
    if (f.sirion_url && !/^https?:\/\//i.test(f.sirion_url.trim()))
      e.sirion_url = 'Enter a full URL (https://…)';
    if (f.lead_time.trim() && (!/^\d+$/.test(f.lead_time.trim()) || Number(f.lead_time) < 0))
      e.lead_time = 'Whole number of days';
    if (f.sap_service_number.trim() && !/^\d{6,18}$/.test(f.sap_service_number.trim()))
      e.sap_service_number = 'Digits only, as in SAP';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(mode: 'draft' | 'submit') {
    setServerError(null);
    if (!validate()) return;
    setSubmitting(true);
    try {
      await onSubmit(
        {
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
          incoterms: f.incoterms || null,
          incoterms_location: f.incoterms_location.trim() || null,
          lead_time_days: f.lead_time.trim() ? Number(f.lead_time) : null,
          sap_service_number: f.sap_service_number.trim() || null,
        },
        mode,
      );
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  const catGroups = SPEND_TYPE_OPTIONS.map((t) => ({
    type: t,
    cats: SPEND_TAXONOMY.filter((c) => c.type === t),
  })).filter((g) => g.cats.length);

  return (
    <div>
      {serverError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SupplierField
          label="Supplier name"
          value={f.supplier_name}
          error={errors.supplier_name}
          placeholder="Search by name"
          search={searchSuppliers}
          onType={(v) => set('supplier_name', v)}
          onPick={(s) => {
            set('supplier_name', s.name);
            set('supplier_code', s.code);
          }}
        />
        <SupplierField
          label="Supplier code (SAP vendor)"
          mono
          value={f.supplier_code}
          error={errors.supplier_code}
          placeholder="e.g. 1103384"
          search={searchSuppliers}
          onType={(v) => set('supplier_code', v)}
          onPick={(s) => {
            set('supplier_name', s.name);
            set('supplier_code', s.code);
          }}
        />

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Supplier manager</Label>
          <input
            list="registryManagerList"
            className={inputCls()}
            value={f.manager}
            onChange={(e) => set('manager', e.target.value)}
            placeholder="Accountable owner for this supplier"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Label required>Country</Label>
          <select
            className={inputCls(!!errors.country_code)}
            value={f.country_code}
            onChange={(e) => set('country_code', e.target.value)}
            disabled={lockCountry}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag ? `${c.flag} ` : ''}
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label required>Spend category</Label>
          <select
            className={inputCls(!!errors.category_name)}
            value={f.category_name}
            onChange={(e) => set('category_name', e.target.value)}
          >
            <option value="">Select category…</option>
            {catGroups.map((g) => (
              <optgroup key={g.type} label={g.type}>
                {g.cats.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5">
          <Label>Sub-category</Label>
          <select
            className={inputCls()}
            value={f.subcategory_name}
            onChange={(e) => set('subcategory_name', e.target.value)}
            disabled={!catObj}
          >
            <option value="">{catObj ? 'Select…' : 'Pick a category first'}</option>
            {catObj?.subs.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label required>Unit of measure</Label>
          <select
            className={inputCls(!!errors.uom_name)}
            value={f.uom_name}
            onChange={(e) => set('uom_name', e.target.value)}
          >
            <option value="">Select UOM…</option>
            {uoms.map((u) => (
              <option key={u.name} value={u.name}>
                {u.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>
            Commodity{' '}
            {f.spend_type ? (
              <span className="font-normal text-slate-400">· Spend type: {f.spend_type}</span>
            ) : null}
          </Label>
          <select
            className={inputCls()}
            value={f.commodity}
            onChange={(e) => set('commodity', e.target.value)}
            disabled={!f.subcategory_name}
          >
            <option value="">
              {f.subcategory_name
                ? commodityOptions.length
                  ? 'Select commodity…'
                  : 'No commodities listed — enter a description below'
                : 'Pick a sub-category first'}
            </option>
            {commodityOptions.map((c) => (
              <option key={c.n} value={c.n}>
                {c.n}
                {c.code ? ` · ${c.code}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <Label required>Service / item description</Label>
          <input
            className={inputCls(!!errors.item_name)}
            value={f.item_name}
            onChange={(e) => set('item_name', e.target.value)}
            placeholder="Short title for this priced item"
          />
        </label>
        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Detailed description</Label>
          <textarea
            className={`${inputCls()} min-h-[64px]`}
            value={f.description}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Describe the service or indirect item being priced…"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Label required>Unit price</Label>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <input
                type="number"
                inputMode="decimal"
                className={`${inputCls(!!errors.unit_price)} font-mono`}
                value={f.unit_price}
                onChange={(e) => set('unit_price', e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="w-[96px] shrink-0">
              <select
                className={inputCls()}
                value={f.currency_code}
                onChange={(e) => set('currency_code', e.target.value)}
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>SAP service number</Label>
          <input
            list="registryServiceActivities"
            inputMode="numeric"
            className={`${inputCls(!!errors.sap_service_number)} font-mono`}
            value={f.sap_service_number}
            onChange={(e) => set('sap_service_number', e.target.value)}
            placeholder="e.g. 310000000011"
          />
          {errors.sap_service_number && (
            <span className="text-[11.5px] text-red-600">{errors.sap_service_number}</span>
          )}
        </label>

        <label className="flex flex-col gap-1.5">
          <Label required>Effective date</Label>
          <input
            type="date"
            className={inputCls(!!errors.effective_date)}
            value={f.effective_date}
            onChange={(e) => set('effective_date', e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>
            Expiry date{' '}
            <span className="font-normal text-slate-400">· triggers renewal alerts</span>
          </Label>
          <input
            type="date"
            className={inputCls(!!errors.expiry_date)}
            value={f.expiry_date}
            onChange={(e) => set('expiry_date', e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Label>Sirion Contract ID</Label>
          <input
            className={`${inputCls()} font-mono`}
            value={f.sirion_contract_id}
            onChange={(e) => set('sirion_contract_id', e.target.value)}
            placeholder="SIR-CN-000000"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Contract link</Label>
          <input
            className={inputCls(!!errors.sirion_url)}
            value={f.sirion_url}
            onChange={(e) => set('sirion_url', e.target.value)}
            placeholder="https://nesr.sirion.ai/contracts/…"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <Label>Incoterms</Label>
          <select
            className={inputCls()}
            value={f.incoterms}
            onChange={(e) => set('incoterms', e.target.value)}
          >
            <option value="">Not specified</option>
            {INCOTERMS.map((i) => (
              <option key={i.code} value={i.code}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Incoterms location</Label>
          <input
            className={inputCls()}
            value={f.incoterms_location}
            onChange={(e) => set('incoterms_location', e.target.value)}
            placeholder="e.g. Jebel Ali Port, Dubai"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>
            Lead time <span className="font-normal text-slate-400">· days</span>
          </Label>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            className={`${inputCls(!!errors.lead_time)} font-mono`}
            value={f.lead_time}
            onChange={(e) => set('lead_time', e.target.value)}
            placeholder="e.g. 45"
          />
        </label>

        <label className="flex flex-col gap-1.5 sm:col-span-2">
          <Label>Notes</Label>
          <textarea
            className={`${inputCls()} min-h-[52px]`}
            value={f.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Internal notes — MSA reference, mobilization terms, etc."
          />
        </label>
      </div>

      {children && <div className="mt-4 border-t border-slate-100 pt-4">{children}</div>}

      {f.unit_price && rate === null && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] font-semibold text-red-700">
          No USD rate is configured for {f.currency_code}. A Catalog admin must add one before this
          item can be saved.
        </div>
      )}
      {f.unit_price && rate !== null && (
        <div
          className={`mt-4 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-[13px] ${needsApproval ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[#307c4c]/20 bg-[#307c4c]/10 text-[#1d4f31]'}`}
        >
          <span className="font-semibold">
            {!approvalsEnabled
              ? 'Approvals are paused: saved as Active straight away'
              : needsApproval
                ? 'Tier 2: requires Approver sign-off'
                : 'Tier 1: auto-approved on submit'}
          </span>
          {approvalsEnabled && (
            <span className="ml-auto font-mono text-[12px] text-slate-500">
              ≈ USD {fmtUsd(usd)} · threshold USD {fmtUsd(thresholdUsd)}
            </span>
          )}
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2.5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50"
        >
          Cancel
        </button>
        {allowDraft && (
          <button
            type="button"
            onClick={() => submit('draft')}
            disabled={submitting}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-[#6aaf8e] active:scale-[0.98] disabled:opacity-50"
          >
            Save as draft
          </button>
        )}
        <button
          type="button"
          onClick={() => submit('submit')}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
        >
          {submitting ? 'Saving…' : needsApproval ? 'Submit for approval' : 'Save & activate'}
        </button>
      </div>

      <datalist id="registryManagerList">
        {managers.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="registryServiceActivities">
        {(serviceActivities ?? []).map((a) => (
          <option key={a.no} value={a.no}>
            {a.text}
          </option>
        ))}
      </datalist>
    </div>
  );
}

/** Supplier name or code: a plain input, with an AVL type-ahead when the tool provides a search. */
function SupplierField({
  label,
  value,
  error,
  placeholder,
  mono,
  search,
  onType,
  onPick,
}: {
  label: string;
  value: string;
  error?: string;
  placeholder: string;
  mono?: boolean;
  search?: (q: string) => Promise<RegistrySupplierHit[]>;
  onType: (v: string) => void;
  onPick: (s: RegistrySupplierHit) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<RegistrySupplierHit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <div className="flex flex-col gap-1.5">
      <Label required>{label}</Label>
      <div className="relative">
        <input
          className={`${inputCls(!!error)} ${mono ? 'font-mono' : ''}`}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            const v = e.target.value;
            onType(v);
            if (!search) return;
            if (timer.current) clearTimeout(timer.current);
            if (v.trim().length < 2) {
              setHits([]);
              return;
            }
            timer.current = setTimeout(async () => {
              setHits(await search(v));
              setOpen(true);
            }, 250);
          }}
          onFocus={() => hits.length && setOpen(true)}
        />
        {open && hits.length > 0 && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {hits.map((h) => (
                <li key={h.code}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(h);
                      setOpen(false);
                    }}
                    className="flex w-full items-start gap-2 px-3 py-1.5 text-left hover:bg-slate-50"
                  >
                    <span className="shrink-0 font-mono text-[11.5px] text-slate-500">
                      {h.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-800">
                      {h.name}
                    </span>
                    {h.blocked && (
                      <span className="shrink-0 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                        Blocked
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {error && <span className="text-[11.5px] text-red-600">{error}</span>}
    </div>
  );
}
