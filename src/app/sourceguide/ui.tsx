'use client';

import { ChevronRight } from 'lucide-react';
import { SG_BRAND, SG_BRAND_SOFT, supplierTone, initials } from './constants';
import type { Tier, SgCountry } from '@/types/sourceguide';

/* ─── Tier badge ─────────────────────────────────────────────── */
export function TierBadge({ tier }: { tier: Tier }) {
  const pref = tier === 'Preferred';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      style={pref
        ? { background: '#C5E0D2', color: '#1f5d3a' }
        : { background: '#ececed', color: '#58595B' }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: pref ? SG_BRAND : '#7c7d80' }} />
      {tier}
    </span>
  );
}

/* ─── Country flag-chip ──────────────────────────────────────── */
export function CountryFlag({ country, showName }: { country: SgCountry; showName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[11.5px] font-semibold text-slate-800">
      <span className="w-4 h-3 rounded-sm shrink-0" style={{ background: country.tone ?? '#999' }} />
      {showName ? country.name : country.code}
    </span>
  );
}

/* ─── Supplier avatar (initials) ─────────────────────────────── */
export function SupAvatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <div
      className="grid place-items-center rounded-[11px] font-bold text-white font-mono shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.34, background: supplierTone(name) }}
    >
      {initials(name)}
    </div>
  );
}

/* ─── Breadcrumb path ────────────────────────────────────────── */
export function PathTrail({ path, onCrumb }: { path: string[]; onCrumb?: (i: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-slate-400 mb-1">
      {path.map((p, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="w-3 h-3 text-slate-300" />}
          <span
            className={i === path.length - 1 ? 'text-slate-700 font-semibold' : ''}
            style={onCrumb ? { cursor: 'pointer' } : undefined}
            onClick={onCrumb ? (e) => { e.stopPropagation(); onCrumb(i); } : undefined}
          >
            {p}
          </span>
        </span>
      ))}
    </div>
  );
}

/* ─── Stat tile ──────────────────────────────────────────────── */
export function StatTile({ value, label, icon }: { value: number | string; label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid place-items-center w-10 h-10 rounded-xl shrink-0" style={{ background: SG_BRAND_SOFT, color: SG_BRAND }}>
        {icon}
      </div>
      <div>
        <div className="text-[22px] font-bold tracking-tight leading-none text-slate-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        <div className="text-xs text-slate-500 mt-1">{label}</div>
      </div>
    </div>
  );
}
