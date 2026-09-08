import type { ScreenProps } from '../../types';

export default function EvidenceScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Evidence Repository</h1>
        <p style={{ fontSize: 12, color: '#58595B' }}>System-generated audit trail · Saudi Arabia (SA) · Q3 2026 · All actions time-stamped</p>
      </div>
      <div style={{ background: 'white', borderRadius: 10, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        {vm.evidenceEnriched.map((e) => (
          <div key={e.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #F5F5F5', alignItems: 'flex-start' }}>
            <div style={e.dotStyle} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                <div style={e.badgeStyle}>{e.typeLabel}</div>
                <div style={{ fontSize: 12, fontWeight: 'bold', color: '#1F1F1D' }}>{e.action}</div>
                <div style={{ fontSize: 10, color: '#58595B', marginLeft: 'auto' }}>{e.ts}</div>
              </div>
              <div style={{ fontSize: 11, color: '#58595B', lineHeight: 1.4, marginBottom: 2 }}>{e.detail}</div>
              <div style={{ fontSize: 10, color: '#A0A0A0' }}>Actor: {e.actor}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
