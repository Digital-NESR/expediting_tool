'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import CatalogManagerShell from '../components/CatalogManagerShell';
import { Icon, Chip, Avatar, StatCard, Card, CardHeader, Meter, StatusPill, EmptyState } from '../components/CatalogManagerUI';
import BulkImportPanel from '../catalog/import/BulkImportPanel';
import {
  toggleCountryStatus, toggleCategoryStatus, addUom, setUserRole,
  addCountryApprover, removeCountryApprover, setApprovalThreshold, removeApprovalThreshold,
} from '@/app/actions/catalog-manager';
import type {
  AppUserRow, ApprovalThresholdRule, CatalogAnalyticsData, CatalogEntry, CountryApproverRow, CountryRow, CurrencyRow, SupplierRow, UomRow, CatalogRole,
} from '@/types/catalog-manager';
import { fmtUsd, ALL_ROLES, spendTypeTone } from '@/lib/catalog-manager-utils';

type Tab = 'Overview' | 'Countries' | 'Spend categories' | 'Units of measure' | 'Currencies' | 'Suppliers' | 'Catalog migration' | 'Service activities' | 'Users & roles' | 'Country approvers' | 'Thresholds';
const TABS: Tab[] = ['Overview', 'Countries', 'Spend categories', 'Units of measure', 'Currencies', 'Suppliers', 'Catalog migration', 'Service activities', 'Users & roles', 'Country approvers', 'Thresholds'];

interface AdminCategory { id: number; name: string; type: string; status: string; subs: string[] }

function StatusToggle({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group inline-flex items-center gap-2 text-[12px] font-semibold" aria-pressed={active}>
      <span className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors duration-200 ${active ? 'bg-[#307c4c]' : 'bg-slate-300 group-hover:bg-slate-400'}`}>
        <span className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-200 ${active ? 'translate-x-[15px]' : 'translate-x-[3px]'}`} />
      </span>
      <span className={active ? 'text-[#307c4c]' : 'text-slate-400'}>{active ? 'Active' : 'Inactive'}</span>
    </button>
  );
}

const thCls = 'px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400';
const tdCls = 'px-3 py-2.5';

