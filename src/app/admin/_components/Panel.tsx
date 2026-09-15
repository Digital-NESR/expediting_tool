'use client';

import type React from 'react';

/**
 * The read-only summary primitives shared by the Catalog Manager and SourceGuide
 * admin panels.
 *
 * Note the brand green differs between the two tools — SourceGuide is #2A7E4F, the
 * rest of the app is #307c4c — so `Kpi` takes the `good` tone colour as a prop
 * rather than baking one in. The default is the app green.
 */

const APP_GREEN = '#307c4c';

export function Kpi({
  label,
  value,
  sub,
  tone,
  brand = APP_GREEN,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn' | 'bad';
  brand?: string;
}) {
  const col = tone === 'warn' ? '#b45309' : tone === 'bad' ? '#b91c1c' : tone === 'good' ? brand : '#0f172a';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[22px] font-bold tracking-tight" style={{ color: col }}>{value}</div>
      <div className="mt-0.5 text-[12px] text-slate-500">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 ${className}`}>
      <h3 className="text-[14px] font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mb-4 mt-0.5 text-[12px] text-slate-500">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}
