'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Box, Shield, Layers, User, ArrowRight, ChevronRight, Download } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../../constants';
import { StatTile } from '../../ui';
import { getCountryGuideRows } from '@/app/actions/sourceguide';
import type { SgCountryDashboard } from '@/app/actions/sourceguide';
import { downloadXlsx } from '../../exportXlsx';

const CAT_ICONS = [Box, Layers, Shield];

export default function CountryDashboardClient({ data }: { data: SgCountryDashboard }) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const maxCat = Math.max(1, ...data.categories.map(c => c.commodities));

  async function exportGuide() {
    setExporting(true);
    try {
      const rows = await getCountryGuideRows(data.code);
      downloadXlsx(`sourceguide-${data.code}-guide.xlsx`, rows.map(r => ({
        Category: r.category, 'Sub-Category': r.subCategory, Family: r.family,
        Commodity: r.commodity, UNSPSC: r.unspsc, 'Spend Type': r.spendType,
        Tier: r.tier, 'Supplier Code': r.supplierCode, 'Supplier Name': r.supplierName,
        'Supplier Email': r.supplierEmail,
      })), `${data.name} guide`);
    } finally {
      setExporting(false);
    }
  }
  const statusStyle = data.status === 'Published'
    ? { bg: '#dcfce7', col: '#15803d' }
    : data.status === 'Draft' ? { bg: '#f6efdf', col: '#b07d24' } : { bg: '#ececed', col: '#58595b' };

  function toCountrySearch(catId?: string) {
    const p = new URLSearchParams({ country: data.code });
    if (catId) p.set('cat', catId);
    router.push(`/sourceguide/search?${p.toString()}`);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-7 lg:px-8">
      <button onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-[#eef0ef] px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-200">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      {/* Header */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-4 px-7 py-6" style={{ background: `linear-gradient(180deg, ${SG_BRAND_SOFT}, #fff)` }}>
          <span className="h-12 w-16 shrink-0 rounded-lg shadow-sm" style={{ background: data.tone ?? '#999' }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-[26px] font-bold tracking-tight">{data.name}</h1>
              <span className="rounded-full px-2.5 py-1 text-[11px] font-semibold" style={{ background: statusStyle.bg, color: statusStyle.col }}>{data.status}</span>
              <span className="rounded-md border border-slate-200 bg-[#eef0ef] px-2 py-0.5 font-mono text-[11.5px] text-slate-500">{data.version}</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[13px] text-slate-500">
              <User className="h-4 w-4" style={{ color: SG_BRAND }} />
              <span>Champion(s):</span>
              <b className="text-slate-700">{data.champions.length ? data.champions.join(' · ') : 'Unassigned'}</b>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={exportGuide} disabled={exporting}
              className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 hover:border-[#6AAF8E] disabled:opacity-50">
              <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export guide'}
            </button>
            <button onClick={() => toCountrySearch()}
              className="flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold text-white" style={{ background: SG_BRAND }}>
              Browse all <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 p-6 md:grid-cols-4">
          <StatTile value={data.stats.commodities} label="Commodities covered" icon={<Box className="h-4 w-4" />} />
          <StatTile value={data.stats.suppliers} label="Suppliers used" icon={<Shield className="h-4 w-4" />} />
          <StatTile value={data.stats.mappings} label="Total mappings" icon={<Layers className="h-4 w-4" />} />
          <StatTile value={data.stats.preferred} label="Preferred mappings" icon={<Box className="h-4 w-4" />} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.3fr_1fr]">
        {/* Category breakdown */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-[15px] font-bold tracking-tight text-slate-900">Categories covered</h2>
          {data.categories.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-400">No mappings in this country yet.</p>
          ) : (
            <div className="space-y-2">
              {data.categories.map((cat, i) => {
                const Icon = CAT_ICONS[i % CAT_ICONS.length];
                return (
                  <button key={cat.id} onClick={() => toCountrySearch(cat.id)}
                    className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#eaf4ef]">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: SG_BRAND_SOFT, color: SG_BRAND }}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="w-44 shrink-0 truncate text-[13.5px] font-medium text-slate-800">{cat.name}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span className="block h-full rounded-full" style={{ width: `${(cat.commodities / maxCat) * 100}%`, background: SG_BRAND }} />
                    </span>
                    <span className="w-10 shrink-0 text-right font-mono text-[11.5px] text-slate-500">{cat.commodities}</span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Top suppliers */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-[15px] font-bold tracking-tight text-slate-900">Top suppliers</h2>
          {data.topSuppliers.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-slate-400">No suppliers mapped yet.</p>
          ) : (
            <div className="space-y-1">
              {data.topSuppliers.map(s => (
                <button key={s.code} onClick={() => router.push(`/sourceguide/suppliers/${encodeURIComponent(s.code)}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-[#eaf4ef]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-slate-800">{s.name}</span>
                    <span className="font-mono text-[11px] text-slate-400">{s.code}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-[#ececed] px-2.5 py-0.5 text-[11px] font-semibold text-slate-500">{s.mappings}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
