'use client';

import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addCostCenterCompany,
  addCostCenterDepartment,
  deleteCostCenterCompany,
  deleteCostCenterDepartment,
  getLaptopCostCenterAdminData,
  setCostCenterCompanyActive,
  setCostCenterCountryMapping,
  setCostCenterDepartmentActive,
  updateCostCenterCompany,
  updateCostCenterDepartment,
} from '@/app/actions/laptop-cost-centers';
import type {
  CostCenterActionResult,
  LaptopCostCenterAdminData,
} from '@/app/actions/laptop-cost-centers';
import { Kpi } from './_components/Panel';

const BRAND = '#059669';

/* The row shapes come off the admin payload rather than from '@/lib/laptopCostCenters.server',
   which must never be reached from a client component even through a type-only import. */
type Company = LaptopCostCenterAdminData['companies'][number];
type Department = LaptopCostCenterAdminData['departments'][number];

/**
 * The same rule the server enforces, repeated here so a typo is caught on the keystroke rather
 * than after a round trip. The server still validates — this is convenience, not the gate.
 */
const COST_CENTER_RE = /^C\d{9}$/;
const COMPANY_CODE_RE = /^\d{4}$/;
const COST_CENTER_HINT =
  'Cost center must be the letter C followed by nine digits, e.g. C011100101.';

type Tab = 'companies' | 'countries';

const TABS: { key: Tab; label: string }[] = [
  { key: 'companies', label: 'Companies & departments' },
  { key: 'countries', label: 'Country map' },
];

/**
 * Every mutating control shares one writer: `run` marks itself busy under a key, and a failure
 * is stored against that same key so the message can be rendered beside the control that caused
 * it instead of in a banner at the top of a page this long.
 */
interface Ctl {
  anyBusy: boolean;
  busyOn: (key: string) => boolean;
  errorOn: (key: string) => string | null;
  run: (key: string, fn: () => Promise<CostCenterActionResult>) => Promise<boolean>;
}

export default function LaptopCostCentersClient() {
  const [data, setData] = useState<LaptopCostCenterAdminData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('companies');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);

  const reload = useCallback(async () => {
    setData(await getLaptopCostCenterAdminData());
    setLoaded(true);
  }, []);

  useEffect(() => {
    // Mount-time load from the database — the carve-out this rule allows.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const run = useCallback(
    async (key: string, fn: () => Promise<CostCenterActionResult>) => {
      setBusyKey(key);
      setFailure(null);
      const res = await fn();
      setBusyKey(null);
      if (!res.success) {
        setFailure({ key, message: res.error ?? 'Could not save the change.' });
        return false;
      }
      // A write can move a row between companies or change a count, so the whole snapshot is
      // refetched. It is ~2,300 rows a few times a year; patching state in place is not worth
      // the chance of drifting out of sync with what the request form will read.
      await reload();
      return true;
    },
    [reload],
  );

  const ctl = useMemo<Ctl>(
    () => ({
      anyBusy: busyKey !== null,
      busyOn: (key) => busyKey === key,
      errorOn: (key) => (failure?.key === key ? failure.message : null),
      run,
    }),
    [busyKey, failure, run],
  );

  if (!loaded)
    return <div className="py-16 text-center text-sm text-slate-400">Loading cost centers…</div>;

  if (!data) return <div className="py-16 text-center text-sm text-slate-400">Admins only.</div>;

  const activeCompanies = data.companies.filter((c) => c.active).length;
  const activeDepartments = data.departments.filter((d) => d.active).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="mb-1 text-lg font-bold tracking-tight text-slate-900">
            Laptop Procurement · Cost Centers
          </h2>
          <p className="max-w-3xl text-[13px] leading-relaxed text-slate-500">
            The Cost Allocation section of the laptop request form reads this mapping: the requester
            picks a company, then a department, and the cost center fills itself in.{' '}
            <span className="font-semibold text-slate-600">Deactivating</span> hides a row from new
            requests while leaving requests already raised against it readable — prefer it to
            deleting.
          </p>
        </div>
        <ExportCsvButton data={data} />
      </div>

      {data.empty && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
          The cost center tables exist here but hold no rows, so the request form has no companies
          to offer. Load the mapping from the committed workbook export with:
          <code className="mt-1.5 block rounded bg-amber-100 px-2 py-1 font-mono text-[12px]">
            node scripts/seed-laptop-cost-centers.mjs --apply
          </code>
        </div>
      )}

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Kpi
          label="Companies"
          value={String(activeCompanies)}
          sub={`${data.companies.length} including deactivated`}
          tone="good"
          brand={BRAND}
        />
        <Kpi
          label="Departments"
          value={String(activeDepartments)}
          sub={`${data.departments.length} including deactivated`}
          tone="good"
          brand={BRAND}
        />
        <Kpi
          label="Unreachable countries"
          value={String(data.unreachableCountries.length)}
          sub={
            data.unreachableCountries.length
              ? 'Companies filed there are invisible on the form'
              : 'Every country label is reachable'
          }
          tone={data.unreachableCountries.length ? 'warn' : 'good'}
          brand={BRAND}
        />
      </div>

      <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors ${
              tab === t.key
                ? 'border-[#059669] text-[#047857]'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'companies' ? (
        <CompaniesTab data={data} ctl={ctl} />
      ) : (
        <CountryMapTab data={data} ctl={ctl} />
      )}
    </div>
  );
}

