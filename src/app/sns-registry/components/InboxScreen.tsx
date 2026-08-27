'use client';

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
  const hasStageRole = app.viewer.isAdmin
    || (tab === 'l1' && app.roleKind === 'l1')
    || (tab === 'l2' && app.roleKind === 'l2');
  const inboxRecs = app.records.filter((r) => displayStatus(r) === wantStatus);

  const tabs = [
    { key: 'l1' as const, label: 'Level 1 — Country Supply Chain Manager', sub: `${counts('Pending Level 1')} awaiting first review` },
    { key: 'l2' as const, label: 'Level 2 — Category Manager / SC Director', sub: `${counts('Pending Level 2')} awaiting final sign-off` },
  ];

  return (
    <div>
      <div style={{ borderLeft: '4px solid #2A7E4F', paddingLeft: 12, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 'bold' }}>Validation Inbox</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#58595B', maxWidth: 720 }}>
          A lightweight two-level check to publish the registry ID. This is not a parallel approval chain for the transaction &#8212; PO/RFQ release stays in SAP.
        </p>
      </div>

      <div style={{ display: 'flex', border: '1px solid #E4E6E6', background: '#fff', marginBottom: 16 }}>
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => app.setInboxTab(t.key)} style={{ flex: '0 1 300px', border: 0, borderRight: '1px solid #E4E6E6', borderBottom: `3px solid ${active ? '#2A7E4F' : 'transparent'}`, background: active ? '#F2F8F5' : '#fff', padding: '13px 18px', cursor: 'pointer', textAlign: 'left' }}>
              <div style={{ fontSize: 12.5, fontWeight: 'bold', color: active ? '#1D5B39' : '#1F1F1D' }}>{t.label}</div>
              <div style={{ fontSize: 11, color: '#58595B', marginTop: 2 }}>{t.sub}</div>
            </button>
          );
        })}
      </div>

      {!hasStageRole && (
        <div style={{ background: '#FEF6E7', border: '1px solid #E8B96A', padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 'bold', color: '#8A6100', letterSpacing: 0.5, marginBottom: 5 }}>READ-ONLY FOR YOUR ROLE</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            You are signed in as {app.viewer.role ?? 'an administrator'}. This level is validated by the{' '}
            {tab === 'l1' ? 'Country Supply Chain Manager (Validator L1)' : 'Category Manager / SC Director (Validator L2)'}.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {inboxRecs.map((r) => {
          const sh = shapeRow(r);
          const approveLabel = tab === 'l1' ? 'Validate — route to L2' : r.id ? 'Confirm review — extend' : 'Sign off — publish ID';
          const meta = [
            { label: 'REASON CODE', value: r.reason },
            { label: 'SEGMENT', value: r.segments.join(', ') || '—' },
            { label: 'ANNUAL SPEND', value: money(r.spend) },
            { label: 'EVIDENCE', value: r.evidence },
            { label: 'REQUESTOR', value: r.requestor },
          ];
          const canAct = hasStageRole && app.canActOn(r.country);
          return (
            <div key={r.rid} style={{ background: '#fff', border: '1px solid #E4E6E6', borderLeft: `4px solid ${sh.accent}` }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', padding: '16px 18px' }}>
                <div style={{ flex: '1 1 480px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 'bold', letterSpacing: 0.4, padding: '3px 7px', borderRadius: 2, background: sh.clsBg, color: sh.clsFg }}>{sh.clsLabel}</span>
                    <span style={{ fontSize: 14, fontWeight: 'bold' }}>{sh.supplierName}</span>
                    <span style={{ fontSize: 11.5, color: '#58595B' }}>SAP {sh.supplierId}</span>
                    <span style={{ fontSize: 11.5, color: '#58595B' }}>&#183;</span>
                    <span style={{ fontSize: 12.5, fontWeight: 'bold', color: '#2A7E4F' }}>{sh.country}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#1F1F1D', marginTop: 8 }}>{sh.scopeLabel} &#8212; {sh.scopeDetail}</div>
                  <div style={{ fontSize: 12.5, color: '#58595B', marginTop: 6, lineHeight: 1.55, maxWidth: 720 }}>{sh.justificationShort}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginTop: 10 }}>
                    {meta.map((m) => (
                      <div key={m.label}>
                        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}>{m.label}</div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ flex: '0 0 210px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={() => app.open(r.rid)} className="btn-neutral" style={{ padding: '9px 12px' }}>Open full record</button>
                  {canAct ? (
                    <>
                      <button onClick={() => app.advance(r.rid)} disabled={app.busy} className="btn-primary" style={{ padding: '9px 12px', fontSize: 12 }}>{approveLabel}</button>
                      <button onClick={() => app.open(r.rid)} className="btn-danger-outline">Reject to Draft</button>
                    </>
                  ) : hasStageRole ? (
                    <div style={{ fontSize: 11.5, color: '#8A4B00', lineHeight: 1.45 }}>
                      Outside your approved countries.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
        {inboxRecs.length === 0 && (
          <div style={{ background: '#fff', border: '1px solid #E4E6E6', padding: 44, textAlign: 'center', color: '#58595B', fontSize: 13 }}>
            <div style={{ fontWeight: 'bold', color: '#1F1F1D', marginBottom: 6 }}>Nothing waiting on this level</div>
            <div>Submitted cases appear here as soon as they reach this validation step.</div>
          </div>
        )}
      </div>
    </div>
  );
}
