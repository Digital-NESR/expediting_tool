import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Supplier Portal — NESR Procurement' };

export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <header style={{
        height: '64px',
        background: '#ffffff',
        borderTop: '3px solid #059669',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        padding: '0 32px',
        flexShrink: 0,
      }}>
        <img
          src="/nesr-logo-circle.png"
          alt="NESR"
          style={{ height: '32px', width: 'auto', flexShrink: 0 }}
        />
        <span style={{ fontSize: '13px', color: '#9ca3af', marginLeft: '12px' }}>
          Supplier Delivery Update Portal
        </span>
      </header>
      <main style={{ minHeight: 'calc(100vh - 64px)', padding: '32px' }}>
        {children}
      </main>
    </div>
  );
}