export default function AdminClient({
  countries, currencies, uoms, suppliers, users, categories, approvers, thresholds, services, pendingCount,
  analytics, pirStats, pendingPreview, roleLabel,
}: {
  countries: CountryRow[];
  currencies: CurrencyRow[];
  uoms: UomRow[];
  suppliers: SupplierRow[];
  users: AppUserRow[];
  categories: AdminCategory[];
  approvers: CountryApproverRow[];
  thresholds: ApprovalThresholdRule[];
  services: { no: string; text: string; uom: string }[];
  pendingCount: number;
  analytics: CatalogAnalyticsData;
  pirStats: { total: number; suppliers: number; plants: number; countries: number };
  pendingPreview: CatalogEntry[];
  roleLabel: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('Overview');
  const [, startTransition] = useTransition();
  const [newUom, setNewUom] = useState('');
  const [supQ, setSupQ] = useState('');
  const [svcQ, setSvcQ] = useState('');

  // thresholds form state
  const globalRule = thresholds.find((t) => t.country_code == null && t.spend_category_id == null);
  const [globalAmt, setGlobalAmt] = useState(String(globalRule?.threshold_usd ?? 50000));
  const [thrCountry, setThrCountry] = useState('');
  const [thrCategory, setThrCategory] = useState<number | ''>('');
  const [thrAmt, setThrAmt] = useState('');

  // country-approver form state
  const [caUser, setCaUser] = useState<number | ''>('');
  const [caCountry, setCaCountry] = useState('');
  const [caCategory, setCaCategory] = useState<number | ''>('');

  const refresh = (fn: () => Promise<void>) => startTransition(async () => { await fn(); router.refresh(); });

  return (
    <CatalogManagerShell title="Administration" roleLabel={roleLabel} canApprove canAdmin pendingCount={pendingCount} showScope={false}>
      <div className="mx-auto max-w-5xl">
        <div className="mb-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">Administration</h1>
          <p className="mt-1 text-sm text-slate-500">Master data &amp; system configuration. Changes take effect immediately in entry forms.</p>
        </div>

        <div className="mb-5 flex flex-wrap gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`-mb-px rounded-t-lg border-b-2 px-3.5 py-2.5 text-[13.5px] font-semibold transition-colors ${tab === t ? 'border-[#307c4c] bg-[#307c4c]/[0.04] text-[#1d4f31]' : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}>{t}</button>
          ))}
        </div>

        <div className={tab === 'Catalog migration' || tab === 'Overview' ? '' : 'cm-fade-in rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm'}>
          {tab === 'Overview' && (() => {
            const maxCat = Math.max(1, ...analytics.byCategory.map((c) => c.activeCount));
            const roleCounts = ALL_ROLES.map((r) => ({ role: r, count: users.filter((u) => u.role === r).length }));
            return (
              <div className="cm-fade-in cm-stagger space-y-5">
                <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  <StatCard label="Active rates" value={analytics.activeCount.toLocaleString()} sub="Services catalog" icon="catalog" href="/catalog-manager/catalog?status=Active" />
                  <StatCard label="Pending approval" value={analytics.pendingCount.toLocaleString()} sub={analytics.pendingCount ? 'Awaiting sign-off' : 'Queue clear'} icon="approve" tone="amber" href="/catalog-manager/approvals" />
                  <StatCard label="Expiring ≤ 30 days" value={analytics.expiringCount.toLocaleString()} sub="Renew before lapse" icon="clock" tone="amber" href="/catalog-manager/catalog?expiring=1" />
                  <StatCard label="Suppliers" value={analytics.supplierCount.toLocaleString()} sub="With active rates" icon="building" tone="cyan" href="/catalog-manager/suppliers" />
                  <StatCard label="PIR / inventory records" value={pirStats.total.toLocaleString()} sub={`${pirStats.suppliers.toLocaleString()} suppliers`} icon="sheet" tone="ink" href="/catalog-manager/pir" />
                  <StatCard label="Catalog users" value={String(users.length)} sub={`${approvers.length} country approvers`} icon="user" />
                </section>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <Card className="p-5">
                    <CardHeader
                      className="mb-3"
                      title="Pending approvals"
                      sub="Highest-priority entries awaiting sign-off."
                      action={<Link href="/catalog-manager/approvals" className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-[#1d4f31] hover:underline">View all <Icon name="chevRight" className="h-3 w-3" /></Link>}
                    />
                    {pendingPreview.length === 0 ? (
                      <EmptyState icon="check" title="Queue is clear" sub="No entries are pending approval." />
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {pendingPreview.map((e) => (
                          <Link key={e.id} href={`/catalog-manager/catalog/${e.id}`} className="-mx-1 flex items-center gap-3 rounded-lg px-1 py-2.5 transition-colors hover:bg-slate-50">
                            <span className="w-16 shrink-0 font-mono text-[11px] text-slate-400">{e.code}</span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-800">{e.commodity || e.item_name}</span>
                            <span className="hidden shrink-0 truncate text-[12px] text-slate-500 sm:block">{e.supplier_name}</span>
                            <StatusPill status={e.status} sm />
                          </Link>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-5">
                    <CardHeader className="mb-3" title="By spend category" sub="Active rates grouped by taxonomy." />
                    {analytics.byCategory.length === 0 ? (
                      <EmptyState icon="layers" title="No active rates yet" />
                    ) : (
                      <div className="space-y-2.5">
                        {analytics.byCategory.slice(0, 6).map((c) => (
                          <div key={c.name} className="grid grid-cols-[minmax(90px,150px)_1fr_30px] items-center gap-3">
                            <span className="truncate text-[12px] font-medium text-slate-600">{c.name}</span>
                            <Meter pct={(c.activeCount / maxCat) * 100} className="h-2" />
                            <span className="text-right text-[12px] font-semibold tabular-nums text-slate-900">{c.activeCount}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  <Card className="p-5">
                    <CardHeader className="mb-3" title="Access & approvals" sub="Who can use and approve in the Catalog Repo." />
                    <div className="grid grid-cols-2 gap-2">
                      {roleCounts.map(({ role, count }) => (
                        <button key={role} onClick={() => setTab('Users & roles')} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5">
                          <p className="truncate text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{role}</p>
                          <p className="mt-1 text-xl font-bold tabular-nums text-slate-900">{count}</p>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setTab('Country approvers')} className="mt-2.5 flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition-colors hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5">
                      <span className="text-[12.5px] font-semibold text-slate-700">Country approvers configured</span>
                      <span className="inline-flex items-center gap-1 text-[13px] font-bold tabular-nums text-slate-900">{approvers.length} <Icon name="chevRight" className="h-3.5 w-3.5 text-slate-400" /></span>
                    </button>
                  </Card>
                </div>
              </div>
            );
          })()}

          {tab === 'Countries' && (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-slate-200"><th className={thCls}>Country</th><th className={thCls}>Code</th><th className={thCls}>Default currency</th><th className={`${thCls} text-right`}>Status</th></tr></thead>
              <tbody>
                {countries.map((c) => (
                  <tr key={c.code} className="border-b border-slate-100">
                    <td className={`${tdCls} font-medium`}>{c.flag} {c.name}</td>
                    <td className={`${tdCls} font-mono`}>{c.code}</td>
                    <td className={`${tdCls} text-slate-500`}>{c.default_currency}</td>
                    <td className={`${tdCls} text-right`}><StatusToggle active={c.status === 'Active'} onClick={() => refresh(() => toggleCountryStatus(c.code))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'Spend categories' && (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-slate-200"><th className={thCls}>Type</th><th className={thCls}>Category</th><th className={thCls}>Sub-categories</th><th className={`${thCls} text-right`}>Status</th></tr></thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 align-top">
                    <td className={tdCls}><Chip tone={spendTypeTone(c.type)}>{c.type}</Chip></td>
                    <td className={`${tdCls} font-semibold`}>{c.name}</td>
                    <td className={tdCls}><div className="flex flex-wrap gap-1.5">{c.subs.slice(0, 8).map((s) => <Chip key={s}>{s}</Chip>)}{c.subs.length > 8 && <Chip>+{c.subs.length - 8}</Chip>}</div></td>
                    <td className={`${tdCls} text-right`}><StatusToggle active={c.status === 'Active'} onClick={() => refresh(() => toggleCategoryStatus(c.id))} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'Units of measure' && (
            <div>
              <div className="flex flex-wrap gap-2">
                {uoms.map((u) => (
                  <span key={u.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] font-medium text-slate-700">{u.name}</span>
                ))}
              </div>
              <div className="mt-4 flex gap-2">
                <input value={newUom} onChange={(e) => setNewUom(e.target.value)} placeholder="New unit of measure…" className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20" />
                <button onClick={() => { if (newUom.trim()) { refresh(() => addUom(newUom.trim())); setNewUom(''); } }} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2b6f44]"><Icon name="plus" className="h-4 w-4" /> Add</button>
              </div>
            </div>
          )}

          {tab === 'Currencies' && (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-slate-200"><th className={thCls}>Currency</th><th className={thCls}>Decimals</th><th className={`${thCls} text-right`}>USD rate</th></tr></thead>
              <tbody>
                {currencies.map((c) => (
                  <tr key={c.code} className="border-b border-slate-100">
                    <td className={`${tdCls} font-mono font-semibold`}>{c.code}</td>
                    <td className={`${tdCls} text-slate-500`}>{c.decimals}</td>
                    <td className={`${tdCls} text-right font-mono`}>{c.usd_rate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'Suppliers' && (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[13px] text-slate-500">One accountable manager per supplier; auto-assigned on new entries.</p>
                <input value={supQ} onChange={(e) => setSupQ(e.target.value)} placeholder="Search supplier or code…" className="w-60 rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]" />
              </div>
              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-slate-200"><th className={thCls}>Supplier</th><th className={thCls}>Vendor code</th><th className={`${thCls} text-right`}>Accountable manager</th></tr></thead>
                <tbody>
                  {suppliers.filter((s) => !supQ.trim() || `${s.name} ${s.vendor_code}`.toLowerCase().includes(supQ.toLowerCase())).map((s) => (
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className={`${tdCls} font-semibold`}>{s.name}</td>
                      <td className={`${tdCls} font-mono text-slate-500`}>{s.vendor_code}</td>
                      <td className={`${tdCls} text-right text-slate-600`}>{s.accountable_manager ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'Catalog migration' && <BulkImportPanel />}

          {tab === 'Service activities' && (
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[13px] text-slate-500">{services.length} SAP service activities in the system. These appear as suggestions in the entry-form description field.</p>
                <input value={svcQ} onChange={(e) => setSvcQ(e.target.value)} placeholder="Search service or number…" className="w-60 rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]" />
              </div>
              <div className="max-h-[60vh] overflow-y-auto">
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-slate-200"><th className={thCls}>Activity number</th><th className={thCls}>Service short text</th><th className={`${thCls} text-right`}>Base UOM</th></tr></thead>
                  <tbody>
                    {services.filter((s) => !svcQ.trim() || `${s.text} ${s.no}`.toLowerCase().includes(svcQ.toLowerCase())).map((s) => (
                      <tr key={s.no} className="border-b border-slate-100">
                        <td className={`${tdCls} font-mono text-slate-500`}>{s.no}</td>
                        <td className={`${tdCls} font-medium text-slate-800`}>{s.text}</td>
                        <td className={`${tdCls} text-right text-slate-500`}>{s.uom || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'Users & roles' && (
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-slate-200"><th className={thCls}>User</th><th className={thCls}>Country</th><th className={`${thCls} text-right`}>Role</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-100">
                    <td className={tdCls}><div className="flex items-center gap-2.5"><Avatar name={u.full_name} size={28} /><div><div className="font-medium text-slate-900">{u.full_name}</div><div className="text-[11px] text-slate-400">{u.email}</div></div></div></td>
                    <td className={`${tdCls} text-slate-500`}>{u.country_code ?? '—'}</td>
                    <td className={`${tdCls} text-right`}>
                      <select value={u.role} onChange={(e) => refresh(() => setUserRole(u.id, e.target.value as CatalogRole))} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#307c4c]">
                        {ALL_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'Country approvers' && (
            <div>
              <p className="mb-4 text-[13px] text-slate-500">
                Define who may approve catalog entries for each country. An approver only sees the approval queue and can sign off for the
                countries assigned here. Leave the category blank to authorize <strong>all</strong> spend categories.
              </p>

              {/* add form */}
              <div className="mb-5 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[1fr_140px_1fr_auto]">
                <select value={caUser} onChange={(e) => setCaUser(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]">
                  <option value="">Select user…</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
                <select value={caCountry} onChange={(e) => setCaCountry(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]">
                  <option value="">Country…</option>
                  {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
                <select value={caCategory} onChange={(e) => setCaCategory(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]">
                  <option value="">All spend categories</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button
                  disabled={!caUser || !caCountry}
                  onClick={() => {
                    if (!caUser || !caCountry) return;
                    refresh(() => addCountryApprover(Number(caUser), caCountry, caCategory ? Number(caCategory) : null));
                    setCaUser(''); setCaCountry(''); setCaCategory('');
                  }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2b6f44] disabled:opacity-50"
                >
                  <Icon name="plus" className="h-4 w-4" /> Assign
                </button>
              </div>

              <table className="w-full text-[13px]">
                <thead><tr className="border-b border-slate-200"><th className={thCls}>Approver</th><th className={thCls}>Country</th><th className={thCls}>Spend category</th><th className={thCls}>Tier</th><th className={`${thCls} text-right`}></th></tr></thead>
                <tbody>
                  {approvers.map((a) => (
                    <tr key={a.id} className="border-b border-slate-100">
                      <td className={tdCls}><div className="flex items-center gap-2.5"><Avatar name={a.user_name ?? '?'} size={26} /><span className="font-medium text-slate-900">{a.user_name}</span></div></td>
                      <td className={tdCls}><Chip><Icon name="globe" className="h-3 w-3" />{a.country_code}</Chip></td>
                      <td className={`${tdCls} text-slate-600`}>{a.spend_category_name ?? <span className="text-slate-400">All categories</span>}</td>
                      <td className={`${tdCls} text-slate-500`}>Tier {a.tier}</td>
                      <td className={`${tdCls} text-right`}>
                        <button onClick={() => refresh(() => removeCountryApprover(a.id))} title="Remove" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Icon name="trash" className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                  {approvers.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-400">No country approvers assigned yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'Thresholds' && (
            <div className="space-y-5">
              <p className="text-[13px] text-slate-500">Entries at or above the applicable threshold (USD equivalent) require Approver sign-off. The most specific rule wins: country + category &gt; country &gt; category &gt; global default.</p>

              <div className="max-w-md rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-[12.5px] font-semibold text-slate-600">Global default threshold</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-semibold text-slate-400">$</span>
                  <input type="number" value={globalAmt} onChange={(e) => setGlobalAmt(e.target.value)} className="w-40 rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-[#307c4c]" />
                  <button onClick={() => refresh(() => setApprovalThreshold({ country_code: null, spend_category_id: null, threshold_usd: Number(globalAmt) }))} className="rounded-lg bg-[#307c4c] px-3.5 py-2 text-sm font-semibold text-white hover:bg-[#2b6f44]">Save</button>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">Overrides</p>
                <div className="mb-3 grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-[150px_1fr_140px_auto]">
                  <select value={thrCountry} onChange={(e) => setThrCountry(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]">
                    <option value="">Any country</option>
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                  </select>
                  <select value={thrCategory} onChange={(e) => setThrCategory(e.target.value ? Number(e.target.value) : '')} className="rounded-lg border border-slate-300 px-3 py-2 text-[13px] outline-none focus:border-[#307c4c]">
                    <option value="">Any spend category</option>
                    {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input type="number" value={thrAmt} onChange={(e) => setThrAmt(e.target.value)} placeholder="USD amount" className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-[13px] outline-none focus:border-[#307c4c]" />
                  <button
                    disabled={(!thrCountry && thrCategory === '') || !thrAmt}
                    onClick={() => { refresh(() => setApprovalThreshold({ country_code: thrCountry || null, spend_category_id: thrCategory === '' ? null : Number(thrCategory), threshold_usd: Number(thrAmt) })); setThrCountry(''); setThrCategory(''); setThrAmt(''); }}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2b6f44] disabled:opacity-50"
                  ><Icon name="plus" className="h-4 w-4" /> Add</button>
                </div>
                <table className="w-full text-[13px]">
                  <thead><tr className="border-b border-slate-200"><th className={thCls}>Country</th><th className={thCls}>Spend category</th><th className={`${thCls} text-right`}>Threshold</th><th className={`${thCls} text-right`}></th></tr></thead>
                  <tbody>
                    {thresholds.map((t) => (
                      <tr key={t.id} className="border-b border-slate-100">
                        <td className={tdCls}>{t.country_code ? <Chip><Icon name="globe" className="h-3 w-3" />{t.country_code}</Chip> : <span className="text-slate-400">Any country</span>}</td>
                        <td className={`${tdCls} text-slate-600`}>{t.spend_category_name ?? <span className="text-slate-400">Any category</span>}{t.country_code == null && t.spend_category_id == null && <span className="ml-1 text-[11px] font-semibold text-[#1d4f31]">(default)</span>}</td>
                        <td className={`${tdCls} text-right font-mono font-semibold text-slate-900`}>${fmtUsd(t.threshold_usd)}</td>
                        <td className={`${tdCls} text-right`}>
                          {t.country_code == null && t.spend_category_id == null ? (
                            <span className="text-[11px] text-slate-300">—</span>
                          ) : (
                            <button onClick={() => refresh(() => removeApprovalThreshold(t.id))} title="Remove override" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"><Icon name="trash" className="h-4 w-4" /></button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </CatalogManagerShell>
  );
}
