import Image from 'next/image';
import type { Role, ScreenProps } from '../types';

export default function Navbar({ vm }: ScreenProps) {
  return (
    <nav
      style={{
        background: '#2A7E4F',
        height: 54,
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        gap: 12,
        flexShrink: 0,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        zIndex: 10,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <Image src="/nesr-logo-circle.png" alt="NESR" width={26} height={26} />
      </div>
      <div style={{ borderLeft: '1px solid rgba(255,255,255,0.3)', paddingLeft: 12 }}>
        <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10, letterSpacing: 0.3 }}>SOA Consolidation Portal</div>
      </div>
      <div
        style={{
          background: 'rgba(0,0,0,0.18)',
          borderRadius: 20,
          padding: '3px 10px',
          fontSize: 11,
          color: 'rgba(255,255,255,0.9)',
          fontWeight: 'bold',
          letterSpacing: 0.5,
        }}
      >
        Q3 2026
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 11 }}>Viewing as:</span>
        <select
          value={vm.role}
          onChange={(e) => vm.onRoleChange(e.target.value as Role)}
          style={{
            background: 'rgba(0,0,0,0.2)',
            border: '1px solid rgba(255,255,255,0.2)',
            color: 'white',
            padding: '5px 8px',
            borderRadius: 6,
            fontSize: 12,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="champion" style={{ color: '#1F1F1D', background: 'white' }}>SC SOA Champion</option>
          <option value="manager" style={{ color: '#1F1F1D', background: 'white' }}>Supply Chain Manager</option>
          <option value="director" style={{ color: '#1F1F1D', background: 'white' }}>Supply Chain Director</option>
        </select>
      </div>
      <div
        style={{
          background: 'rgba(255,255,255,0.18)',
          borderRadius: '50%',
          width: 32,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontWeight: 'bold',
          fontSize: 13,
          flexShrink: 0,
        }}
      >
        A
      </div>
    </nav>
  );
}
