import type { ScreenProps } from '../../types';

export default function UploadModal({ vm }: ScreenProps) {
  return (
    <>
      <div
        style={{
          background: '#2A7E4F',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Accept SOA — {vm.modalVendorName}</div>
        <div onClick={vm.onCloseModal} style={{ color: 'white', cursor: 'pointer', fontSize: 18, opacity: 0.7 }}>
          ✕
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ background: '#F5F5F5', borderRadius: 7, padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#58595B' }}>
          <div style={{ fontWeight: 'bold', color: '#1F1F1D', marginBottom: 2 }}>{vm.modalVendorName}</div>
          <div>Vendor No: {vm.modalVendorNo} · PO Amount: {vm.modalVendorAmt}</div>
        </div>

        {vm.isUploadStep0 && (
          <div>
            <div style={{ border: '2px dashed #D1D3D4', borderRadius: 8, padding: 24, textAlign: 'center', background: '#FAFAFA', marginBottom: 14 }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Drop vendor SOA file here</div>
              <div style={{ fontSize: 11, color: '#58595B', marginBottom: 12 }}>Excel (.xlsx) or signed PDF · Max 10MB</div>
              <button
                onClick={vm.onSimulateUpload}
                style={{ background: '#2A7E4F', color: 'white', border: 'none', padding: '9px 20px', borderRadius: 6, fontSize: 12, fontWeight: 'bold' }}
              >
                Simulate File Upload
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#58595B', lineHeight: 1.4 }}>
              File will be validated against the NESR SOA Template schema (Appendix 6.2). Required fields: Vendor No., Inv#, PO#, amounts, currency.
            </div>
          </div>
        )}

        {vm.isUploadStep1 && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <div
              style={{
                width: 40,
                height: 40,
                border: '3px solid #E0E0E0',
                borderTopColor: '#2A7E4F',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 12px',
              }}
            />
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 4 }}>Validating file…</div>
            <div style={{ fontSize: 11, color: '#58595B' }}>Checking required fields: Vendor No., Inv#, PO#, amounts</div>
          </div>
        )}

        {vm.isUploadStep2 && (
          <div>
            <div style={{ background: '#E8F5EE', border: '1px solid #2A7E4F', borderRadius: 8, padding: 14, textAlign: 'center', marginBottom: 14 }}>
              <div style={{ fontSize: 24, marginBottom: 6, color: '#2A7E4F' }}>✓</div>
              <div style={{ fontSize: 13, fontWeight: 'bold', color: '#2A7E4F', marginBottom: 3 }}>File Validated Successfully</div>
              <div style={{ fontSize: 11, color: '#58595B' }}>All required fields present · Format matches SOA Template</div>
            </div>
            <div style={{ background: '#F5F5F5', borderRadius: 6, padding: '10px 14px', marginBottom: 14, fontSize: 11, color: '#58595B' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <div><strong>Invoices detected:</strong> {vm.modalInvCount}</div>
                <div><strong>Currency:</strong> SAR</div>
                <div><strong>Period:</strong> Q3 2026</div>
                <div><strong>Vendor No.:</strong> {vm.modalVendorNo}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={vm.onCloseModal}
                style={{ flex: 1, background: '#F5F5F5', color: '#58595B', border: 'none', padding: 10, borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
              >
                Cancel
              </button>
              <button
                onClick={vm.onAcceptSOA}
                style={{ flex: 2, background: '#2A7E4F', color: 'white', border: 'none', padding: 10, borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
              >
                Accept &amp; Store SOA →
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
