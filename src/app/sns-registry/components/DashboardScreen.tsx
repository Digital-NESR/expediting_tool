'use client';

import { displayStatus, money, statusStyle } from '../lib/helpers';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { RegistryRecord } from '../lib/types';

const SHADES = ['#1D5B39', '#2A7E4F', '#3D8F60', '#4F9C70', '#6AAF8E', '#87C1A5', '#A6D2BC', '#C5E0D2'];
const ALL_STATUSES = ['Draft', 'Pending Level 1', 'Pending Level 2', 'Active', 'Extended', 'Expiring soon', 'Expired', 'Rejected'] as const;

function aggregate(records: RegistryRecord[], keyFn: (r: RegistryRecord) => string[]) {
  const m: Record<string, number> = {};
  records.forEach((r) => {
    keyFn(r).forEach((k) => {
      m[k] = (m[k] || 0) + r.spend;
    });
  });
  const arr = Object.keys(m).map((k) => ({ name: k, v: m[k] })).sort((a, b) => b.v - a.v).slice(0, 8);
  const max = arr.length ? arr[0].v : 1;
  return arr.map((x, i) => ({ name: x.name, label: money(x.v), pct: Math.round((x.v / max) * 100) + '%', color: SHADES[i] || '#C5E0D2' }));
}

export default function DashboardScreen({ app }: { app: RegistryApp }) {
  const all = app.records.map((r) => ({ r, s: displayStatus(r) }));
  const active = app.records.filter((r) => ['Active', 'Extended', 'Expiring soon'].includes(displayStatus(r)));
  const expiredRecs = app.records.filter((r) => displayStatus(r) === 'Expired');
  const expiredSpend = expiredRecs.reduce((a, r) => a + r.spend, 0);
  const totalSpend = active.reduce((a, r) => a + r.spend, 0);
  const sgl = active.filter((r) => r.cls === 'SGL');
  const sol = active.filter((r) => r.cls === 'SOL');

  const kpis = [
    { label: 'VALID IDS', value: active.length, sub: `across ${new Set(active.map((r) => r.country)).size} countries`, color: '#2A7E4F' },
    { label: 'COVERED SPEND', value: money(totalSpend), sub: expiredRecs.length ? `excludes ${money(expiredSpend)} now expired` : 'annual, single + sole source', color: '#2A7E4F' },
    { label: 'SINGLE-SOURCE', value: sgl.length, sub: money(sgl.reduce((a, r) => a + r.spend, 0)), color: '#1D5B39' },
    { label: 'SOLE-SOURCE', value: sol.length, sub: money(sol.reduce((a, r) => a + r.spend, 0)), color: '#6AAF8E' },
    { label: 'PO / RFQ COUNT', value: active.reduce((a, r) => a + r.poCount, 0), sub: 'referencing an active ID', color: '#58595B' },
  ];

  const charts = [
    { title: 'Covered Spend by Country', note: 'top 8, annual USD', bars: aggregate(active, (r) => [r.country]) },
    { title: 'Covered Spend by Category', note: 'top 8, annual USD', bars: aggregate(active, (r) => Array.from(new Set(r.nodes.map((n) => n.cat)))) },
    { title: 'Covered Spend by Segment', note: 'top 8, annual USD', bars: aggregate(active, (r) => r.segments) },
    { title: 'Covered Spend by Reason Code', note: 'all reason codes', bars: aggregate(active, (r) => [r.reason]) },
  ];

  const statusDist = ALL_STATUSES.map((s) => {
    const list = all.filter((x) => x.s === s);
    return { name: s, count: list.length, spend: money(list.reduce((a, x) => a + x.r.spend, 0)) + ' spend', color: statusStyle(s)[2] };
  });

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, marginBottom: 18 }}>
        <div style={{ borderLeft: '4px solid #2A7E4F', paddingLeft: 12 }}>
          <h1 style={{ margin: 0, fontSize: 21, fontWeight: 'bold' }}>Leadership Dashboard</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12.5, color: '#58595B', maxWidth: 720 }}>Where NESR is structurally dependent on a single vendor, by country, category and segment.</p>
        </div>
        <button onClick={app.exportCsv} className="btn-outline">Export to Excel</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 14, marginBottom: 16 }}>
        {kpis.map((k) => (
          <div key={k.label} style={{ background: '#fff', border: '1px solid #E4E6E6', borderTop: `4px solid ${k.color}`, padding: '14px 16px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color, lineHeight: 1.2, marginTop: 6 }}>{k.value}</div>
            <div style={{ fontSize: 11.5, color: '#58595B' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
        {charts.map((c) => (
          <div key={c.title} style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #E4E6E6', borderLeft: '4px solid #2A7E4F', display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 'bold' }}>{c.title}</span>
              <span style={{ fontSize: 11, color: '#58595B' }}>{c.note}</span>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
              {c.bars.map((b) => (
                <div key={b.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                    <span style={{ fontWeight: 'bold' }}>{b.name}</span>
                    <span style={{ color: '#58595B', fontVariantNumeric: 'tabular-nums' }}>{b.label}</span>
                  </div>
                  <div style={{ height: 14, background: '#F1F2F2', overflow: 'hidden' }}>
                    <div style={{ height: 14, width: b.pct, background: b.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #E4E6E6', marginTop: 16 }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid #E4E6E6', borderLeft: '4px solid #2A7E4F', fontSize: 13, fontWeight: 'bold' }}>Status Distribution</div>
        <div style={{ display: 'flex', flexWrap: 'wrap' }}>
          {statusDist.map((s) => (
            <div key={s.name} style={{ flex: '1 1 150px', padding: '14px 18px', borderRight: '1px solid #F0F1F1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color }} />
                <span style={{ fontSize: 11.5, fontWeight: 'bold', color: '#58595B' }}>{s.name}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, marginTop: 5 }}>{s.count}</div>
              <div style={{ fontSize: 11, color: '#58595B' }}>{s.spend}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
