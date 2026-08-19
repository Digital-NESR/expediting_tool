import type { ScreenProps } from '../../types';

export default function VendorScopingScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Vendor Scoping</h1>
          <p style={{ fontSize: 12, color: '#58595B' }}>All POs in last 18 months · Saudi Arabia (SA) · Q3 2026 · Threshold: $250,000</p>
        </div>
        <div style={{ background: '#E8F5EE', border: '1px solid #2A7E4F', borderRadius: 8, padding: '8px 14px', textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: '#2A7E4F', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>Total Balance</div>
          <div style={{ fontSize: 18, fontWeight: 'bold', color: '#2A7E4F' }}>$42.5M</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1, background: 'white', borderRadius: 8, padding: '12px 14px', borderLeft: '4px solid #2A7E4F', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold' }}>Q3 2026 Target (70%)</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#2A7E4F', marginTop: 2 }}>≥ $29.75M in SOAs received</div>
        </div>
        <div style={{ flex: 1, background: 'white', borderRadius: 8, padding: '12px 14px', borderLeft: '4px solid #58595B', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold' }}>Year-End Target (95%)</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#58595B', marginTop: 2 }}>≥ $40.375M in SOAs received</div>
        </div>
        <div style={{ flex: 1, background: 'white', borderRadius: 8, padding: '12px 14px', borderLeft: '4px solid #1565C0', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold' }}>Vendors In Scope</div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: '#1565C0', marginTop: 2 }}>{vm.totalCount} suppliers · POs last 18 months</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr 110px 90px 100px 90px',
            gap: 8,
            padding: '10px 14px',
            background: '#2A7E4F',
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          <div>#</div>
          <div>Vendor Name</div>
          <div>Vendor No.</div>
          <div>PO Amount</div>
          <div>Cumulative %</div>
          <div>Status</div>
        </div>
        {vm.scopingVendors.map((v) => (
          <div
            key={v.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 110px 90px 100px 90px',
              gap: 8,
              padding: '9px 14px',
              fontSize: 12,
              borderBottom: '1px solid #F0F0F0',
              background: v.rowBg,
              alignItems: 'center',
            }}
          >
            <div style={{ color: '#58595B', fontSize: 11 }}>{v.rank}</div>
            <div style={{ fontWeight: 'bold' }}>{v.name}</div>
            <div style={{ color: '#58595B', fontSize: 11, fontFamily: 'monospace' }}>{v.no}</div>
            <div style={{ fontWeight: 'bold' }}>{v.fmtOpenPO}</div>
            <div style={v.cumStyle}>{v.cumPct}%</div>
            <div style={v.badgeStyle}>{v.statusLabel}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
