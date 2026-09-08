'use client';

import { useState } from 'react';
import { clsLabel, displayStatus, leafOf, money, nodePath, statusStyle } from '../lib/helpers';
import { daysFromToday, formatDate } from '../lib/date';
import type { RegistryApp } from '../lib/useRegistryApp';

const SHOW_SAP_PANEL = true;

export default function DetailScreen({ app }: { app: RegistryApp }) {
  const rec = app.records.find((r) => r.rid === app.selectedId);
  const [localRejectText, setLocalRejectText] = useState('');

  if (!rec) {
    return (
      <div>
        <button onClick={() => app.go('registry')} className="link-btn">&#8592; Back to registry</button>
        <div style={{ padding: 44, textAlign: 'center', color: '#58595B' }}>Record not found.</div>
      </div>
    );
  }

  const status = displayStatus(rec);
  const ss = statusStyle(status);
  const published = !!rec.id;
  const dLeft = rec.expiry ? daysFromToday(rec.expiry) : null;
  const kind = app.roleKind;
  // Admins carry every role's powers; everyone else acts only inside the
  // countries their access request was approved for.
  const isAdmin = app.viewer.isAdmin;
  const inScope = app.canActOn(rec.country);
  const can = (k: 'req' | 'l1' | 'l2') => inScope && (isAdmin || kind === k);

  const actions: { label: string; bg: string; fg: string; border: string; onClick: () => void }[] = [];
  const canReq = can('req');
  if ((rec.base === 'Draft' || rec.base === 'Rejected') && canReq) {
    actions.push({ label: rec.base === 'Rejected' ? 'Resubmit for Level 1 validation' : 'Submit for Level 1 validation', bg: '#2A7E4F', fg: '#fff', border: '#2A7E4F', onClick: () => app.advance(rec.rid) });
  }
  if (rec.base === 'Pending Level 1' && can('l1')) {
    actions.push({ label: 'Validate — route to Level 2', bg: '#2A7E4F', fg: '#fff', border: '#2A7E4F', onClick: () => app.advance(rec.rid) });
    actions.push({ label: 'Reject to Draft with a reason', bg: '#fff', fg: '#9B1C1C', border: '#C99999', onClick: () => app.setRejectFor(rec.rid) });
  }
  if (rec.base === 'Pending Level 2' && can('l2')) {
    actions.push({ label: published ? 'Confirm review — extend expiry 12 months' : 'Sign off — publish Registry ID', bg: '#2A7E4F', fg: '#fff', border: '#2A7E4F', onClick: () => app.advance(rec.rid) });
    actions.push({ label: 'Reject to Draft with a reason', bg: '#fff', fg: '#9B1C1C', border: '#C99999', onClick: () => app.setRejectFor(rec.rid) });
  }
  if ((status === 'Expiring soon' || status === 'Expired') && canReq) {
    actions.push({ label: 'Start periodic review', bg: '#2A7E4F', fg: '#fff', border: '#2A7E4F', onClick: () => app.startReview(rec.rid) });
  }

  let actionNote = `This record is at ${status}.`;
  if (!actions.length) {
    actionNote = inScope
      ? `No action is available to you on this record at ${status}. It is routed to a different role.`
      : `This is a ${rec.country} record and your access does not cover that country.`;
  }

  let sapNote = 'Valid reference. The PO approver can trust the exception is pre-validated.';
  let sapNoteColor = '#1D5B39';
  if (!published) {
    sapNote = 'No ID yet. Do not raise the single-quotation PO until the record is Active.';
    sapNoteColor = '#9B1C1C';
  } else if (status === 'Expired') {
    sapNote = 'Expired. Any SAP reference to this ID should be treated as non-compliant until extended.';
    sapNoteColor = '#9B1C1C';
  } else if (status === 'Expiring soon') {
    sapNote = `Valid, but expires in ${dLeft} days. Begin periodic review now.`;
    sapNoteColor = '#8A4B00';
  }

  const fields = [
    { label: 'CLASSIFICATION', value: clsLabel(rec.cls) },
    { label: 'COUNTRY / ENTITY', value: rec.country },
    { label: 'SUPPLIER SAP ID', value: rec.supplierId },
    { label: 'SUPPLIER SAP NAME', value: rec.supplierName },
    { label: 'REASON CODE', value: rec.reason },
    { label: 'SEGMENT TAGS', value: rec.segments.join(', ') || '—' },
    { label: 'REQUESTOR', value: rec.requestor },
    { label: 'ESTIMATED ANNUAL SPEND', value: money(rec.spend) },
    { label: 'VALIDATOR — LEVEL 1', value: 'Country Supply Chain Manager, ' + rec.country },
    { label: 'VALIDATOR — LEVEL 2', value: 'Category Manager / Supply Chain Director' },
    { label: 'ISSUE DATE', value: rec.issue ? formatDate(rec.issue) : 'Not issued' },
    { label: 'EXPIRY DATE', value: rec.expiry ? formatDate(rec.expiry) : 'Not issued' },
  ];

  const history = [...rec.history].reverse();
  const rejectOpen = app.rejectFor === rec.rid;
  const copyLabel = app.copied ? 'Copied' : 'Copy ID';

  return (
    <div>
      <button onClick={() => app.go('registry')} className="link-btn">&#8592; Back to registry</button>

      <div style={{ background: '#fff', border: '1px solid #E4E6E6', borderTop: '4px solid #2A7E4F', padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 20, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}>REGISTRY ID</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <div style={{ fontFamily: 'Consolas,Menlo,monospace', fontSize: 32, fontWeight: 'bold', color: '#1D5B39', letterSpacing: 1 }}>{rec.id || 'Not issued'}</div>
              <button onClick={() => app.onCopyId(rec.id)} className="btn-copy">{copyLabel}</button>
            </div>
            <div style={{ fontSize: 12, color: '#58595B', marginTop: 6 }}>
              {published ? 'Immutable once issued. Format {TYPE}-{COUNTRY}-{YEAR}-{SEQUENCE}.' : 'The Registry ID is generated only when the record is published to Active.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}>STATUS</div>
              <div style={{ marginTop: 7 }}>
                <span style={{ display: 'inline-block', fontSize: 12.5, fontWeight: 'bold', padding: '5px 12px', borderRadius: 12, background: ss[0], color: ss[1] }}>{status}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}>VALIDITY</div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 'bold' }}>
                {rec.issue ? `${formatDate(rec.issue)} → ${formatDate(rec.expiry)}` : 'Fixed 12 months from issue date'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #E4E6E6', fontSize: 13, fontWeight: 'bold', borderLeft: '4px solid #2A7E4F' }}>Registry Record</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {fields.map((f) => (
                <div key={f.label} style={{ padding: '12px 18px', borderBottom: '1px solid #F0F1F1', borderRight: '1px solid #F0F1F1' }}>
                  <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}>{f.label}</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F0F1F1' }}>
              <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}>TAXONOMY SCOPE</div>
              <div style={{ fontSize: 12, color: '#58595B', margin: '6px 0 8px' }}>Scoped at {rec.level} level. Category and Sub-Category are shown for reference only.</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rec.nodes.map((n, i) => (
                  <div key={i} style={{ background: '#F7F9F8', borderLeft: '3px solid #6AAF8E', padding: '8px 12px', fontSize: 12.5 }}>
                    <span style={{ color: '#58595B' }}>{nodePath(n)}</span>
                    <span style={{ fontWeight: 'bold' }}>{leafOf(n)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F0F1F1' }}>
              <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}>JUSTIFICATION NARRATIVE</div>
              <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>{rec.justification || '—'}</div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}>EVIDENCE ATTACHMENT</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, background: '#F7F9F8', border: '1px solid #E4E6E6', padding: '10px 12px' }}>
                <div style={{ width: 28, height: 34, background: '#2A7E4F', color: '#fff', fontSize: 9, fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>PDF</div>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 'bold' }}>{rec.evidence}</div>
                  <div style={{ fontSize: 11, color: '#58595B' }}>Uploaded by {rec.requestor}</div>
                </div>
              </div>
            </div>
          </div>

          {SHOW_SAP_PANEL && (
            <div style={{ background: '#1F1F1D', color: '#fff', border: '1px solid #1F1F1D' }}>
              <div style={{ padding: '12px 18px', borderBottom: '1px solid #3A3A38', fontSize: 13, fontWeight: 'bold', borderLeft: '4px solid #6AAF8E' }}>SAP Hand-off</div>
              <div style={{ padding: '16px 18px' }}>
                <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#D1D3D4', lineHeight: 1.55, maxWidth: 560 }}>
                  Approval of the PO/RFQ stays entirely in SAP. The requestor enters this Registry ID on the transaction as evidence that the single-quotation case is pre-validated.
                </p>
                <div style={{ background: '#fff', color: '#1F1F1D', padding: 14, maxWidth: 560 }}>
                  <div style={{ fontSize: 10.5, color: '#58595B', fontWeight: 'bold', letterSpacing: 0.5, marginBottom: 10 }}>SAP ME21N &#8212; CREATE PURCHASE ORDER &#8250; HEADER &#8250; TEXTS</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                    <div style={{ color: '#58595B' }}>Vendor</div>
                    <div style={{ border: '1px solid #D1D3D4', background: '#F4F5F5', padding: '6px 8px' }}>{rec.supplierId} &#8212; {rec.supplierName}</div>
                    <div style={{ color: '#58595B' }}>Quotations received</div>
                    <div style={{ border: '1px solid #D1D3D4', background: '#F4F5F5', padding: '6px 8px' }}>1</div>
                    <div style={{ color: '#58595B', fontWeight: 'bold' }}>S&amp;S Registry ID</div>
                    <div style={{ border: '2px solid #2A7E4F', background: '#fff', padding: '6px 8px', fontFamily: 'Consolas,Menlo,monospace', fontWeight: 'bold', color: '#1D5B39' }}>{rec.id || '(blank)'}</div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11.5, color: sapNoteColor, fontWeight: 'bold' }}>{sapNote}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #E4E6E6', fontSize: 13, fontWeight: 'bold', borderLeft: '4px solid #2A7E4F' }}>Your Actions</div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11.5, color: '#58595B', lineHeight: 1.5 }}>{actionNote}</div>
              {actions.map((a) => (
                <button key={a.label} onClick={a.onClick} className="btn-action" style={{ background: a.bg, border: `1px solid ${a.border}`, color: a.fg }}>{a.label}</button>
              ))}
              {rejectOpen && (
                <div style={{ border: '1px solid #E4A0A0', background: '#FCF4F4', padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 'bold', color: '#9B1C1C', letterSpacing: 0.5, marginBottom: 6 }}>REJECTION REASON &#8212; LOGGED ON THE RECORD</div>
                  <textarea
                    value={localRejectText}
                    onChange={(e) => setLocalRejectText(e.target.value)}
                    placeholder="State what is missing so the requestor can resubmit with stronger evidence."
                    style={{ width: '100%', minHeight: 76, border: '1px solid #D1D3D4', padding: 8, resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button onClick={() => { app.reject(rec.rid, localRejectText); setLocalRejectText(''); }} style={{ background: '#9B1C1C', border: 0, color: '#fff', fontWeight: 'bold', fontSize: 12, padding: '8px 14px', borderRadius: 2, cursor: 'pointer' }}>Reject to Draft</button>
                    <button onClick={() => { app.setRejectFor(null); setLocalRejectText(''); }} style={{ background: '#fff', border: '1px solid #D1D3D4', color: '#58595B', fontWeight: 'bold', fontSize: 12, padding: '8px 14px', borderRadius: 2, cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div style={{ padding: '12px 18px', borderBottom: '1px solid #E4E6E6', fontSize: 13, fontWeight: 'bold', borderLeft: '4px solid #2A7E4F' }}>Validation &amp; Review History</div>
            <div style={{ padding: '16px 18px 6px' }}>
              {history.map((h, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 12, paddingBottom: 16 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ width: 11, height: 11, borderRadius: '50%', background: i === 0 ? '#2A7E4F' : '#6AAF8E', marginTop: 3 }} />
                    <div style={{ width: 1, flex: 1, background: '#E4E6E6' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 'bold' }}>{h.step}</div>
                    <div style={{ fontSize: 11.5, color: '#58595B', marginTop: 2 }}>{h.actor}</div>
                    <div style={{ fontSize: 11.5, color: '#58595B' }}>{formatDate(h.date)}</div>
                    {h.note && (
                      <div style={{ fontSize: 11.5, color: '#1F1F1D', background: '#F7F9F8', borderLeft: '3px solid #D1D3D4', padding: '6px 9px', marginTop: 6, lineHeight: 1.5 }}>{h.note}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E4E6E6', padding: '16px 18px' }}>
            <div style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.6, marginBottom: 8 }}>CLASSIFICATION GUIDANCE</div>
            <div style={{ fontSize: 12, color: '#1F1F1D', lineHeight: 1.55 }}>
              {rec.cls === 'SGL'
                ? 'Single-source is a market condition: only one supplier is capable of fulfilling the requirement in that country. The justification is evidence that no viable alternative exists.'
                : 'Sole-source is a business decision: alternatives exist, but NESR has chosen one vendor. The justification is a business rationale for restricting sourcing, not proof that no alternative exists.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
