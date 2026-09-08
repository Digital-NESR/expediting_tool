export default function Footer() {
  return (
    <div style={{ background: '#1F1F1D', color: '#fff', padding: '16px 28px', display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/nesr_logo_white.png" alt="NESR" style={{ height: 24, width: 'auto', display: 'block' }} />
        <div style={{ fontSize: 11, color: '#D1D3D4' }}>National Energy Services Reunited Corp.&nbsp; |&nbsp; www.nesr.com</div>
      </div>
      <div style={{ fontSize: 11, color: '#8A8C8E' }}>NESR-DIGI-PRD-SSR-01 &#183; Phase 1 prototype &#183; SAP remains the sole system of approval and execution</div>
    </div>
  );
}