/* ─── Shared bits ─────────────────────────────────────────────── */

function FieldError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11.5px] font-medium text-red-700">
      {message}
    </p>
  );
}

function Pill({ active }: { active: boolean }) {
  if (active) return null;
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-400">
      Inactive
    </span>
  );
}

const INPUT =
  'min-w-0 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#059669]';

/* ─── CSV export ──────────────────────────────────────────────── */

/**
 * Mirrors the column order of data/source/cost-center-mapping.csv so a corrected export can be
 * opened in Excel, edited and compared against the original without reshaping it first.
 *
 * Only active rows are written: the source shape has no active column, so a deactivated row has
 * nowhere to say it is deactivated, and silently exporting one as live would be worse than
 * leaving it out. What comes out is exactly what the request form currently offers.
 */
function buildCsv(data: LaptopCostCenterAdminData): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;

  const byCompany = new Map<string, Department[]>();
  for (const d of data.departments) {
    if (!d.active) continue;
    const list = byCompany.get(d.companyCode);
    if (list) list.push(d);
    else byCompany.set(d.companyCode, [d]);
  }

  const lines = ['Country,Company Name,Department,Cost Center,Company Code'];
  for (const company of data.companies) {
    if (!company.active) continue;
    for (const d of byCompany.get(company.code) ?? []) {
      lines.push(
        [company.country, company.name, d.department, d.costCenter, company.code]
          .map(quote)
          .join(','),
      );
    }
  }
  // CRLF and a BOM because this file is opened in Excel far more often than anywhere else, and
  // without the BOM Excel reads it as the local ANSI codepage and mangles non-ASCII names.
  return `﻿${lines.join('\r\n')}\r\n`;
}

