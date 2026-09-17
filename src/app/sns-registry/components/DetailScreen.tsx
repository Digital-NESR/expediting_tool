'use client';

import { useEffect, useState } from 'react';
import { clsLabel, displayStatus, leafOf, money, nodePath, statusStyle } from '../lib/helpers';
import { daysFromToday, formatDate } from '../lib/date';
import { exportRecordPdf } from '../lib/exportRecordPdf';
import { getSnsRecordNotifications } from '@/app/actions/sns-documents';
import type { SnsNotificationLogRow } from '@/app/actions/sns-documents';
import type { RegistryApp } from '../lib/useRegistryApp';

const SHOW_SAP_PANEL = true;

export default function DetailScreen({ app }: { app: RegistryApp }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const rec = app.records.find((r) => r.rid === app.selectedId);
  const [localRejectText, setLocalRejectText] = useState('');

  if (!rec) {
    return (
      <div>
        <button onClick={() => app.go('registry')} className="link-btn">
          &#8592; Back to registry
        </button>
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
  const inScope = app.canActOn(rec.countryCode);
  const can = (k: 'req' | 'l1' | 'l2') => inScope && (isAdmin || kind === k);

  const actions: { label: string; bg: string; fg: string; border: string; onClick: () => void }[] =
    [];
  const canReq = can('req');
  if ((rec.base === 'Draft' || rec.base === 'Rejected') && canReq) {
    actions.push({
      label:
        rec.base === 'Rejected'
          ? 'Resubmit for Level 1 validation'
          : 'Submit for Level 1 validation',
      bg: '#2A7E4F',
      fg: '#fff',
      border: '#2A7E4F',
      onClick: () => app.advance(rec.rid),
    });
  }
  if (rec.base === 'Pending Level 1' && can('l1')) {
    actions.push({
      label: 'Validate — route to Level 2',
      bg: '#2A7E4F',
      fg: '#fff',
      border: '#2A7E4F',
      onClick: () => app.advance(rec.rid),
    });
    actions.push({
      label: 'Reject to Draft with a reason',
      bg: '#fff',
      fg: '#9B1C1C',
      border: '#C99999',
      onClick: () => app.setRejectFor(rec.rid),
    });
  }
  if (rec.base === 'Pending Level 2' && can('l2')) {
    actions.push({
      label: published
        ? 'Confirm review — extend expiry 12 months'
        : 'Sign off — publish Registry ID',
      bg: '#2A7E4F',
      fg: '#fff',
      border: '#2A7E4F',
      onClick: () => app.advance(rec.rid),
    });
    actions.push({
      label: 'Reject to Draft with a reason',
      bg: '#fff',
      fg: '#9B1C1C',
      border: '#C99999',
      onClick: () => app.setRejectFor(rec.rid),
    });
  }
  if ((status === 'Expiring soon' || status === 'Expired') && canReq) {
    actions.push({
      label: 'Start periodic review',
      bg: '#2A7E4F',
      fg: '#fff',
      border: '#2A7E4F',
      onClick: () => app.startReview(rec.rid),
    });
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
    sapNote =
      'Expired. Any SAP reference to this ID should be treated as non-compliant until extended.';
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
      <button onClick={() => app.go('registry')} className="link-btn">
        &#8592; Back to registry
      </button>

      <div
        style={{
          background: '#fff',
          border: '1px solid #E4E6E6',
          borderTop: '4px solid #2A7E4F',
          padding: '20px 22px',
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: 20,
            alignItems: 'flex-start',
          }}
        >
          <div>
            <div
              style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}
            >
              REGISTRY ID
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
              <div
                style={{
                  fontFamily: 'Consolas,Menlo,monospace',
                  fontSize: 32,
                  fontWeight: 'bold',
                  color: '#1D5B39',
                  letterSpacing: 1,
                }}
              >
                {rec.id || 'Not issued'}
              </div>
              <button onClick={() => app.onCopyId(rec.id)} className="btn-copy">
                {copyLabel}
              </button>
            </div>
            <div style={{ fontSize: 12, color: '#58595B', marginTop: 6 }}>
              {published
                ? 'Immutable once issued. Format {TYPE}-{COUNTRY}-{SAP ID}-{ISSUE YY-MM}-{EXPIRY YY-MM}-{SEQUENCE}.'
                : 'The Registry ID is generated only when the record is published to Active.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
            <div>
              <div
                style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}
              >
                STATUS
              </div>
              <div style={{ marginTop: 7 }}>
                <span
                  style={{
                    display: 'inline-block',
                    fontSize: 12.5,
                    fontWeight: 'bold',
                    padding: '5px 12px',
                    borderRadius: 12,
                    background: ss[0],
                    color: ss[1],
                  }}
                >
                  {status}
                </span>
              </div>
            </div>
            <div>
              <div
                style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.7 }}
              >
                VALIDITY
              </div>
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 'bold' }}>
                {rec.issue
                  ? `${formatDate(rec.issue)} → ${formatDate(rec.expiry)}`
                  : rec.expiry
                    ? `Expires ${formatDate(rec.expiry)} — issued on Level 2 sign-off`
                    : 'Set on the record before sign-off'}
              </div>

              <button
                onClick={() => {
                  setPdfError(null);
                  setPdfBusy(true);
                  void exportRecordPdf(rec)
                    .catch(() => setPdfError('Could not build the PDF.'))
                    .finally(() => setPdfBusy(false));
                }}
                disabled={pdfBusy}
                className="btn-outline"
                style={{ marginTop: 10, padding: '7px 12px', fontSize: 12 }}
              >
                {pdfBusy ? 'Building PDF…' : 'Export record as PDF'}
              </button>
              <div style={{ fontSize: 11, color: '#58595B', marginTop: 5, maxWidth: 260 }}>
                Attach this to the SAP transaction alongside the Registry ID.
              </div>
              {pdfError && (
                <div style={{ fontSize: 11.5, color: '#9B1C1C', marginTop: 5 }}>{pdfError}</div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{ display: 'grid', gridTemplateColumns: '1.55fr 1fr', gap: 16, alignItems: 'start' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid #E4E6E6',
                fontSize: 13,
                fontWeight: 'bold',
                borderLeft: '4px solid #2A7E4F',
              }}
            >
              Registry Record
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
              {fields.map((f) => (
                <div
                  key={f.label}
                  style={{
                    padding: '12px 18px',
                    borderBottom: '1px solid #F0F1F1',
                    borderRight: '1px solid #F0F1F1',
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 'bold',
                      color: '#58595B',
                      letterSpacing: 0.5,
                    }}
                  >
                    {f.label}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{f.value}</div>
                </div>
              ))}
            </div>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F0F1F1' }}>
              <div
                style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}
              >
                TAXONOMY SCOPE
              </div>
              <div style={{ fontSize: 12, color: '#58595B', margin: '6px 0 8px' }}>
                Scoped at {rec.level} level. Category and Sub-Category are shown for reference only.
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rec.nodes.map((n, i) => (
                  <div
                    key={i}
                    style={{
                      background: '#F7F9F8',
                      borderLeft: '3px solid #6AAF8E',
                      padding: '8px 12px',
                      fontSize: 12.5,
                    }}
                  >
                    <span style={{ color: '#58595B' }}>{nodePath(n)}</span>
                    <span style={{ fontWeight: 'bold' }}>{leafOf(n)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ padding: '14px 18px' }}>
              <div
                style={{ fontSize: 10.5, fontWeight: 'bold', color: '#58595B', letterSpacing: 0.5 }}
              >
                JUSTIFICATION NARRATIVE
              </div>
              <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 6 }}>
                {rec.justification || '—'}
              </div>
            </div>
          </div>

          {SHOW_SAP_PANEL && (
            <div style={{ background: '#1F1F1D', color: '#fff', border: '1px solid #1F1F1D' }}>
              <div
                style={{
                  padding: '12px 18px',
                  borderBottom: '1px solid #3A3A38',
                  fontSize: 13,
                  fontWeight: 'bold',
                  borderLeft: '4px solid #6AAF8E',
                }}
              >
                SAP Hand-off
              </div>
              <div style={{ padding: '16px 18px' }}>
                <p
                  style={{
                    margin: '0 0 14px',
                    fontSize: 12.5,
                    color: '#D1D3D4',
                    lineHeight: 1.55,
                    maxWidth: 620,
                  }}
                >
                  Approval of the PO/RFQ stays entirely in SAP. The requestor enters this Registry
                  ID on the transaction (under the Header Text field as shown in the image) as
                  evidence that the single-quotation case is pre-validated. Attach a PDF copy of the
                  record as an attachment in SAP.
                </p>

                {/* The screenshot carries the instruction better than prose: it shows exactly which
                    SAP field the ID goes in. Plain <img> rather than next/image — this is a fixed
                    static asset, not user content, and it needs no resizing pipeline. */}
                {/* eslint-disable-next-line @next/next/no-img-element -- a fixed
                    screenshot whose intrinsic size next/image would need declared
                    up front; it is served once and scales to the panel. */}
                <img
                  src="/sns-sap-header-text.png"
                  alt="SAP Texts tab with the Header text field selected, where the Registry ID is entered"
                  style={{
                    display: 'block',
                    width: '100%',
                    maxWidth: 620,
                    height: 'auto',
                    border: '1px solid #3A3A38',
                    background: '#fff',
                  }}
                />

                <div
                  style={{
                    marginTop: 14,
                    background: '#2A2A28',
                    border: '1px solid #3A3A38',
                    padding: '12px 14px',
                    maxWidth: 620,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      color: '#9A9C9E',
                      fontWeight: 'bold',
                      letterSpacing: 0.5,
                      marginBottom: 8,
                    }}
                  >
                    REGISTRY ID TO ENTER
                  </div>
                  <div
                    style={{
                      fontFamily: 'Consolas,Menlo,monospace',
                      fontSize: 15,
                      fontWeight: 'bold',
                      color: '#9BD5B4',
                      wordBreak: 'break-all',
                    }}
                  >
                    {rec.id || '(not yet issued)'}
                  </div>
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 11.5,
                      color: sapNoteColor,
                      fontWeight: 'bold',
                    }}
                  >
                    {sapNote}
                  </div>
                </div>

                {/* What the ID means, spelled out — it is read off a printout by people who will
                    not have the registry open, so the tokens have to be decodable on sight. */}
                <div
                  style={{
                    marginTop: 14,
                    borderTop: '1px solid #3A3A38',
                    paddingTop: 12,
                    maxWidth: 620,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      color: '#9A9C9E',
                      fontWeight: 'bold',
                      letterSpacing: 0.5,
                      marginBottom: 8,
                    }}
                  >
                    HOW THE REGISTRY ID IS BUILT
                  </div>
                  <div
                    style={{
                      fontFamily: 'Consolas,Menlo,monospace',
                      fontSize: 11.5,
                      color: '#D1D3D4',
                      marginBottom: 10,
                      wordBreak: 'break-all',
                    }}
                  >
                    SGL|SOL - COUNTRY - SAP ID - ISSUE YY - ISSUE MM - EXPIRY YY - EXPIRY MM
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr',
                      gap: '4px 12px',
                      fontSize: 11.5,
                      color: '#D1D3D4',
                      lineHeight: 1.5,
                    }}
                  >
                    <span style={{ color: '#9BD5B4', fontWeight: 'bold' }}>SGL</span>
                    <span>Single-source — alternatives exist, NESR has chosen one vendor</span>
                    <span style={{ color: '#9BD5B4', fontWeight: 'bold' }}>SOL</span>
                    <span>Sole-source — only one supplier can fulfil the requirement</span>
                    <span style={{ color: '#9BD5B4', fontWeight: 'bold' }}>COUNTRY</span>
                    <span>Three-letter country code, e.g. IRQ</span>
                    <span style={{ color: '#9BD5B4', fontWeight: 'bold' }}>SAP ID</span>
                    <span>The supplier&rsquo;s SAP code, exactly as SAP prints it</span>
                    <span style={{ color: '#9BD5B4', fontWeight: 'bold' }}>YY / MM</span>
                    <span>
                      Two-digit year and month — 26-09 is September 2026. The first pair is the
                      issue, the second the expiry.
                    </span>
                  </div>
                  <div style={{ marginTop: 10, fontSize: 11, color: '#8A8C8E', lineHeight: 1.5 }}>
                    The trailing two digits are a sequence, so the same supplier can hold more than
                    one record in a country for the same period. An ID never changes once issued —
                    after a renewal it still reads with the window it was issued under, and the
                    expiry date on this record is the current one.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid #E4E6E6',
                fontSize: 13,
                fontWeight: 'bold',
                borderLeft: '4px solid #2A7E4F',
              }}
            >
              Your Actions
            </div>
            <div
              style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}
            >
              <div style={{ fontSize: 11.5, color: '#58595B', lineHeight: 1.5 }}>{actionNote}</div>
              {actions.map((a) => (
                <button
                  key={a.label}
                  onClick={a.onClick}
                  className="btn-action"
                  style={{ background: a.bg, border: `1px solid ${a.border}`, color: a.fg }}
                >
                  {a.label}
                </button>
              ))}
              {rejectOpen && (
                <div style={{ border: '1px solid #E4A0A0', background: '#FCF4F4', padding: 12 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 'bold',
                      color: '#9B1C1C',
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    REJECTION REASON &#8212; LOGGED ON THE RECORD
                  </div>
                  <textarea
                    value={localRejectText}
                    onChange={(e) => setLocalRejectText(e.target.value)}
                    placeholder="State what is missing so the requestor can resubmit with stronger evidence."
                    style={{
                      width: '100%',
                      minHeight: 76,
                      border: '1px solid #D1D3D4',
                      padding: 8,
                      resize: 'vertical',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => {
                        app.reject(rec.rid, localRejectText);
                        setLocalRejectText('');
                      }}
                      style={{
                        background: '#9B1C1C',
                        border: 0,
                        color: '#fff',
                        fontWeight: 'bold',
                        fontSize: 12,
                        padding: '8px 14px',
                        borderRadius: 2,
                        cursor: 'pointer',
                      }}
                    >
                      Reject to Draft
                    </button>
                    <button
                      onClick={() => {
                        app.setRejectFor(null);
                        setLocalRejectText('');
                      }}
                      style={{
                        background: '#fff',
                        border: '1px solid #D1D3D4',
                        color: '#58595B',
                        fontWeight: 'bold',
                        fontSize: 12,
                        padding: '8px 14px',
                        borderRadius: 2,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <ReminderPanel rid={rec.rid} expiry={rec.expiry} issued={rec.issue} daysLeft={dLeft} />

          <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
            <div
              style={{
                padding: '12px 18px',
                borderBottom: '1px solid #E4E6E6',
                fontSize: 13,
                fontWeight: 'bold',
                borderLeft: '4px solid #2A7E4F',
              }}
            >
              Validation &amp; Review History
            </div>
            <div style={{ padding: '16px 18px 6px' }}>
              {history.map((h, i) => (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '16px 1fr',
                    gap: 12,
                    paddingBottom: 16,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <div
                      style={{
                        width: 11,
                        height: 11,
                        borderRadius: '50%',
                        background: i === 0 ? '#2A7E4F' : '#6AAF8E',
                        marginTop: 3,
                      }}
                    />
                    <div style={{ width: 1, flex: 1, background: '#E4E6E6' }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 'bold' }}>{h.step}</div>
                    <div style={{ fontSize: 11.5, color: '#58595B', marginTop: 2 }}>{h.actor}</div>
                    <div style={{ fontSize: 11.5, color: '#58595B' }}>{formatDate(h.date)}</div>
                    {h.note && (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: '#1F1F1D',
                          background: '#F7F9F8',
                          borderLeft: '3px solid #D1D3D4',
                          padding: '6px 9px',
                          marginTop: 6,
                          lineHeight: 1.5,
                        }}
                      >
                        {h.note}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #E4E6E6', padding: '16px 18px' }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 'bold',
                color: '#58595B',
                letterSpacing: 0.6,
                marginBottom: 8,
              }}
            >
              CLASSIFICATION GUIDANCE
            </div>
            <div style={{ fontSize: 12, color: '#1F1F1D', lineHeight: 1.55 }}>
              {rec.cls === 'SGL'
                ? 'Single-source is a business decision: alternatives exist, but NESR has chosen one vendor. The justification is a business rationale for restricting sourcing, not proof that no alternative exists.'
                : 'Sole-source is a market condition: only one supplier is capable of fulfilling the requirement in that country. The justification is evidence that no viable alternative exists.'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --- Expiry reminders ---------------------------------------------------- */

/**
 * The rungs of the reminder ladder, as the n8n workflow writes them.
 * `dbe` is days_before_expiry; negative values are days past expiry.
 */
const REMINDER_RUNGS: { label: string; dbe: number }[] = [
  { label: '60 days before', dbe: 60 },
  { label: '30 days before', dbe: 30 },
  { label: '14 days before', dbe: 14 },
  { label: '7 days before', dbe: 7 },
  { label: '5 days before', dbe: 5 },
  { label: '3 days before', dbe: 3 },
  { label: '2 days before', dbe: 2 },
  { label: '1 day before', dbe: 1 },
  { label: 'Day of expiry', dbe: 0 },
];

type BadgeState = 'sent' | 'queued' | 'missed' | 'na';

const BADGE_STYLE: Record<BadgeState, { bg: string; fg: string; label: string }> = {
  sent: { bg: '#C5E0D2', fg: '#1D5B39', label: 'sent' },
  queued: { bg: '#F1F2F2', fg: '#58595B', label: 'queued' },
  missed: { bg: '#FDE6C8', fg: '#8A4B00', label: 'missed' },
  na: { bg: '#F7F8F8', fg: '#A8AAAC', label: 'N/A' },
};

/**
 * Where one rung stands, following TI-TE's badge logic.
 *
 * `sent` is the only state read from the log; the rest are derived from the
 * calendar. A rung with no log row is `missed` if its date has passed, unless
 * the record did not exist yet on that date, which makes it `na` — otherwise
 * every record would open showing a column of failures it was never eligible
 * for.
 */
function rungBadge(
  dbe: number,
  daysLeft: number | null,
  log: SnsNotificationLogRow[],
  expiry: string | null,
  issued: string | null,
): BadgeState {
  if (log.some((r) => r.daysBeforeExpiry === dbe && r.status === 'sent')) return 'sent';
  if (daysLeft === null) return 'na';
  if (daysLeft > dbe) return 'queued';
  if (expiry && issued) {
    const [y, m, d] = expiry.split('-').map(Number);
    const rungDate = new Date(Date.UTC(y, m - 1, d) - dbe * 86400000).toISOString().slice(0, 10);
    if (issued.slice(0, 10) > rungDate) return 'na';
  }
  return 'missed';
}

/** The weekly chasers collapse into one row — there is no fixed number of them. */
function overdueBadge(daysLeft: number | null, log: SnsNotificationLogRow[]): BadgeState {
  if (log.some((r) => r.daysBeforeExpiry < 0 && r.status === 'sent')) return 'sent';
  if (daysLeft === null || daysLeft >= 0) return 'queued';
  return daysLeft <= -7 ? 'missed' : 'queued';
}

function ReminderPanel({
  rid,
  expiry,
  issued,
  daysLeft,
}: {
  rid: number;
  expiry: string | null;
  issued: string | null;
  daysLeft: number | null;
}) {
  const [log, setLog] = useState<SnsNotificationLogRow[] | null>(null);

  useEffect(() => {
    let live = true;
    // The setState lands in a promise callback rather than in the effect body.
    void getSnsRecordNotifications(rid).then((rows) => {
      if (live) setLog(rows);
    });
    return () => {
      live = false;
    };
  }, [rid]);

  const rows = log ?? [];
  const overdueCount = rows.filter((r) => r.daysBeforeExpiry < 0 && r.status === 'sent').length;

  return (
    <div style={{ background: '#fff', border: '1px solid #E4E6E6' }}>
      <div
        style={{
          padding: '12px 18px',
          borderBottom: '1px solid #E4E6E6',
          fontSize: 13,
          fontWeight: 'bold',
          borderLeft: '4px solid #2A7E4F',
        }}
      >
        Expiry Reminders
      </div>

      {log === null ? (
        <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: '#8A8C8E' }}>
          Loading…
        </div>
      ) : !expiry ? (
        <div style={{ padding: 20, fontSize: 12, color: '#58595B', lineHeight: 1.5 }}>
          Reminders start once the record is published and carries an expiry date.
        </div>
      ) : (
        <div style={{ padding: '8px 18px 14px' }}>
          {REMINDER_RUNGS.map((r) => {
            const state = rungBadge(r.dbe, daysLeft, rows, expiry, issued);
            const st = BADGE_STYLE[state];
            return (
              <div
                key={r.dbe}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '6px 0',
                  borderBottom: '1px solid #F4F5F5',
                }}
              >
                <span style={{ fontSize: 12, color: state === 'sent' ? '#1F1F1D' : '#58595B' }}>
                  {r.label}
                </span>
                <span
                  style={{
                    background: st.bg,
                    color: st.fg,
                    fontSize: 10.5,
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {st.label}
                </span>
              </div>
            );
          })}
          {(() => {
            const state = overdueBadge(daysLeft, rows);
            const st = BADGE_STYLE[state];
            return (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  padding: '6px 0',
                }}
              >
                <span style={{ fontSize: 12, color: state === 'sent' ? '#1F1F1D' : '#58595B' }}>
                  Past expiry (weekly){overdueCount > 0 ? ` · ${overdueCount} sent` : ''}
                </span>
                <span
                  style={{
                    background: st.bg,
                    color: st.fg,
                    fontSize: 10.5,
                    fontWeight: 'bold',
                    padding: '2px 8px',
                    borderRadius: 10,
                  }}
                >
                  {st.label}
                </span>
              </div>
            );
          })()}

          <div style={{ fontSize: 11, color: '#8A8C8E', marginTop: 10, lineHeight: 1.5 }}>
            Sent by the S&amp;S reminder workflow. Renewing the record restarts the ladder; closing
            the supplier account stops it.
          </div>
        </div>
      )}
    </div>
  );
}
