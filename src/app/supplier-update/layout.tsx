export default function SupplierLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f9fafb' }}>
      <div style={{ borderTop: '3px solid #059669', background: '#ffffff', borderBottom: '1px solid #e5e7eb', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <img src="/nesr-logo-circle.png" height="36" alt="NESR" />
        <span style={{ fontSize: '13px', color: '#6b7280' }}>Supplier Delivery Update Portal</span>
      </div>
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px' }}>
        {children}
      </main>
    </div>
  );
}
