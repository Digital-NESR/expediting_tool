import type { ScreenProps } from '../../types';

export default function OutreachScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Outreach</h1>
          <p style={{ fontSize: 12, color: '#58595B' }}>Automated vendor outreach — Saudi Arabia (SA) · Q3 2026</p>
        </div>
        {vm.canSendReminders && (
          <button
            onClick={vm.onSendReminders}
            style={{ background: '#E65100', color: 'white', border: 'none', padding: '9px 16px', borderRadius: 7, fontSize: 13, fontWeight: 'bold' }}
          >
            Send Reminders to {vm.remindCount} Vendors
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 16 }}>
        <div style={{ background: 'white', borderRadius: 8, padding: 14, borderTop: '3px solid #2A7E4F', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold', marginBottom: 4 }}>Requests Sent</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#2A7E4F' }}>{vm.totalCount}</div>
          <div style={{ fontSize: 10, color: '#58595B' }}>01 Jul 2026 · All vendors</div>
        </div>
        <div style={{ background: 'white', borderRadius: 8, padding: 14, borderTop: '3px solid #1565C0', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold', marginBottom: 4 }}>Reminders Sent</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#1565C0' }}>{vm.remindedCount}</div>
          <div style={{ fontSize: 10, color: '#58595B' }}>15 Jul 2026 · Day 14</div>
        </div>
        <div style={{ background: 'white', borderRadius: 8, padding: 14, borderTop: '3px solid #E65100', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold', marginBottom: 4 }}>Awaiting Response</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#E65100' }}>{vm.remindCount}</div>
          <div style={{ fontSize: 10, color: '#58595B' }}>Eligible for reminder</div>
        </div>
        <div style={{ background: 'white', borderRadius: 8, padding: 14, borderTop: '3px solid #2A7E4F', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', textAlign: 'center' }}>
          <div style={{ fontSize: 10, color: '#58595B', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 'bold', marginBottom: 4 }}>Responses Received</div>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#2A7E4F' }}>{vm.receivedCount}</div>
          <div style={{ fontSize: 10, color: '#58595B' }}>{vm.coveragePct}% coverage</div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 10, padding: 18, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div style={{ fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 0.5, color: '#58595B', marginBottom: 12 }}>
          Approved Email Template (Ref: SOP Appendix 6.3)
        </div>
        <div style={{ border: '1px solid #D1D3D4', borderRadius: 8, overflow: 'hidden', maxWidth: 680 }}>
          <div style={{ background: '#2A7E4F', padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ color: 'white', fontWeight: 'bold', fontSize: 13, letterSpacing: 2 }}>NESR</div>
            <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11 }}>National Energy Services Reunited Corp.</div>
          </div>
          <div style={{ padding: 18 }}>
            <div style={{ fontSize: 11, color: '#58595B', marginBottom: 3 }}>
              <strong>From:</strong> noreply-soa@nesr.com
            </div>
            <div style={{ fontSize: 11, color: '#58595B', marginBottom: 3 }}>
              <strong>To:</strong> [vendor-accounts@example.com]
            </div>
            <div style={{ fontSize: 11, color: '#58595B', marginBottom: 12 }}>
              <strong>Subject:</strong> NESR Statement of Account Request — Q3 2026 | Saudi Arabia
            </div>
            <div style={{ borderTop: '1px solid #E0E0E0', paddingTop: 12 }}>
              <p style={{ fontSize: 12, marginBottom: 10 }}>Dear [Vendor Name],</p>
              <p style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
                As part of NESR&apos;s quarterly reconciliation process, we kindly request your Statement of Account for the
                period ending <strong>30 June 2026</strong> for transactions with our legal entity in <strong>Saudi Arabia (SA)</strong>.
              </p>
              <p style={{ fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
                Please submit your SOA in the standard NESR format (template attached) by <strong>15 July 2026</strong> using
                the secure upload link below. No account creation is required.
              </p>
              <div style={{ background: '#F5F5F5', borderRadius: 6, padding: 12, margin: '12px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#58595B', marginBottom: 6 }}>Secure Upload Link (expires: 15 Jul 2026)</div>
                <div style={{ background: '#2A7E4F', color: 'white', display: 'inline-block', padding: '8px 20px', borderRadius: 5, fontSize: 12, fontWeight: 'bold' }}>
                  Submit Your SOA →
                </div>
              </div>
              <p style={{ fontSize: 11, color: '#58595B', lineHeight: 1.5 }}>
                For queries, contact your NESR Supply Chain SOA Champion: Ahmed Al-Rashidi · aarashidi@nesr.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
