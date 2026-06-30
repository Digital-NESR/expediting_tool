'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CatalogManagerShell from '../../components/CatalogManagerShell';
import { Icon, StatusPill, Avatar, Chip } from '../../components/CatalogManagerUI';
import type { SupplierProfile } from '@/app/actions/catalog-manager';
import { fmtMoney, fmtDateNice } from '@/lib/catalog-manager-utils';

export default function SupplierProfileClient({
  profile, roleLabel, canApprove, canAdmin, pendingCount,
}: {
  profile: SupplierProfile;
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  pendingCount: number;
}) {
  const router = useRouter();

  return (
    <CatalogManagerShell
      title={profile.name}
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      showScope={false}
      headerAction={
        <Link href="/catalog-manager/suppliers" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name="arrowRight" className="h-4 w-4 rotate-180" /> <span className="hidden sm:inline">Suppliers</span>
        </Link>
      }
    >
      <div className="mx-auto max-w-4xl space-y-5">
        {/* header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#307c4c]/10 text-[#1d4f31]"><Icon name="building" className="h-6 w-6" /></span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">{profile.name}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
                <span className="font-mono">{profile.vendor_code}</span>
                {profile.manager && <><span>·</span><span className="inline-flex items-center gap-1.5"><Avatar name={profile.manager} size={18} /> {profile.manager}</span></>}
              </div>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"><p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Rates</p><p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{profile.entries.length}</p></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"><p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Active</p><p className="mt-0.5 text-xl font-bold tabular-nums text-[#307c4c]">{profile.activeCount}</p></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 px-3.5 py-3"><p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">Countries</p><p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{profile.countries.length}</p></div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {profile.countries.map((c) => <Chip key={c.code}><Icon name="globe" className="h-3 w-3" />{c.flag} {c.name}</Chip>)}
          </div>
        </div>

        {/* contacts */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-2.5 text-[13.5px] font-bold text-slate-900">Contacts</h2>
          {profile.contactEmails.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.contactEmails.map((email) => (
                <a key={email} href={`mailto:${email}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12.5px] font-medium text-[#1d4f31] hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5">
                  <Icon name="user" className="h-3.5 w-3.5" /> {email}
                </a>
              ))}
            </div>
          ) : (
            <p className="text-[12.5px] text-slate-400">No contact emails on file in the SAP supplier master.</p>
          )}
        </div>

        {/* rate card */}
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5"><h2 className="text-[13.5px] font-bold text-slate-900">Rate card</h2></div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Service / item</th>
                  <th className="px-4 py-3">Country</th>
                  <th className="px-4 py-3">UOM</th>
                  <th className="px-4 py-3 text-right">Unit price</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {profile.entries.map((e) => (
                  <tr key={e.id} onClick={() => router.push(`/catalog-manager/catalog/${e.id}`)} className="cursor-pointer border-b border-slate-100 hover:bg-[#307c4c]/5">
                    <td className="px-4 py-3 font-mono text-[12px] text-slate-500">{e.code}</td>
                    <td className="max-w-[280px] px-4 py-3"><div className="truncate font-medium text-slate-800">{e.commodity || e.item_name}</div><div className="truncate text-[11px] text-slate-400">{e.category_name}</div></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-500">{e.country_flag} {e.country_code}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-500">{e.uom_name}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right"><span className="font-mono font-semibold text-slate-900">{fmtMoney(e.unit_price, e.currency_code)}</span> <span className="text-[10.5px] text-slate-400">{e.currency_code}</span></td>
                    <td className="px-4 py-3"><StatusPill status={e.status} sm /></td>
                    <td className="whitespace-nowrap px-4 py-3 text-[12.5px] text-slate-500">{e.expiry_date ? fmtDateNice(e.expiry_date) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </CatalogManagerShell>
  );
}
