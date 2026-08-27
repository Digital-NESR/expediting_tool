'use client';

import { daysFromToday } from '../lib/date';
import { displayStatus } from '../lib/helpers';
import { shapeRow } from '../lib/shapeRow';
import type { RegistryApp } from '../lib/useRegistryApp';

export default function ExpiryScreen({ app }: { app: RegistryApp }) {
  const counts = (status: string) => app.records.filter((r) => displayStatus(r) === status).length;
  const dated = app.records
    .filter((r) => r.expiry)
    .map((r) => ({ r, d: daysFromToday(r.expiry as string) }))
    .filter((x) => x.d <= 90)
    .sort((a, b) => a.d - b.d);

  const kpis = [
    { label: 'EXPIRING IN 60 DAYS', value: counts('Expiring soon'), sub: 'flagged to requestor and both validators', color: '#E09A4E' },
    { label: 'EXPIRED', value: counts('Expired'), sub: 'SAP reference is non-compliant', color: '#B34141' },
    { label: 'EXTENDED THIS PERIOD', value: counts('Extended'), sub: 'original Registry ID retained', color: '#2A7E4F' },
  ];

  return (
    <div>
      <div style={{ borderLeft: '4px solid #2A7E4F', paddingLeft: 12, marginBottom: 18 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 'bold' }}>Expiry &amp; Periodic Review</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#58595B', maxWidth: 760 }}>
          Every record carries a fixed 12-month validity. Records are flagged 60 and 30 days before expiry. A successful review keeps the original Registry ID and resets expiry by a further 12 months.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14, marginBottom: 18 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E4E6E6', borderTop: `4px solid ${k.color}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: k.color, lineHeight: 1.15, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: '#58595B' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #E4E6E6', fontSize: 13, fontWeight: 'bold', borderLeft: '4px solid #2A7E4F' }}>Review Queue &#8212; Soonest Expiry First</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {dated.map((x, i) => {
            const sh = shapeRow(x.r);
            const pct = Math.max(0, Math.min(100, Math.round((1 - Math.max(x.d, 0) / 90) * 100)));
            const overdue = x.d < 0;
            const barPct = (overdue ? 100 : pct) + '%';
            const barColor = overdue ? '#B34141' : x.d <= 30 ? '#B34141' : '#E09A4E';
            const reviewNote = overdue ? 'Re-validation required before this ID can be referenced again' : x.d <= 30 ? '30-day flag sent' : '60-day flag sent';
            const canReview = (app.viewer.isAdmin || app.roleKind === 'req') && app.canActOn(x.r.country) && x.r.base !== 'Pending Level 1' && x.r.base !== 'Pending Level 2';
            const rowBg = i % 2 ? '#F7FAF8' : '#FFFFFF';
            return (
              <div key={x.r.rid} style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.3fr 1fr 190px', gap: 18, alignItems: 'center', padding: '15px 18px', borderBottom: '1px solid #F0F1F1', background: rowBg }}>
                <div>
                  <div style={{ fontFamily: 'Consolas,Menlo,monospace', fontWeight: 'bold', color: '#1D5B39', fontSize: 13.5 }}>{sh.idLabel}</div>
                  <div style={{ fontSize: 11.5, color: '#58595B', marginTop: 3 }}>{sh.clsLabel} &#183; {sh.country}</div>
                </div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 'bold' }}>{sh.supplierName}</div>
                  <div style={{ fontSize: 11.5, color: '#58595B', marginTop: 3 }}>{sh.scopeDetail}</div>
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 5 }}>
                    <span style={{ fontWeight: 'bold', color: sh.expiryNoteColor }}>{sh.expiryNote}</span>
                    <span style={{ color: '#58595B' }}>{sh.expiryLabel}</span>
                  </div>
                  <div style={{ height: 6, background: '#EDEFEF', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: 6, width: barPct, background: barColor }} />
                  </div>
                  <div style={{ fontSize: 11, color: '#58595B', marginTop: 5 }}>{reviewNote}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <button onClick={() => app.open(x.r.rid)} className="btn-neutral" style={{ padding: '8px 12px', fontSize: 12 }}>Open record</button>
                  {canReview && (
                    <button onClick={() => app.startReview(x.r.rid)} className="btn-primary" style={{ padding: '8px 12px', fontSize: 12 }}>Start periodic review</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {dated.length === 0 && (
          <div style={{ padding: 44, textAlign: 'center', color: '#58595B', fontSize: 13 }}>No record is within 90 days of expiry.</div>
        )}
      </div>
    </div>
  );
}
