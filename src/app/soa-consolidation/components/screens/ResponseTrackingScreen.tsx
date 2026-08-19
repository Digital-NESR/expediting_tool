import { Fragment } from 'react';
import type { ScreenProps } from '../../types';

export default function ResponseTrackingScreen({ vm }: ScreenProps) {
  return (
    <div style={{ animation: 'fadeIn 0.2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 3 }}>Response Tracking</h1>
          <p style={{ fontSize: 12, color: '#58595B' }}>Live vendor response status — Saudi Arabia (SA) · Q3 2026</p>
        </div>
        {vm.hasRemindable && (
          <button
            onClick={vm.onSendReminders}
            style={{ background: '#E65100', color: 'white', border: 'none', padding: '8px 14px', borderRadius: 7, fontSize: 12, fontWeight: 'bold' }}
          >
            Send All Reminders ({vm.remindCount})
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {vm.filterTabs.map((tab) => (
          <div key={tab.status} onClick={tab.onClick} style={tab.tabStyle}>
            {tab.label} ({tab.count})
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 10, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 100px 90px 80px 80px 80px 60px',
            gap: 8,
            padding: '10px 14px',
            background: '#2A7E4F',
            color: 'white',
            fontSize: 10,
            fontWeight: 'bold',
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            alignItems: 'center',
          }}
        >
          <div>Vendor</div>
          <div>Status</div>
          <div>PO Amount</div>
          <div>Requested</div>
          <div>Reminded</div>
          <div>Responded</div>
          <div />
        </div>
        {vm.vendorsEnriched.map((v) => (
          <Fragment key={v.id}>
            <div
              onClick={v.onToggle}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 100px 90px 80px 80px 80px 60px',
                gap: 8,
                padding: '10px 14px',
                fontSize: 12,
                borderBottom: '1px solid #F0F0F0',
                cursor: 'pointer',
                alignItems: 'center',
                background: v.rowBg,
              }}
            >
              <div>
                <div style={{ fontWeight: 'bold', fontSize: 13 }}>{v.name}</div>
                <div style={{ fontSize: 10, color: '#58595B', fontFamily: 'monospace', marginTop: 1 }}>{v.no}</div>
              </div>
              <div style={v.badgeStyle}>{v.statusLabel}</div>
              <div style={{ fontWeight: 'bold' }}>{v.fmtOpenPO}</div>
              <div style={{ fontSize: 11, color: '#58595B' }}>{v.reqDate}</div>
              <div style={{ fontSize: 11, color: '#58595B' }}>{v.remDate ?? '—'}</div>
              <div style={{ fontSize: 11, color: '#58595B' }}>{v.respDate ?? '—'}</div>
              <div style={{ fontSize: 11, color: '#58595B', textAlign: 'right' }}>{v.isExpanded ? '▲' : '▼'}</div>
            </div>
            {v.isExpanded && (
              <div style={{ background: '#F5FAF7', borderBottom: '1px solid #D1D3D4', padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ flex: 1, fontSize: 11, color: '#58595B' }}>
                  {v.canAccept && <span>Upload link active · Vendor can submit via email link</span>}
                  {v.isReceived && (
                    <span style={{ color: '#2A7E4F', fontWeight: 'bold' }}>
                      ✓ SOA received · {v.invCount} invoices on file · Currency: {v.currency}
                    </span>
                  )}
                </div>
                {v.canAccept && (
                  <button
                    onClick={v.onAccept}
                    style={{ background: '#2A7E4F', color: 'white', border: 'none', padding: '7px 12px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}
                  >
                    Accept SOA Upload
                  </button>
                )}
                {v.canRemind && (
                  <button
                    onClick={v.onRemind}
                    style={{ background: '#1565C0', color: 'white', border: 'none', padding: '7px 12px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}
                  >
                    Send Reminder
                  </button>
                )}
                {v.canNR && (
                  <button
                    onClick={v.onNR}
                    style={{ background: '#B71C1C', color: 'white', border: 'none', padding: '7px 12px', borderRadius: 6, fontSize: 11, fontWeight: 'bold' }}
                  >
                    Mark Non-Responder
                  </button>
                )}
              </div>
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
