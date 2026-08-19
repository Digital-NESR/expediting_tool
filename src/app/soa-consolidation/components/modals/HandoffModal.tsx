import type { ScreenProps } from '../../types';

export default function HandoffModal({ vm }: ScreenProps) {
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
        <div style={{ color: 'white', fontWeight: 'bold', fontSize: 14 }}>Confirm Handoff to Finance</div>
        <div onClick={vm.onCloseModal} style={{ color: 'white', cursor: 'pointer', fontSize: 18, opacity: 0.7 }}>
          ✕
        </div>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ background: '#E8F5EE', border: '1px solid #C5E0D2', borderRadius: 8, padding: 14, marginBottom: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 'bold', color: '#2A7E4F', marginBottom: 6 }}>
            Control Criteria Met — Ready for Handoff
          </div>
          <div style={{ fontSize: 11, color: '#58595B', lineHeight: 1.6 }}>
            ✓ Coverage: {vm.coveragePct}% (≥70% Q3 threshold)
            <br />
            ✓ 2-request evidence: complete for all {vm.receivedCount} vendors
            <br />
            ✓ 10–14 day gap: all reminders within SOP window
            <br />
            ✓ Non-responder evidence: retained on file
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#58595B', marginBottom: 16, lineHeight: 1.5 }}>
          The consolidated SOA file <strong>NESR-KSA-SOA-Q3-2026.xlsx</strong> will be marked as delivered to the AP/Finance
          Country Group inbox. This action is logged in the evidence repository.
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={vm.onCloseModal}
            style={{ flex: 1, background: '#F5F5F5', color: '#58595B', border: 'none', padding: 10, borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
          >
            Cancel
          </button>
          <button
            onClick={vm.onConfirmHandoff}
            style={{ flex: 2, background: '#2A7E4F', color: 'white', border: 'none', padding: 10, borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
          >
            Confirm Handoff to AP/Finance →
          </button>
        </div>
      </div>
    </>
  );
}
