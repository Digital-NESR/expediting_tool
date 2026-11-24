/**
 * SafeSign's shared classes and the empty-state box. A plain module (no 'use client') so both
 * server pages and client components get real strings; see the note in ./SafeSignShell.
 */

export function Empty({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-8 py-14 text-center shadow-sm">
      <h2 className="text-[16px] font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-slate-500">{body}</p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export const BANNER_BUTTON =
  'inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-[#1d4f31] shadow-sm transition-colors hover:bg-white/90';
export const BANNER_BUTTON_GHOST =
  'inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/20';
export const BUTTON =
  'inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#307c4c] px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#276640] disabled:cursor-not-allowed disabled:bg-slate-300';
export const BUTTON_SECONDARY =
  'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
export const INPUT =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/15';
export const LABEL = 'mb-1 block text-xs font-semibold text-slate-600';
export const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
