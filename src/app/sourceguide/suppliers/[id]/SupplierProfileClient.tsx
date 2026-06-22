'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, ChevronRight } from 'lucide-react';
import { SG_BRAND } from '../../constants';
import { TierBadge, CountryFlag, SupAvatar } from '../../ui';
import type { SgSupplierProfile, SgCommodity, SgCountry, SgMapping } from '@/types/sourceguide';

export default function SupplierProfileClient({
  profile, commodities, countries,
}: {
  profile: SgSupplierProfile;
  commodities: SgCommodity[];
  countries: SgCountry[];
}) {
  const router = useRouter();
  const comById = useMemo(() => new Map(commodities.map(c => [c.id, c])), [commodities]);
  const countryByCode = useMemo(() => new Map(countries.map(c => [c.code, c])), [countries]);

  const byCountry = useMemo(() => {
    const m: Record<string, SgMapping[]> = {};
    profile.mappings.forEach(mp => { (m[mp.country] ??= []).push(mp); });
    return m;
  }, [profile.mappings]);

  return (
    <div className="mx-auto max-w-[980px] px-6 py-7 lg:px-8">
      <button
        onClick={() => router.back()}
        className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-[#eef0ef] px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-7">
        <div className="flex flex-wrap items-start gap-4">
          <SupAvatar name={profile.name} size={64} />
          <div className="min-w-[240px] flex-1">
            <h1 className="text-[24px] font-bold tracking-tight">{profile.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2.5 text-[13.5px] text-slate-500">
              {profile.code && <span className="font-mono">Vendor {profile.code}</span>}
              {profile.countries.map(c => { const cc = countryByCode.get(c); return cc ? <CountryFlag key={c} country={cc} showName /> : null; })}
            </div>
          </div>
          <div className="flex gap-6">
            <Stat value={profile.totalCommodities} label="commodities" />
            <Stat value={profile.preferredCount} label="preferred" color={SG_BRAND} />
            <Stat value={profile.countries.length} label="countries" />
          </div>
        </div>
        {profile.champions.length > 0 && (
          <>
            <hr className="my-4 border-slate-100" />
            <div className="flex items-center gap-2.5 text-[13px]">
              <User className="h-4 w-4" style={{ color: SG_BRAND }} />
              <span className="text-slate-500">Source Guide Champion(s):</span>
              <b>{profile.champions.join(' · ')}</b>
            </div>
          </>
        )}
      </div>

      <div className="mb-3 ml-0.5 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: SG_BRAND }}>
        Commodity-country coverage
      </div>
      {Object.keys(byCountry).map(code => {
        const c = countryByCode.get(code);
        const rows = byCountry[code];
        return (
          <div key={code} className="mb-3.5 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center gap-2.5 border-b border-slate-100 bg-[#f5f6f5] px-5 py-3.5">
              <span className="h-[14px] w-[20px] rounded-sm" style={{ background: c?.tone ?? '#999' }} />
              <span className="text-[15px] font-bold">{c?.name ?? code}</span>
              <span className="ml-auto font-mono text-[12px] text-slate-400">{rows.length} mapping{rows.length === 1 ? '' : 's'}</span>
            </div>
            <div>
              {rows.map((m, i) => {
                const com = comById.get(m.commodityId);
                return (
                  <div
                    key={m.id}
                    onClick={() => router.push(`/sourceguide/commodity/${m.commodityId}`)}
                    className={`flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-[#eaf4ef] ${i < rows.length - 1 ? 'border-b border-slate-100' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold">
                        {com?.name ?? `Commodity #${m.commodityId}`}
                        {com?.code && <span className="ml-1.5 font-mono text-[11.5px]" style={{ color: SG_BRAND }}>{com.code}</span>}
                      </div>
                      <div className="mt-0.5 text-[12px] text-slate-500">{com ? `${com.category} · ${com.family || com.subCategory || ''}` : ''}</div>
                    </div>
                    <TierBadge tier={m.tier} />
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color?: string }) {
  return (
    <div className="text-center">
      <div className="text-[24px] font-bold" style={color ? { color } : undefined}>{value}</div>
      <div className="text-[11.5px] text-slate-500">{label}</div>
    </div>
  );
}
