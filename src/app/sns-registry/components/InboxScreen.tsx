'use client';

import { STAGE1, STAGE2 } from '../lib/constants';
import { money } from '../lib/helpers';
import { shapeRow } from '../lib/shapeRow';
import type { RegistryApp } from '../lib/useRegistryApp';
import { displayStatus } from '../lib/helpers';

export default function InboxScreen({ app }: { app: RegistryApp }) {
  const tab = app.inboxTab;
  const wantStatus = tab === 'l1' ? 'Pending Level 1' : 'Pending Level 2';
  const counts = (status: string) => app.records.filter((r) => displayStatus(r) === status).length;
  // Holding the stage's role is necessary but not sufficient — the record must
  // also sit in a country this viewer was approved for, so `canAct` is decided
  // per record rather than once for the whole tab.
  const hasStageRole =
    app.viewer.isAdmin ||
    (tab === 'l1' && app.viewer.isLevel1) ||
    (tab === 'l2' && app.viewer.isLevel2);
  const inboxRecs = app.records.filter((r) => displayStatus(r) === wantStatus);

  const tabs = [
    {
      key: 'l1' as const,
      label: STAGE1,
      sub: `${counts('Pending Level 1')} awaiting first review`,
    },
    {
      key: 'l2' as const,
      label: STAGE2,
      sub: `${counts('Pending Level 2')} awaiting final sign-off`,
    },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight text-slate-900">Validation Inbox</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-slate-500">
          A lightweight two-level check to publish the registry ID. This is not a parallel approval
          chain for the transaction — PO/RFQ release stays in SAP.
        </p>
      </div>

      <div className="flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => app.setInboxTab(t.key)}
              className={`flex-1 border-b-[3px] border-r border-r-slate-200 px-4 py-3 text-left transition-colors last:border-r-0 sm:flex-[0_1_320px] ${
                active
                  ? 'border-b-[#307c4c] bg-[#307c4c]/5'
                  : 'border-b-transparent bg-white hover:bg-slate-50'
              }`}
            >
              <div
                className={`text-[12.5px] font-bold ${active ? 'text-[#1d4f31]' : 'text-slate-700'}`}
              >
                {t.label}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400">{t.sub}</div>
            </button>
          );
        })}
      </div>

      {!hasStageRole && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3.5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">
            Read-only for your role
          </p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-amber-900">
            You are signed in as {app.viewer.role ?? 'an administrator'}. This level is validated by
            the {tab === 'l1' ? STAGE1 : STAGE2}.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {inboxRecs.map((r) => {
          const sh = shapeRow(r);
          const approveLabel =
            tab === 'l1'
              ? 'Validate — send for final sign-off'
              : r.id
                ? 'Confirm review — extend'
                : 'Sign off — publish ID';
          const meta = [
            { label: 'Reason code', value: r.reason },
            { label: 'Segment', value: r.segments.join(', ') || '—' },
            { label: 'Annual spend', value: money(r.spend) },
            { label: 'Requestor', value: r.requestor },
          ];
          const canAct = hasStageRole && app.canActOn(r.countryCode);
          return (
            <div
              key={r.rid}
              className="overflow-hidden rounded-xl border border-l-4 border-slate-200 bg-white shadow-sm"
              // The left edge carries the record's status colour, computed per
              // row by shapeRow.
              style={{ borderLeftColor: sh.accent }}
            >
              <div className="flex flex-wrap justify-between gap-5 px-4 py-4">
                <div className="min-w-0 flex-[1_1_480px]">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10.5px] font-bold tracking-wide"
                      style={{ background: sh.clsBg, color: sh.clsFg }}
                    >
                      {sh.clsLabel}
                    </span>
                    <span className="text-[14px] font-bold text-slate-900">{sh.supplierName}</span>
                    <span className="text-[11.5px] text-slate-500">SAP {sh.supplierId}</span>
                    <span className="text-[11.5px] text-slate-300">·</span>
                    <span className="text-[12.5px] font-bold text-[#307c4c]">{sh.country}</span>
                  </div>

                  <p className="mt-2 text-[12.5px] text-slate-800">
                    {sh.scopeLabel} — {sh.scopeDetail}
                  </p>
                  <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-slate-500">
                    {sh.justificationShort}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {meta.map((m) => (
                      <div key={m.label}>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          {m.label}
                        </div>
                        <div className="mt-0.5 text-[12px] text-slate-700">{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex w-full flex-col gap-2 sm:w-[210px] sm:shrink-0">
                  <button
                    type="button"
                    onClick={() => app.open(r.rid)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
                  >
                    Open full record
                  </button>
                  {canAct ? (
                    <>
                      <button
                        type="button"
                        onClick={() => app.advance(r.rid)}
                        disabled={app.busy}
                        className="rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3 py-2 text-[12px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {approveLabel}
                      </button>
                      <button
                        type="button"
                        onClick={() => app.open(r.rid)}
                        className="rounded-lg border border-red-200 bg-white px-3 py-2 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        Reject to Draft
                      </button>
                    </>
                  ) : hasStageRole ? (
                    <p className="text-[11.5px] leading-relaxed text-amber-700">
                      Outside your approved countries.
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        {inboxRecs.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
            <p className="text-[13px] font-semibold text-slate-800">
              Nothing waiting on this level
            </p>
            <p className="mt-1 text-[13px] text-slate-500">
              Submitted cases appear here as soon as they reach this validation step.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
