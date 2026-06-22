'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, User, Box } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../../constants';
import { TierBadge, CountryFlag, SupAvatar, PathTrail } from '../../ui';
import type { SgCommodityDetail, SgCountry, SgMapping } from '@/types/sourceguide';

export default function CommodityDetailClient({
  detail, countries,
}: {
  detail: SgCommodityDetail;
  countries: SgCountry[];
}) {
  const router = useRouter();
  const { commodity: com, countries: cc, mappingsByCountry } = detail;
  const [country, setCountry] = useState<string | null>(cc[0] ?? null);
  const countryByCode = useMemo(() => new Map(countries.map(c => [c.code, c])), [countries]);

  const maps = country ? mappingsByCountry[country] ?? [] : [];
  const pref = maps.filter(m => m.tier === 'Preferred');
  const backups = maps.filter(m => m.tier === 'Backup');

  return (
    <div className="mx-auto max-w-[980px] px-6 py-7 lg:px-8">
      <button
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-[#eef0ef] px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Header */}
        <div className="border-b border-slate-100 px-7 py-6" style={{ background: `linear-gradient(180deg, ${SG_BRAND_SOFT}, #fff)` }}>
          <PathTrail path={com.path.slice(0, 3)} />
          <div className="mt-1 flex flex-wrap items-center gap-3.5">
            <h1 className="text-[26px] font-bold tracking-tight">{com.name}</h1>
            {com.code && (
              <span className="rounded-md border border-slate-200 bg-[#eef0ef] px-2.5 py-1 font-mono text-[12px] text-slate-500">
                UNSPSC {com.code}
              </span>
            )}
            <span className="rounded-full bg-[#ececed] px-2.5 py-1 text-[11px] font-semibold text-slate-500">{com.spendType}</span>
          </div>
          {com.description && <p className="mt-2.5 max-w-[640px] text-[14px] leading-relaxed text-slate-500">{com.description}</p>}
          <div className="mt-4 flex flex-wrap gap-6">
            <Meta label="Category" value={com.category} />
            <Meta label="Sub-Category" value={com.subCategory ?? '—'} />
            <Meta label="Family" value={com.family ?? '—'} />
          </div>
        </div>

        {cc.length > 0 ? (
          <>
            {/* Country selector */}
            <div className="flex flex-wrap items-center gap-2 px-7 pt-4">
              <span className="mr-1 text-[12.5px] font-semibold text-slate-500">Country:</span>
              {cc.map(code => {
                const c = countryByCode.get(code);
                const on = country === code;
                return (
                  <button
                    key={code}
                    onClick={() => setCountry(code)}
                    className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                    style={on
                      ? { background: SG_BRAND, borderColor: SG_BRAND, color: '#fff' }
                      : { borderColor: '#D1D3D4', background: '#fff', color: '#58595B' }}
                  >
                    <span className="h-[10px] w-[13px] rounded-sm" style={{ background: c?.tone ?? '#999' }} />
                    {c?.name ?? code}
                  </button>
                );
              })}
            </div>

            <div className="px-7 pb-7 pt-5">
              {pref.length > 0 && (
                <>
                  <SectionLabel>Preferred supplier{pref.length > 1 ? 's' : ''}</SectionLabel>
                  <div className={`grid gap-3.5 ${pref.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                    {pref.map(m => <SupplierCard key={m.id} mapping={m} country={countryByCode.get(m.country)} onOpen={() => router.push(`/sourceguide/suppliers/${m.supplierId}`)} />)}
                  </div>
                </>
              )}
              {backups.length > 0 && (
                <>
                  <SectionLabel className="mt-6">Backup suppliers · {backups.length}</SectionLabel>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    {backups.map(m => <SupplierCard key={m.id} mapping={m} country={countryByCode.get(m.country)} onOpen={() => router.push(`/sourceguide/suppliers/${m.supplierId}`)} />)}
                  </div>
                </>
              )}
              {maps.length === 0 && (
                <div className="py-12 text-center text-[13.5px] text-slate-500">
                  No active suppliers mapped for {countryByCode.get(country!)?.name ?? country}.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="px-6 py-12 text-center">
            <Box className="mx-auto h-8 w-8 text-slate-300" />
            <div className="mt-2.5 font-semibold text-slate-900">No suppliers mapped yet</div>
            <div className="mt-1.5 text-[13.5px] text-slate-500">
              This commodity exists in the taxonomy but has no preferred or backup supplier in any country guide.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-medium">{value}</div>
    </div>
  );
}

function SectionLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`mb-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] ${className}`} style={{ color: SG_BRAND }}>
      {children}
    </div>
  );
}

function SupplierCard({ mapping, country, onOpen }: { mapping: SgMapping; country?: SgCountry; onOpen: () => void }) {
  const pref = mapping.tier === 'Preferred';
  return (
    <div
      className="relative rounded-2xl border bg-white p-5"
      style={{ borderColor: pref ? '#6AAF8E' : '#D1D3D4', borderWidth: pref ? 1.5 : 1 }}
    >
      {pref && <div className="absolute left-6 right-6 top-0 h-[3px] rounded-b" style={{ background: SG_BRAND }} />}
      <div className="flex items-start gap-3.5">
        <SupAvatar name={mapping.supplierName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[15.5px] font-bold tracking-tight">{mapping.supplierName}</span>
            <TierBadge tier={mapping.tier} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            {mapping.supplierCode && <span className="font-mono text-slate-600">Vendor {mapping.supplierCode}</span>}
            {country && <CountryFlag country={country} showName />}
          </div>
        </div>
      </div>
      <hr className="my-3.5 border-slate-100" />
      <div className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <User className="h-4 w-4" style={{ color: SG_BRAND }} />
        <span className="text-slate-500">Source Guide owner</span>
        <b>{country?.champion || 'Unassigned'}</b>
      </div>
      <button
        onClick={onOpen}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white py-2 text-[12.5px] font-semibold text-slate-700 hover:border-[#6AAF8E]"
      >
        View full profile <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
