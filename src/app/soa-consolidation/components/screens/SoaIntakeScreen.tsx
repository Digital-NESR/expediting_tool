import type { ScreenProps } from '../../types';

export default function SoaIntakeScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>SOA Intake</h1>
        <p style={{ fontSize: 12, color: '#58595B' }}>Vendor-facing secure upload experience (portal preview)</p>
      </div>
      <div style={{ background: '#F0F4F1', border: '2px dashed #2A7E4F', borderRadius: 10, padding: '12px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ background: '#2A7E4F', color: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 'bold', flexShrink: 0 }}>
          PREVIEW
        </div>
        <div style={{ fontSize: 12, color: '#2A7E4F' }}>
          This is what the vendor sees when they click the secure link in their request email. No account creation required.
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', maxWidth: 680, margin: '0 auto' }}>
        <div style={{ background: '#2A7E4F', padding: '16px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: 14, letterSpacing: 2 }}>NESR</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>Vendor Statement of Account Portal</div>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 6, padding: '5px 12px', color: 'white', fontSize: 11, fontWeight: 'bold' }}>
            Q3 2026
          </div>
        </div>
        <div style={{ padding: 22 }}>
          <div style={{ borderBottom: '1px solid #E0E0E0', paddingBottom: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 6 }}>Statement of Account Submission</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: '#F5F5F5', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold' }}>Legal Entity</div>
                <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 2 }}>NESR Saudi Arabia Co.</div>
              </div>
              <div style={{ background: '#F5F5F5', borderRadius: 6, padding: '8px 12px' }}>
                <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold' }}>Submission Deadline</div>
                <div style={{ fontSize: 13, fontWeight: 'bold', color: '#E65100', marginTop: 2 }}>15 July 2026</div>
              </div>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#1F1F1D' }}>Required Information</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#58595B', marginBottom: 3, fontWeight: 'bold' }}>Vendor Name *</div>
                <div style={{ border: '1px solid #D1D3D4', borderRadius: 5, padding: '8px 10px', fontSize: 12, color: '#58595B' }}>Al-Zamil Industrial Inv.</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#58595B', marginBottom: 3, fontWeight: 'bold' }}>Vendor No. *</div>
                <div style={{ border: '1px solid #D1D3D4', borderRadius: 5, padding: '8px 10px', fontSize: 12, color: '#58595B', fontFamily: 'monospace' }}>
                  SA-023456
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 11, color: '#58595B', marginBottom: 3, fontWeight: 'bold' }}>Period *</div>
                <div style={{ border: '1px solid #D1D3D4', borderRadius: 5, padding: '8px 10px', fontSize: 12, color: '#58595B' }}>Q3 2026 (Apr – Jun 2026)</div>
              </div>
              <div>
                <div style={{ fontSize: 11, color: '#58595B', marginBottom: 3, fontWeight: 'bold' }}>Currency *</div>
                <div style={{ border: '1px solid #D1D3D4', borderRadius: 5, padding: '8px 10px', fontSize: 12, color: '#58595B' }}>SAR</div>
              </div>
            </div>
          </div>
          <div style={{ border: '2px dashed #D1D3D4', borderRadius: 8, padding: 20, textAlign: 'center', marginBottom: 14, background: '#FAFAFA' }}>
            <div style={{ fontSize: 24, marginBottom: 6 }}>📄</div>
            <div style={{ fontSize: 13, fontWeight: 'bold', color: '#1F1F1D', marginBottom: 4 }}>Upload SOA File</div>
            <div style={{ fontSize: 11, color: '#58595B', marginBottom: 10 }}>Excel (.xlsx) or signed PDF · Max 10MB</div>
            <div
              onClick={vm.onOpenUploadFlow}
              style={{ background: '#2A7E4F', color: 'white', display: 'inline-block', padding: '8px 18px', borderRadius: 6, fontSize: 12, fontWeight: 'bold', cursor: 'pointer' }}
            >
              Browse File
            </div>
          </div>
          <div style={{ background: '#F0F7F3', border: '1px solid #C5E0D2', borderRadius: 6, padding: '10px 12px', fontSize: 11, color: '#2A7E4F', lineHeight: 1.5 }}>
            Your submission is encrypted and stored securely. It will be validated against the NESR SOA template and
            acknowledged within 24 hours. Contact aarashidi@nesr.com with any questions.
          </div>
        </div>
      </div>
    </div>
  );
}
