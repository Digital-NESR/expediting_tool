/* On a Service Registry item's Catalog page: what RRSM runs under it. Read-only; changes are made
   in RRSM. Rendered by the server page, so it costs the client nothing. */

import Link from 'next/link';
import type { RrsmUsage } from '@/lib/rrsm/registry-usage';

export default function InRrsmPanel({
  usage,
  countryCode,
  registryType,
}: {
  usage: RrsmUsage | null;
  countryCode: string;
  registryType: 'rental' | 'recurrent' | null | undefined;
}) {
  if (!registryType && !usage?.units.length && !usage?.recurrent.length) return null;
  const onHire = usage?.units.filter((u) => u.active) ?? [];
  const href =
    registryType === 'recurrent'
      ? `/rrsm/recurrent?country=${countryCode}`
      : `/rrsm/register?country=${countryCode}`;

  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[14px] font-semibold text-slate-900">In RRSM</h2>
        <Link href={href} className="text-[12.5px] font-semibold text-[#1d4f31] hover:underline">
          Open in RRSM →
        </Link>
      </div>
      {!usage ? (
        <p className="mt-2 text-[13px] text-slate-500">RRSM could not be read just now.</p>
      ) : registryType === 'recurrent' || usage.recurrent.length ? (
        usage.recurrent.length ? (
          <ul className="mt-2 space-y-1.5 text-[13px] text-slate-700">
            {usage.recurrent.map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.name}</span> · {r.status}
                {r.contractExpiry && <> · expires {r.contractExpiry}</>}
                {r.lastPoNumber && <> · PO {r.lastPoNumber}</>}
                {r.requesters.length > 0 && (
                  <span className="text-slate-500"> · {r.requesters.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[13px] text-slate-500">No recurrent service linked yet.</p>
        )
      ) : (
        <>
          <p className="mt-1 text-[12.5px] text-slate-500">
            {onHire.length} unit{onHire.length === 1 ? '' : 's'} on hire
            {usage.units.length > onHire.length &&
              `, ${usage.units.length - onHire.length} off hire`}
          </p>
          {usage.units.length > 0 && (
            <table className="mt-2 w-full text-[12.5px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="py-1 text-left font-semibold">Unit</th>
                  <th className="py-1 text-left font-semibold">Plate / serial</th>
                  <th className="py-1 text-left font-semibold">Segment</th>
                  <th className="py-1 text-left font-semibold">Cost center</th>
                  <th className="py-1 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {usage.units.map((u) => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{u.description}</td>
                    <td className="py-1 font-mono text-slate-600">{u.assetRef || '—'}</td>
                    <td className="py-1 text-slate-600">{u.segment}</td>
                    <td className="py-1 font-mono text-slate-600">{u.costCenter}</td>
                    <td className="py-1 text-slate-600">
                      {u.active ? 'On hire' : `Off hire${u.offHireDate ? ` ${u.offHireDate}` : ''}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </section>
  );
}
