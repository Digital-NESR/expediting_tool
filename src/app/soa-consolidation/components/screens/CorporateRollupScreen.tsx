import type { ScreenProps } from '../../types';

export default function CorporateRollupScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Corporate Rollup</h1>
          <p style={{ fontSize: 12, color: '#58595B' }}>All 12 legal entities · Q3 2026 SOA Cycle · Supply Chain Director view</p>
        </div>
        <div style={vm.atRiskAlertStyle}>
          {vm.hasAtRisk && <>⚠ {vm.atRiskCount} countries at risk — below 70% coverage with &lt;10 days remaining</>}
          {vm.noAtRisk && <>✓ All active countries on track</>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 14 }}>
        {vm.corpKpiCards.map((kpi) => (
          <div key={kpi.label} style={kpi.cardStyle}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B', fontWeight: 'bold', marginBottom: 4 }}>
              {kpi.label}
            </div>
            <div style={kpi.valueStyle}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: '#58595B', marginTop: 3 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 130px 85px 110px 115px 70px 65px',
            gap: 8,
            padding: '10px 14px',
            background: '#2A7E4F',
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            alignItems: 'center',
          }}
        >
          <div>Country</div>
          <div>SC Champion</div>
          <div>18M PO Bal.</div>
          <div>Coverage</div>
          <div>Status</div>
          <div>Resp.</div>
          <div>Days</div>
        </div>
        {vm.countriesEnriched.map((c) => (
          <div key={c.id} style={c.rowStyle}>
            <div style={{ fontWeight: 'bold', fontSize: 12 }}>{c.name}</div>
            <div style={{ fontSize: 11, color: '#58595B' }}>{c.champion}</div>
            <div style={{ fontWeight: 'bold', fontSize: 12 }}>{c.fmtBalance}</div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ flex: 1, background: '#E8EDE9', borderRadius: 2, height: 6, overflow: 'hidden' }}>
                  <div style={c.pctBarStyle} />
                </div>
                <span style={{ fontSize: 11, fontWeight: 'bold', color: '#1F1F1D', width: 32, textAlign: 'right' }}>{c.pct}%</span>
              </div>
            </div>
            <div style={c.badgeStyle}>{c.statusLabel}</div>
            <div style={{ fontSize: 11, color: '#58595B' }}>
              {c.responded}/{c.total}
            </div>
            <div style={c.daysStyle}>{c.daysLeft}d</div>
          </div>
        ))}
      </div>
    </div>
  );
}