function ExportCsvButton({ data }: { data: LaptopCostCenterAdminData }) {
  function download() {
    const url = URL.createObjectURL(new Blob([buildCsv(data)], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'cost-center-mapping.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="text-right">
      <button
        onClick={download}
        disabled={data.empty}
        title="Same columns as the source workbook export"
        className="rounded-lg border border-slate-200 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
      >
        Export CSV
      </button>
      <p className="mt-1 text-[11px] text-slate-400">Active rows only</p>
    </div>
  );
}

/* ─── Companies & departments ─────────────────────────────────── */

/**
 * Master/detail rather than one table: 56 companies carry ~2,335 department rows between them,
 * and nobody scrolls that. Picking the company first is also how the request form asks for it.
 */
function CompaniesTab({ data, ctl }: { data: LaptopCostCenterAdminData; ctl: Ctl }) {
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.companies;
    return data.companies.filter((c) =>
      `${c.code} ${c.name} ${c.country}`.toLowerCase().includes(q),
    );
  }, [data.companies, search]);

  // Resolved from the list rather than held as an object, so a reload after an edit — or a
  // delete that removes the company outright — cannot leave a stale copy on screen.
  const selected = data.companies.find((c) => c.code === selectedCode) ?? null;
  const departments = useMemo(
    () => (selected ? data.departments.filter((d) => d.companyCode === selected.code) : []),
    [data.departments, selected],
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      {/* Both country fields suggest from the labels already in use, but neither is limited to
          them — a new country label only comes into existence by being typed on a company. */}
      <datalist id="cost-center-countries">
        {data.countries.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search code, name or country…"
          className={`${INPUT} mb-2 w-full bg-white`}
        />
        <div className="max-h-[560px] space-y-1.5 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="py-10 text-center text-[12px] text-slate-400">No companies match.</div>
          )}
          {filtered.map((c) => (
            <button
              key={c.code}
              onClick={() => setSelectedCode(c.code)}
              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                selectedCode === c.code
                  ? 'border-[#059669] bg-white ring-1 ring-[#059669]/20'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-slate-500">
                  {c.code}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-[12.5px] font-semibold ${
                    c.active ? 'text-slate-800' : 'text-slate-400'
                  }`}
                >
                  {c.name}
                </span>
                <Pill active={c.active} />
              </div>
              <div
                className={`mt-0.5 text-[11px] ${c.active ? 'text-slate-500' : 'text-slate-400'}`}
              >
                {c.country} · {c.departmentCount} departments
              </div>
            </button>
          ))}
        </div>
        <div className="mt-3 border-t border-slate-200 pt-3">
          <AddCompanyForm ctl={ctl} onAdded={setSelectedCode} />
        </div>
      </div>

      {selected ? (
        <div className="space-y-4">
          <CompanyDetail
            key={selected.code}
            company={selected}
            totalDepartments={
              data.departments.filter((d) => d.companyCode === selected.code).length
            }
            ctl={ctl}
            onDeleted={() => setSelectedCode(null)}
          />
          <DepartmentsPanel
            key={`departments-${selected.code}`}
            company={selected}
            departments={departments}
            ctl={ctl}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white py-20 text-center text-[12.5px] text-slate-400">
          Pick a company to edit its departments.
        </div>
      )}
    </div>
  );
}

function AddCompanyForm({ ctl, onAdded }: { ctl: Ctl; onAdded: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const KEY = 'company:add';

  async function submit() {
    const c = code.trim();
    if (!COMPANY_CODE_RE.test(c)) {
      setInvalid('Company code must be exactly four digits.');
      return;
    }
    if (!name.trim() || !country.trim()) {
      setInvalid('Name and country are both required.');
      return;
    }
    setInvalid(null);
    if (await ctl.run(KEY, () => addCostCenterCompany(c, name.trim(), country.trim()))) {
      setCode('');
      setName('');
      setCountry('');
      setOpen(false);
      onAdded(c);
    }
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-slate-300 py-2 text-[12px] font-semibold text-slate-500 hover:border-[#059669] hover:text-[#047857]"
      >
        + Add company
      </button>
    );

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          placeholder="0000"
          inputMode="numeric"
          className={`${INPUT} w-20 bg-white font-mono`}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
          className={`${INPUT} flex-1 bg-white`}
        />
      </div>
      <input
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
          if (e.key === 'Escape') setOpen(false);
        }}
        list="cost-center-countries"
        placeholder="Country label"
        className={`${INPUT} w-full bg-white`}
      />
      <p className="text-[11px] leading-relaxed text-slate-400">
        The code cannot be changed later — it is stored on every request raised against the company.
      </p>
      <div className="flex gap-2">
        <button
          disabled={ctl.anyBusy}
          onClick={submit}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          style={{ background: BRAND }}
        >
          {ctl.busyOn(KEY) ? 'Adding…' : 'Add'}
        </button>
        <button
          onClick={() => {
            setOpen(false);
            setInvalid(null);
          }}
          className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-slate-400 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
      <FieldError message={invalid ?? ctl.errorOn(KEY)} />
    </div>
  );
}

function CompanyDetail({
  company,
  totalDepartments,
  ctl,
  onDeleted,
}: {
  company: Company;
  /** Active and inactive both, because deleting the company takes every one of them. */
  totalDepartments: number;
  ctl: Ctl;
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(company.name);
  const [country, setCountry] = useState(company.country);
  const [invalid, setInvalid] = useState<string | null>(null);

  const saveKey = `company:save:${company.code}`;
  const activeKey = `company:active:${company.code}`;
  const deleteKey = `company:delete:${company.code}`;

  function cancel() {
    setEditing(false);
    setName(company.name);
    setCountry(company.country);
    setInvalid(null);
  }

  async function save() {
    if (!name.trim() || !country.trim()) {
      setInvalid('Name and country are both required.');
      return;
    }
    setInvalid(null);
    if (
      await ctl.run(saveKey, () =>
        updateCostCenterCompany(company.code, name.trim(), country.trim()),
      )
    )
      setEditing(false);
  }

  async function confirmDelete() {
    const warning =
      `Delete "${company.name}" (${company.code}) and all ${totalDepartments} department ` +
      `${totalDepartments === 1 ? 'row' : 'rows'} filed under it? This cannot be undone.\n\n` +
      'Deactivating is the usual choice: it hides the company from new requests and keeps the ' +
      'mapping that past requests were raised against.';
    if (!confirm(warning)) return;
    // Clearing the selection matters: the company it pointed at is gone from the reloaded list.
    if (await ctl.run(deleteKey, () => deleteCostCenterCompany(company.code))) onDeleted();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {editing ? (
          <div className="flex min-w-0 flex-1 flex-wrap gap-2">
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') cancel();
              }}
              className={`${INPUT} min-w-[180px] flex-1`}
            />
            <input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void save();
                if (e.key === 'Escape') cancel();
              }}
              list="cost-center-countries"
              className={`${INPUT} w-48`}
            />
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">
                {company.code}
              </span>
              <h3
                className={`text-[14px] font-bold ${company.active ? 'text-slate-900' : 'text-slate-400'}`}
              >
                {company.name}
              </h3>
              <Pill active={company.active} />
            </div>
            <p className="mt-0.5 text-[12px] text-slate-500">
              {company.country} · {company.departmentCount} active departments
            </p>
          </div>
        )}

        <div className="flex shrink-0 items-center gap-1.5">
          {editing ? (
            <>
              <button
                disabled={ctl.anyBusy}
                onClick={save}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-[#047857] hover:bg-slate-50 disabled:opacity-40"
              >
                {ctl.busyOn(saveKey) ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancel}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-400 hover:bg-slate-50"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50"
              >
                Edit
              </button>
              <button
                disabled={ctl.anyBusy}
                onClick={() =>
                  void ctl.run(activeKey, () =>
                    setCostCenterCompanyActive(company.code, !company.active),
                  )
                }
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                {ctl.busyOn(activeKey) ? 'Saving…' : company.active ? 'Deactivate' : 'Reactivate'}
              </button>
              <button
                disabled={ctl.anyBusy}
                onClick={confirmDelete}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                {ctl.busyOn(deleteKey) ? 'Deleting…' : 'Delete'}
              </button>
            </>
          )}
        </div>
      </div>
      <FieldError
        message={
          invalid ?? ctl.errorOn(saveKey) ?? ctl.errorOn(activeKey) ?? ctl.errorOn(deleteKey)
        }
      />
      {editing && (
        <p className="mt-2 text-[11px] text-slate-400">
          The code stays {company.code}: it is stored on every request already raised against this
          company, so retire it and add a new company rather than renumbering.
        </p>
      )}
    </div>
  );
}

function DepartmentsPanel({
  company,
  departments,
  ctl,
}: {
  company: Company;
  departments: Department[];
  ctl: Ctl;
}) {
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => `${d.department} ${d.costCenter}`.toLowerCase().includes(q));
  }, [departments, filter]);

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-[13px] font-bold text-slate-900">Departments</h3>
          <p className="text-[11.5px] text-slate-500">
            {departments.length} rows under {company.code}. Click a row to edit it.
          </p>
        </div>
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter departments…"
          className={`${INPUT} w-56`}
        />
      </div>

      <div className="max-h-[480px] overflow-y-auto">
        <table className="w-full border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-white shadow-[0_1px_0_0_#e2e8f0]">
            <tr className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2">Department</th>
              <th className="w-40 px-3 py-2">Cost center</th>
              <th className="w-56 px-3 py-2 text-right">Actions</th>
            </tr>
            <AddDepartmentRow companyCode={company.code} ctl={ctl} />
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-10 text-center text-[12px] text-slate-400">
                  {departments.length === 0
                    ? 'No departments yet — add the first one above.'
                    : 'No departments match the filter.'}
                </td>
              </tr>
            )}
            {rows.map((d) => (
              <DepartmentRow key={d.id} department={d} ctl={ctl} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AddDepartmentRow({ companyCode, ctl }: { companyCode: string; ctl: Ctl }) {
  const [department, setDepartment] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [invalid, setInvalid] = useState<string | null>(null);

  const KEY = `department:add:${companyCode}`;

  async function submit() {
    const dept = department.trim();
    const cc = costCenter.trim().toUpperCase();
    if (!dept) {
      setInvalid('Department is required.');
      return;
    }
    if (!COST_CENTER_RE.test(cc)) {
      setInvalid(COST_CENTER_HINT);
      return;
    }
    setInvalid(null);
    if (await ctl.run(KEY, () => addCostCenterDepartment(companyCode, dept, cc))) {
      setDepartment('');
      setCostCenter('');
    }
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void submit();
    if (e.key === 'Escape') {
      setDepartment('');
      setCostCenter('');
      setInvalid(null);
    }
  }

  return (
    <>
      <tr className="bg-slate-50">
        <td className="px-4 py-2">
          <input
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            onKeyDown={onKey}
            placeholder="New department"
            className={`${INPUT} w-full bg-white`}
          />
        </td>
        <td className="px-3 py-2">
          <input
            value={costCenter}
            onChange={(e) => setCostCenter(e.target.value.toUpperCase())}
            onKeyDown={onKey}
            placeholder="C000000000"
            maxLength={10}
            className={`${INPUT} w-full bg-white font-mono`}
          />
        </td>
        <td className="px-3 py-2 text-right">
          <button
            disabled={ctl.anyBusy}
            onClick={submit}
            className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {ctl.busyOn(KEY) ? 'Adding…' : 'Add department'}
          </button>
        </td>
      </tr>
      {(invalid ?? ctl.errorOn(KEY)) && (
        <tr className="bg-slate-50">
          <td colSpan={3} className="px-4 pb-2">
            <FieldError message={invalid ?? ctl.errorOn(KEY)} />
          </td>
        </tr>
      )}
    </>
  );
}

function DepartmentRow({ department, ctl }: { department: Department; ctl: Ctl }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(department.department);
  const [costCenter, setCostCenter] = useState(department.costCenter);
  const [invalid, setInvalid] = useState<string | null>(null);

  const saveKey = `department:save:${department.id}`;
  const activeKey = `department:active:${department.id}`;
  const deleteKey = `department:delete:${department.id}`;

  function startEditing() {
    setName(department.department);
    setCostCenter(department.costCenter);
    setInvalid(null);
    setEditing(true);
  }

  function cancel() {
    setEditing(false);
    setInvalid(null);
  }

  async function save() {
    const dept = name.trim();
    const cc = costCenter.trim().toUpperCase();
    if (!dept) {
      setInvalid('Department is required.');
      return;
    }
    if (!COST_CENTER_RE.test(cc)) {
      setInvalid(COST_CENTER_HINT);
      return;
    }
    setInvalid(null);
    if (await ctl.run(saveKey, () => updateCostCenterDepartment(department.id, dept, cc)))
      setEditing(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') void save();
    if (e.key === 'Escape') cancel();
  }

  const error = invalid ?? ctl.errorOn(saveKey) ?? ctl.errorOn(activeKey) ?? ctl.errorOn(deleteKey);

  return (
    <>
      <tr className={department.active ? '' : 'bg-slate-50/60'}>
        {editing ? (
          <>
            <td className="px-4 py-1.5">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={onKey}
                className={`${INPUT} w-full`}
              />
            </td>
            <td className="px-3 py-1.5">
              <input
                value={costCenter}
                onChange={(e) => setCostCenter(e.target.value.toUpperCase())}
                onKeyDown={onKey}
                maxLength={10}
                className={`${INPUT} w-full font-mono`}
              />
            </td>
            <td className="px-3 py-1.5 text-right">
              <button
                disabled={ctl.anyBusy}
                onClick={save}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-[#047857] hover:bg-slate-50 disabled:opacity-40"
              >
                {ctl.busyOn(saveKey) ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={cancel}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-400 hover:bg-slate-50"
              >
                Cancel
              </button>
            </td>
          </>
        ) : (
          <>
            <td className="px-4 py-2">
              <button
                onClick={startEditing}
                className={`flex w-full items-center gap-2 text-left text-[12.5px] ${
                  department.active ? 'text-slate-800' : 'text-slate-400'
                }`}
              >
                <span className="truncate">{department.department}</span>
                <Pill active={department.active} />
              </button>
            </td>
            <td className="px-3 py-2">
              <button
                onClick={startEditing}
                className={`w-full text-left font-mono text-[12px] ${
                  department.active ? 'text-slate-600' : 'text-slate-400'
                }`}
              >
                {department.costCenter}
              </button>
            </td>
            <td className="whitespace-nowrap px-3 py-2 text-right">
              <button
                disabled={ctl.anyBusy}
                onClick={() =>
                  void ctl.run(activeKey, () =>
                    setCostCenterDepartmentActive(department.id, !department.active),
                  )
                }
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                {ctl.busyOn(activeKey)
                  ? 'Saving…'
                  : department.active
                    ? 'Deactivate'
                    : 'Reactivate'}
              </button>
              <button
                disabled={ctl.anyBusy}
                onClick={() => {
                  if (
                    confirm(
                      `Delete "${department.department}" (${department.costCenter})? ` +
                        'Deactivating hides it from new requests instead.',
                    )
                  )
                    void ctl.run(deleteKey, () => deleteCostCenterDepartment(department.id));
                }}
                className="rounded px-2 py-1 text-[11.5px] font-semibold text-red-500 hover:bg-red-50 disabled:opacity-40"
              >
                {ctl.busyOn(deleteKey) ? 'Deleting…' : 'Delete'}
              </button>
            </td>
          </>
        )}
      </tr>
      {error && (
        <tr>
          <td colSpan={3} className="px-4 pb-2">
            <FieldError message={error} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ─── Country map ─────────────────────────────────────────────── */

function CountryMapTab({ data, ctl }: { data: LaptopCostCenterAdminData; ctl: Ctl }) {
  const companiesByCountry = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of data.companies) {
      if (c.active) counts.set(c.country, (counts.get(c.country) ?? 0) + 1);
    }
    return counts;
  }, [data.companies]);

  return (
    <div className="max-w-4xl">
      <p className="mb-4 text-[12.5px] leading-relaxed text-slate-500">
        A requester picks their country on the request form, and that choice decides which companies
        the Cost Allocation dropdown offers. The form&apos;s country list rarely matches the
        workbook&apos;s labels one-for-one — Abu Dhabi reaches both UAE and EOS JAFZA, for instance
        — so this table says which labels each form country reaches.
      </p>

      {data.unreachableCountries.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900">
          <p className="font-semibold">
            {data.unreachableCountries.length} country{' '}
            {data.unreachableCountries.length === 1 ? 'label is' : 'labels are'} not reached by any
            form country.
          </p>
          <p className="mt-0.5">
            Companies filed under {data.unreachableCountries.length === 1 ? 'it' : 'them'} cannot be
            picked by anyone, whatever their active flag says. Add the label to a form country
            below, or move those companies to a label that is reached.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.unreachableCountries.map((c) => (
              <span
                key={c}
                className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-[11.5px] font-semibold text-amber-800"
              >
                {c} · {companiesByCountry.get(c) ?? 0} companies
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {data.requestorCountries.map((country) => (
          <CountryMapRow
            key={country}
            requestorCountry={country}
            mapped={data.countryMap[country] ?? []}
            options={data.countries}
            companiesByCountry={companiesByCountry}
            ctl={ctl}
          />
        ))}
      </div>
    </div>
  );
}

function CountryMapRow({
  requestorCountry,
  mapped,
  options,
  companiesByCountry,
  ctl,
}: {
  requestorCountry: string;
  mapped: string[];
  options: string[];
  companiesByCountry: Map<string, number>;
  ctl: Ctl;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>(mapped);

  const KEY = `map:${requestorCountry}`;
  const reachableCompanies = mapped.reduce((n, c) => n + (companiesByCountry.get(c) ?? 0), 0);

  function startEditing() {
    setSelected(mapped);
    setEditing(true);
  }

  function toggle(label: string) {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  }

  async function save() {
    // The action replaces the whole set, so `selected` is sent as-is — including empty, which is
    // a legitimate (if drastic) choice and is exactly what the warning below is for.
    if (await ctl.run(KEY, () => setCostCenterCountryMapping(requestorCountry, selected)))
      setEditing(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900">{requestorCountry}</div>
          <div className="text-[11.5px] text-slate-500">
            {mapped.length === 0 ? (
              <span className="font-semibold text-amber-700">
                Reaches nothing — this country&apos;s requesters get an empty company dropdown.
              </span>
            ) : (
              `${reachableCompanies} companies via ${mapped.length} ${mapped.length === 1 ? 'label' : 'labels'}`
            )}
          </div>
        </div>
        {editing ? (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              disabled={ctl.anyBusy}
              onClick={save}
              className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
              style={{ background: BRAND }}
            >
              {ctl.busyOn(KEY) ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded px-2 py-1 text-[11.5px] font-semibold text-slate-400 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={startEditing}
            className="shrink-0 rounded px-2 py-1 text-[11.5px] font-semibold text-slate-500 hover:bg-slate-50"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {options.map((label) => {
            const on = selected.includes(label);
            return (
              <button
                key={label}
                onClick={() => toggle(label)}
                className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                  on
                    ? 'border-[#059669] bg-[#059669] text-white'
                    : 'border-slate-200 text-slate-500 hover:border-slate-300'
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : (
        mapped.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {mapped.map((label) => (
              <span
                key={label}
                className="rounded-full bg-slate-100 px-2 py-0.5 text-[11.5px] font-medium text-slate-600"
              >
                {label}
              </span>
            ))}
          </div>
        )
      )}

      <FieldError message={ctl.errorOn(KEY)} />
    </div>
  );
}
