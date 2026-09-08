import type { ScreenProps } from '../../types';

export default function DashboardScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Dashboard</h1>
          <p style={{ fontSize: 12, color: '#58595B' }}>Saudi Arabia (SA) · Q3 2026 SOA Cycle · Deadline: 31 Jul 2026</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {vm.hasRemindable && (
            <button
              onClick={vm.onSendReminders}
              style={{ background: '#E65100', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
            >
              Send Reminders ({vm.remindCount})
            </button>
          )}
          <button
            onClick={vm.onGoToConsolidation}
            style={{ background: '#2A7E4F', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
          >
            Review Consolidation →
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 10, marginBottom: 14 }}>
        {vm.kpiCards.map((kpi) => (
          <div key={kpi.label} style={kpi.cardStyle}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B', fontWeight: 'bold', marginBottom: 4 }}>
              {kpi.label}
            </div>
            <div style={kpi.valueStyle}>{kpi.value}</div>
            <div style={{ fontSize: 10, color: '#58595B', marginTop: 3, lineHeight: 1.3 }}>{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 12, marginBottom: 12 }}>
        <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B', marginBottom: 12 }}>
            Workflow Pipeline — KSA Q3 2026
          </div>
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden' }}>
            {vm.pipeline.map((step) => (
              <div key={step.id} style={step.stepStyle}>
                <div style={{ fontSize: 18, lineHeight: 1 }}>{step.nodeIcon}</div>
                <div style={{ fontSize: 11, fontWeight: 'bold', marginTop: 4, lineHeight: 1.2 }}>{step.label}</div>
                {step.active && <div style={{ fontSize: 10, marginTop: 2, opacity: 0.85 }}>{step.sub}</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B', marginBottom: 8 }}>
            18-Month PO Coverage
          </div>
          <div style={vm.coverageValueStyle}>{vm.coveragePct}%</div>
          <div style={{ fontSize: 10, color: '#58595B', marginBottom: 8 }}>of total 18-month PO balance</div>
          <div style={{ background: '#E0E8E3', borderRadius: 3, height: 10, marginBottom: 5, overflow: 'hidden' }}>
            <div style={vm.coverageBarStyle} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#58595B', marginBottom: 8 }}>
            <span>0%</span>
            <span>70%</span>
            <span>95%</span>
          </div>
          <div style={vm.coverageCheckLabelStyle}>{vm.coverageCheckLabel}</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B', marginBottom: 10 }}>
          Vendor Response Status — {vm.totalCount} In-Scope Vendors
        </div>
        <div style={{ display: 'flex', borderRadius: 4, overflow: 'hidden', height: 18, marginBottom: 10, background: '#E0E8E3' }}>
          {vm.statusBarSegs.map((seg) => (
            <div key={seg.label} style={seg.segStyle} title={seg.label} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {vm.statusBarSegs.map((seg) => (
            <div key={seg.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#58595B' }}>
              <div style={seg.dotStyle} />
              <span>
                {seg.label}: <strong>{seg.count}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
