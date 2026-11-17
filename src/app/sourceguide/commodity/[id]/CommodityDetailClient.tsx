'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, User, Mail } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT } from '../../constants';
import { TierBadge, CountryFlag, SupAvatar, PathTrail, BlockedBadge, SectionLabel } from '../../ui';
import { recordView, BookmarkButton } from '../../pins';
import type { SgCommodityDetail, SgCountry, SgMapping } from '@/types/sourceguide';

export default function CommodityDetailClient({
  detail,
  countries,
  initialCountry = null,
}: {
  detail: SgCommodityDetail;
  countries: SgCountry[];
  initialCountry?: string | null;
}) {
  const router = useRouter();
  const { commodity: com, countries: cc, mappingsByCountry, relatedByCountry } = detail;
  // default to the country carried over from search/filters, if this commodity has it
  const defaultCountry =
    initialCountry && cc.includes(initialCountry) ? initialCountry : (cc[0] ?? null);
  const [country, setCountry] = useState<string | null>(defaultCountry);
  const countryByCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);

  const maps = country ? (mappingsByCountry[country] ?? []) : [];
  const pref = maps.filter((m) => m.tier === 'Preferred');
  const backups = maps.filter((m) => m.tier === 'Backup');

  /* Suppliers approved for a particular commodity in this sub-category rather than for the
     sub-category at large. Only ever populated on a catch-all node; see the loader. */
  const related = country ? (relatedByCountry?.[country] ?? []) : [];

  /* The chip the reader picked belongs in the URL. Without this a reload, a back navigation or
     a shared link all reverted to the first country this commodity happens to carry, showing a
     different supplier list than the one on screen when the link was copied. `replace` rather
     than `push`, so changing country does not fill the back button with one entry per chip. */
  useEffect(() => {
    if (!country) return;
    const url = `/sourceguide/commodity/${com.id}?country=${encodeURIComponent(country)}`;
    router.replace(url, { scroll: false });
  }, [country, com.id, router]);

  useEffect(() => {
    recordView({
      kind: 'commodity',
      key: String(com.id),
      name: com.name,
      sub: com.category,
      href: `/sourceguide/commodity/${com.id}`,
    });
  }, [com.id, com.name, com.category]);

  return (
    <div className="mx-auto max-w-[980px] px-6 py-7 lg:px-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#eef0ef] px-3 py-1.5 text-[12.5px] font-semibold text-slate-700 hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <BookmarkButton
          item={{
            kind: 'commodity',
            key: String(com.id),
            name: com.name,
            sub: com.category,
            href: `/sourceguide/commodity/${com.id}`,
          }}
        />
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Header */}
        <div
          className="border-b border-slate-100 px-7 py-6"
          style={{ background: `linear-gradient(180deg, ${SG_BRAND_SOFT}, #fff)` }}
        >
          <PathTrail path={com.path.slice(0, 3)} />
          <div className="mt-1 flex flex-wrap items-center gap-3.5">
            <h1 className="text-[26px] font-bold tracking-tight">{com.name}</h1>
            {com.code && (
              <span className="rounded-md border border-slate-200 bg-[#eef0ef] px-2.5 py-1 font-mono text-[12px] text-slate-500">
                UNSPSC {com.code}
              </span>
            )}
            <span className="rounded-full bg-[#ececed] px-2.5 py-1 text-[11px] font-semibold text-slate-500">
              {com.spendType}
            </span>
          </div>
          {com.description && (
            <p className="mt-2.5 max-w-[640px] text-[14px] leading-relaxed text-slate-500">
              {com.description}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-6">
            <Meta label="Category" value={com.category} />
            <Meta label="Sub-Category" value={com.subCategory ?? ''} />
            <Meta label="Family" value={com.family ?? ''} />
          </div>
        </div>

        {cc.length > 0 ? (
          <>
            {/* Country selector */}
            <div className="flex flex-wrap items-center gap-2 px-7 pt-4">
              <span className="mr-1 text-[12.5px] font-semibold text-slate-500">Country:</span>
              {cc.map((code) => {
                const c = countryByCode.get(code);
                const on = country === code;
                return (
                  <button
                    key={code}
                    onClick={() => setCountry(code)}
                    className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors"
                    style={
                      on
                        ? { background: SG_BRAND, borderColor: SG_BRAND, color: '#fff' }
                        : { borderColor: '#D1D3D4', background: '#fff', color: '#58595B' }
                    }
                  >
                    <span
                      className="h-[10px] w-[13px] rounded-sm"
                      style={{ background: c?.tone ?? '#999' }}
                    />
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
                    {pref.map((m) => (
                      <SupplierCard
                        key={m.id}
                        mapping={m}
                        country={countryByCode.get(m.country)}
                        onOpen={() =>
                          router.push(
                            `/sourceguide/suppliers/${encodeURIComponent(m.supplierCode!)}`,
                          )
                        }
                      />
                    ))}
                  </div>
                </>
              )}
              {related.length > 0 && (
                <>
                  <SectionLabel className="mt-6">
                    Elsewhere in {com.subCategory} · {related.length}
                  </SectionLabel>
                  {/* Said plainly, because the distinction is the point: these people are
                      approved for a specific commodity, not for the sub-category at large. */}
                  <p className="-mt-1 mb-3 text-[12.5px] text-slate-500">
                    Approved for one commodity under {com.subCategory} rather than for the
                    sub-category generally. Open a commodity to see its own full list.
                  </p>
                  <div className="overflow-hidden rounded-xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-[13px]">
                      <thead>
                        <tr className="bg-slate-50 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          <th className="px-3 py-2">Supplier</th>
                          <th className="px-3 py-2">Commodity</th>
                          <th className="w-24 px-3 py-2">Tier</th>
                        </tr>
                      </thead>
                      <tbody>
                        {related.map((m) => (
                          <tr key={m.id} className="border-t border-slate-100">
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  m.supplierCode &&
                                  router.push(
                                    `/sourceguide/suppliers/${encodeURIComponent(m.supplierCode)}`,
                                  )
                                }
                                className="text-left font-semibold text-slate-800 hover:text-[#2A7E4F] hover:underline"
                              >
                                {m.supplierName}
                              </button>
                              {m.supplierBlocked && (
                                <span className="ml-2 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-700">
                                  Blocked
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  router.push(
                                    `/sourceguide/commodity/${m.commodityId}?country=${encodeURIComponent(m.country)}`,
                                  )
                                }
                                className="text-left text-slate-600 hover:text-[#2A7E4F] hover:underline"
                              >
                                {m.commodityName}
                              </button>
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  m.tier === 'Preferred'
                                    ? 'bg-[#2A7E4F]/10 text-[#2A7E4F]'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {m.tier}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {backups.length > 0 && (
                <>
                  <SectionLabel className="mt-6">Backup suppliers · {backups.length}</SectionLabel>
                  <div className="grid gap-3.5 sm:grid-cols-2">
                    {backups.map((m) => (
                      <SupplierCard
                        key={m.id}
                        mapping={m}
                        country={countryByCode.get(m.country)}
                        onOpen={() =>
                          router.push(
                            `/sourceguide/suppliers/${encodeURIComponent(m.supplierCode!)}`,
                          )
                        }
                      />
                    ))}
                  </div>
                </>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* Coverage matrix — at-a-glance across all countries, below the cards */}
      {cc.length > 1 && (
        <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
          <SectionLabel>Coverage across countries</SectionLabel>
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="grid grid-cols-[1.1fr_2fr_auto] gap-3 border-b border-slate-100 bg-[#f5f6f5] px-4 py-2 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
              <span>Country</span>
              <span>Preferred</span>
              <span className="text-right">Backup</span>
            </div>
            {cc.map((code) => {
              const cN = countryByCode.get(code);
              const m = mappingsByCountry[code] ?? [];
              const prefNames = m.filter((x) => x.tier === 'Preferred').map((x) => x.supplierName);
              const backupN = m.filter((x) => x.tier === 'Backup').length;
              const on = country === code;
              return (
                <button
                  key={code}
                  onClick={() => setCountry(code)}
                  className={`grid w-full grid-cols-[1.1fr_2fr_auto] items-center gap-3 border-b border-slate-50 px-4 py-2.5 text-left last:border-b-0 ${on ? 'bg-[#eaf4ef]' : 'hover:bg-slate-50'}`}
                >
                  <span className="flex items-center gap-2 text-[13px] font-medium text-slate-800">
                    <span
                      className="h-3 w-4 shrink-0 rounded-sm"
                      style={{ background: cN?.tone ?? '#999' }}
                    />
                    <span className="truncate">{cN?.name ?? code}</span>
                  </span>
                  <span className="truncate text-[12.5px] text-slate-600">
                    {prefNames.join(', ')}
                  </span>
                  <span className="text-right text-[12px] font-semibold text-slate-500">
                    {backupN ? `+${backupN}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-medium">{value}</div>
    </div>
  );
}

function SupplierCard({
  mapping,
  country,
  onOpen,
}: {
  mapping: SgMapping;
  country?: SgCountry;
  onOpen: () => void;
}) {
  const pref = mapping.tier === 'Preferred';
  return (
    <div
      className="relative rounded-2xl border bg-white p-5"
      style={{ borderColor: pref ? '#6AAF8E' : '#D1D3D4', borderWidth: pref ? 1.5 : 1 }}
    >
      {pref && (
        <div
          className="absolute left-6 right-6 top-0 h-[3px] rounded-b"
          style={{ background: SG_BRAND }}
        />
      )}
      <div className="flex items-start gap-3.5">
        <SupAvatar name={mapping.supplierName} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[15.5px] font-bold tracking-tight">{mapping.supplierName}</span>
            <TierBadge tier={mapping.tier} />
            {mapping.supplierBlocked && <BlockedBadge />}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            {mapping.supplierCode && (
              <span className="font-mono text-slate-600">Vendor {mapping.supplierCode}</span>
            )}
            {country && <CountryFlag country={country} showName />}
          </div>
        </div>
      </div>
      <hr className="my-3.5 border-slate-100" />
      {mapping.supplierEmail && (
        <div className="flex items-start gap-2.5 py-1.5 text-[13px]">
          <Mail className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SG_BRAND }} />
          <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
            {mapping.supplierEmail
              .split(/[,;]+/)
              .map((e) => e.trim())
              .filter(Boolean)
              .slice(0, 3)
              .map((addr) => (
                <a
                  key={addr}
                  href={`mailto:${addr}`}
                  className="truncate font-medium hover:underline"
                  style={{ color: SG_BRAND }}
                >
                  {addr}
                </a>
              ))}
          </span>
        </div>
      )}
      <div className="flex items-center gap-2.5 py-1.5 text-[13px]">
        <User className="h-4 w-4" style={{ color: SG_BRAND }} />
        <span className="text-slate-500">Source Guide owner</span>
        <b>{country?.champion || 'Unassigned'}</b>
      </div>
      {mapping.supplierCode && (
        <button
          onClick={onOpen}
          className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white py-2 text-[12.5px] font-semibold text-slate-700 hover:border-[#6AAF8E]"
        >
          View full profile <ArrowRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
