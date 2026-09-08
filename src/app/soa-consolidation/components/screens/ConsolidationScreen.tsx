import type { ScreenProps } from '../../types';

export default function ConsolidationScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Consolidation &amp; Handoff</h1>
          <p style={{ fontSize: 12, color: '#58595B' }}>Automated consolidation · Saudi Arabia (SA) · Q3 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={vm.onGenerateExport}
            style={{ background: '#1565C0', color: 'white', border: 'none', padding: '9px 14px', borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
          >
            Generate Export File
          </button>
          {vm.canHandoff && (
            <button
              onClick={vm.onOpenHandoffModal}
              style={{ background: '#2A7E4F', color: 'white', border: 'none', padding: '9px 14px', borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
            >
              Mark Handed Off to Finance →
            </button>
          )}
          {vm.handedOff && (
            <div style={{ background: '#E8F5EE', border: '1px solid #2A7E4F', borderRadius: 7, padding: '9px 14px', fontSize: 12, fontWeight: 'bold', color: '#2A7E4F' }}>
              ✓ Handed Off
            </div>
          )}
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B' }}>
            Control Criteria Check (SOP NESR-SC-01-GR2PAY)
          </div>
          <div style={vm.allPassStyle}>{vm.allPassLabel}</div>
        </div>
        {vm.complianceItems.map((ci) => (
          <div key={ci.label} style={ci.rowStyle}>
            <div style={ci.iconStyle}>{ci.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 2 }}>{ci.label}</div>
              <div style={{ fontSize: 11, color: '#58595B', lineHeight: 1.4 }}>{ci.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: '#1F1F1D' }}>
            Consolidated SOA — {vm.receivedCount} Vendors · NESR-KSA-SOA-Q3-2026
          </div>
          <div style={{ fontSize: 11, color: '#58595B' }}>Auto-compiled · No manual re-keying</div>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '30px 1fr 110px 65px 85px 55px 80px',
            gap: 8,
            padding: '9px 14px',
            background: '#2A7E4F',
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            alignItems: 'center',
          }}
        >
          <div>#</div>
          <div>Vendor Name</div>
          <div>Vendor No.</div>
          <div>Curr.</div>
          <div>Amount</div>
          <div>Inv.</div>
          <div>Response</div>
        </div>
        {vm.consolidatedRows.map((r) => (
          <div
            key={r.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '30px 1fr 110px 65px 85px 55px 80px',
              gap: 8,
              padding: '9px 14px',
              fontSize: 11,
              borderBottom: '1px solid #F0F0F0',
              alignItems: 'center',
              background: r.rowBg,
            }}
          >
            <div style={{ color: '#58595B' }}>{r.num}</div>
            <div style={{ fontWeight: 'bold', fontSize: 12 }}>{r.name}</div>
            <div style={{ color: '#58595B', fontFamily: 'monospace', fontSize: 10 }}>{r.no}</div>
            <div style={{ color: '#58595B' }}>{r.currency}</div>
            <div style={{ fontWeight: 'bold', color: '#2A7E4F' }}>{r.fmtOpenPO}</div>
            <div style={{ color: '#58595B' }}>{r.invCount}</div>
            <div style={{ color: '#58595B', fontSize: 10 }}>{r.respDate}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
