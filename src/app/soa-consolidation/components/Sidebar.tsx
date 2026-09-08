import type { ScreenProps } from '../types';

export default function Sidebar({ vm }: ScreenProps) {
  return (
    <aside
      style={{
        width: 205,
        background: '#151C18',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        overflowY: 'auto',
        padding: '12px 10px',
      }}
    >
      <div
        style={{
          background: 'rgba(42,126,79,0.15)',
          border: '1px solid rgba(42,126,79,0.3)',
          borderRadius: 7,
          padding: '10px 11px',
          marginBottom: 12,
        }}
      >
        <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 2 }}>
          Active Scope
        </div>
        <div style={{ color: 'white', fontSize: 13, fontWeight: 'bold', lineHeight: 1.3 }}>{vm.roleCountry}</div>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10, marginTop: 1 }}>{vm.roleLabel}</div>
      </div>

      {vm.navItems.map((nav) => (
        <div key={nav.id} onClick={nav.onClick} style={nav.style}>
          <span style={{ flex: 1 }}>{nav.label}</span>
          {nav.hasBadge && (
            <span
              style={{
                background: '#E65100',
                color: 'white',
                borderRadius: 10,
                padding: '1px 6px',
                fontSize: 10,
                fontWeight: 'bold',
                flexShrink: 0,
              }}
            >
              {nav.badge}
            </span>
          )}
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div style={{ padding: 10, borderTop: '1px solid rgba(255,255,255,0.07)', marginTop: 10 }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9, lineHeight: 1.7 }}>NESR-SC-01-GR2PAY</div>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 9 }}>Rev.01 · Jul 2024</div>
      </div>
    </aside>
  );
}
