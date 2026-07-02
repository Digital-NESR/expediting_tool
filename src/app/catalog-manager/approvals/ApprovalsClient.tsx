'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CatalogManagerShell, { type ScopeCountry } from '../components/CatalogManagerShell';
import { Icon, Chip, EmptyState } from '../components/CatalogManagerUI';
import DecisionDialog from '../components/DecisionDialog';
import type { CatalogDelegationGrant, CatalogEntry } from '@/types/catalog-manager';
import { fmtMoney, fmtUsd } from '@/lib/catalog-manager-utils';

export default function ApprovalsClient({
  pending, scope, countries, roleLabel, canApprove, canAdmin, approverCountries, isAdmin, delegatedFrom,
}: {
  pending: CatalogEntry[];
  scope: string;
  countries: ScopeCountry[];
  roleLabel: string;
  canApprove: boolean;
  canAdmin: boolean;
  approverCountries: string[];
  isAdmin: boolean;
  delegatedFrom: CatalogDelegationGrant[];
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<{ entry: CatalogEntry; decision: 'approve' | 'reject' } | null>(null);
  const [bulkDialog, setBulkDialog] = useState<{ supplier: string; entries: CatalogEntry[] } | null>(null);

  const canActOn = (e: CatalogEntry) => canApprove && (isAdmin || approverCountries.length === 0 || approverCountries.includes(e.country_code));

  const groups = useMemo(() => {
    const map = new Map<string, CatalogEntry[]>();
    pending.forEach((e) => {
      const list = map.get(e.supplier_name) ?? [];
      list.push(e);
      map.set(e.supplier_name, list);
    });
    return [...map.entries()].map(([supplier, list]) => ({ supplier, list }));
  }, [pending]);

  return (
    <CatalogManagerShell
      title="Approvals"
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pending.length}
      scope={scope}
      countries={countries}
    >
      <div className="cm-stagger mx-auto max-w-4xl space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Approvals</h1>
            <p className="mt-1 text-[13px] text-slate-500">
              {canApprove ? 'Entries above the value threshold awaiting your sign-off, grouped by supplier' : 'Entries you submitted that are awaiting approval'}
            </p>
          </div>
          {pending.length > 0 && (
            <Chip tone="green"><Icon name="approve" className="h-3.5 w-3.5" />{pending.length} pending · {groups.length} {groups.length === 1 ? 'supplier' : 'suppliers'}</Chip>
          )}
        </div>

        {delegatedFrom.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-[#307c4c]/25 bg-[#307c4c]/5 px-4 py-3 text-[13px] text-[#1d4f31]">
            <Icon name="users" className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <span className="font-semibold">Acting under delegated authority.</span>{' '}
              You also hold approval rights on behalf of{' '}
              {delegatedFrom.map((d, i) => (
                <span key={d.email}>
                  {i > 0 ? ', ' : ''}<span className="font-semibold">{d.name}</span>
                  {d.countries.length ? <span className="text-slate-500"> ({d.countries.join(', ')})</span> : null}
                </span>
              ))}
              . Approvals you make for their countries are recorded “on behalf of” them.
            </div>
          </div>
        )}

        {!canApprove && pending.length > 0 && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3 text-[13px] text-amber-700">
            <Icon name="alert" className="h-4 w-4" /> You have view-only access here — an Approver for the relevant country must action these.
          </div>
        )}

        {pending.length === 0 ? (
          <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
            <EmptyState icon="check" title="Queue is clear" sub="No catalog entries are pending approval right now." />
          </div>
        ) : (
          <div className="cm-stagger space-y-4">
            {groups.map(({ supplier, list }) => {
              const totalUsd = list.reduce((s, e) => s + e.usd_equivalent, 0);
              const actionable = list.filter(canActOn);
              return (
                <div key={supplier} className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md">
                  <div className="flex items-center gap-3 bg-gradient-to-r from-slate-50/80 to-transparent px-4 py-4">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#307c4c]/10 text-[#1d4f31] ring-1 ring-inset ring-[#307c4c]/10"><Icon name="building" className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold text-slate-900">{supplier}</div>
                      <div className="flex flex-wrap items-center gap-x-2 text-[12px] text-slate-400">
                        <span>{list.length} {list.length === 1 ? 'line' : 'lines'} pending</span>
                        <span>·</span>
                        <span className="font-mono">≈ USD {fmtUsd(totalUsd)}</span>
                        {list[0].manager && <><span>·</span><span className="inline-flex items-center gap-1"><Icon name="user" className="h-3 w-3" /> {list[0].manager}</span></>}
                      </div>
                    </div>
                    {actionable.length > 1 && (
                      <button onClick={() => setBulkDialog({ supplier, entries: actionable })} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#307c4c]/30 bg-white px-3 py-1.5 text-[12.5px] font-semibold text-[#1d4f31] shadow-sm transition-all hover:bg-[#307c4c]/5 active:scale-[0.97]">
                        <Icon name="approve" className="h-4 w-4" /> Approve all {actionable.length}
                      </button>
                    )}
                  </div>
                  {list.map((e) => (
                    <div key={e.id} className="group flex items-center gap-3 border-t border-slate-100 px-4 py-3 transition-colors hover:bg-[#307c4c]/[0.025]">
                      <Link href={`/catalog-manager/catalog/${e.id}`} className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="font-mono text-[11.5px] text-slate-500">{e.code}</span>
                          {e.tier_label.includes('Tier 2') && <Chip tone="green">Tier 2</Chip>}
                        </div>
                        <div className="truncate text-[13.5px] font-semibold text-slate-900">{e.commodity || e.item_name}</div>
                        <div className="truncate text-[11.5px] text-slate-400">{e.category_name} · {e.subcategory_name} · {e.country_flag} {e.country_code}</div>
                      </Link>
                      <div className="shrink-0 text-right">
                        <div className="font-mono text-[15px] font-bold text-slate-900">{fmtMoney(e.unit_price, e.currency_code)}</div>
                        <div className="text-[10.5px] text-slate-400">{e.currency_code} / {e.uom_name} · ≈${fmtUsd(e.usd_equivalent)}</div>
                      </div>
                      {canActOn(e) && (
                        <div className="flex shrink-0 gap-2">
                          <button onClick={() => setDialog({ entry: e, decision: 'reject' })} title="Reject / revise" className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-600 transition-all hover:bg-red-50 active:scale-[0.95]"><Icon name="x" className="h-4 w-4" /></button>
                          <button onClick={() => setDialog({ entry: e, decision: 'approve' })} className="inline-flex items-center gap-1.5 rounded-lg bg-[#307c4c] px-3 py-1.5 text-[12.5px] font-semibold text-white shadow-sm shadow-[#307c4c]/25 transition-all hover:bg-[#2b6f44] active:scale-[0.97]"><Icon name="check" className="h-4 w-4" /> Approve</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {dialog && (
        <DecisionDialog
          open
          decision={dialog.decision}
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); router.refresh(); }}
        />
      )}

      {bulkDialog && (
        <DecisionDialog
          open
          decision="approve"
          entry={bulkDialog.entries[0]}
          bulk={bulkDialog}
          onClose={() => setBulkDialog(null)}
          onDone={() => { setBulkDialog(null); router.refresh(); }}
        />
      )}
    </CatalogManagerShell>
  );
}
