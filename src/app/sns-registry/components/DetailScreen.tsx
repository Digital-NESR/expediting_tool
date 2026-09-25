'use client';

import { STAGE1, STAGE2 } from '../lib/constants';
import { useEffect, useState } from 'react';
import {
  clsLabel,
  displayStatus,
  leafOf,
  money,
  nodePath,
  recordLabel,
  statusLabel,
  statusStyle,
} from '../lib/helpers';
import { daysFromToday, formatDate } from '../lib/date';
import { exportRecordPdf } from '../lib/exportRecordPdf';
import { getSnsRecordNotifications } from '@/app/actions/sns-documents';
import type { SnsNotificationLogRow } from '@/app/actions/sns-documents';
import type { RegistryApp } from '../lib/useRegistryApp';
import { CARD, CARD_HEAD, FIELD_LABEL } from '../lib/ui';
import RecordDocuments from './RecordDocuments';

const SHOW_SAP_PANEL = true;

const BTN_PRIMARY =
  'w-full rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3 py-2.5 text-[12.5px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90';
const BTN_DANGER =
  'w-full rounded-lg border border-red-200 bg-white px-3 py-2.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-50';

export default function DetailScreen({ app }: { app: RegistryApp }) {
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const rec = app.records.find((r) => r.rid === app.selectedId);
  const [localRejectText, setLocalRejectText] = useState('');
  const [approveOpen, setApproveOpen] = useState(false);
  const [approveText, setApproveText] = useState('');

  if (!rec) {
    return (
      <div>
        <button
          type="button"
          onClick={() => app.go('registry')}
          className="text-[12.5px] font-semibold text-[#307c4c] underline underline-offset-2 hover:no-underline"
        >
          ← Back to registry
        </button>
        <div className="py-12 text-center text-[13px] text-slate-500">Record not found.</div>
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
  /* l1/l2 come from the approver lists, req from the granted role. A country
     manager who is also a category manager holds both. */
  const can = (k: 'req' | 'l1' | 'l2') =>
    inScope &&
    (isAdmin ||
      (k === 'req' ? kind === 'req' : k === 'l1' ? app.viewer.isLevel1 : app.viewer.isLevel2));

  const actions: { label: string; className: string; onClick: () => void }[] = [];
  const canReq = can('req');
  if ((rec.base === 'Draft' || rec.base === 'Rejected') && canReq) {
    actions.push({
      label:
        rec.base === 'Rejected'
          ? `Resubmit for ${STAGE1} validation`
          : `Submit for ${STAGE1} validation`,
      className: BTN_PRIMARY,
      onClick: () => app.advance(rec.rid),
    });
  }
  if (rec.base === 'Pending Level 1' && can('l1')) {
    actions.push({
      label: `Validate — route to ${STAGE2}`,
      className: BTN_PRIMARY,
      // Opens the comment box rather than approving outright: a validator's
      // decision has to carry a reason, the same way a rejection does.
      onClick: () => setApproveOpen(true),
    });
    actions.push({
      label: 'Reject to Draft with a reason',
      className: BTN_DANGER,
      onClick: () => app.setRejectFor(rec.rid),
    });
  }
  if (rec.base === 'Pending Level 2' && can('l2')) {
    actions.push({
      label: published
        ? 'Confirm review — extend expiry 12 months'
        : 'Sign off — publish Registry ID',
      className: BTN_PRIMARY,
      onClick: () => setApproveOpen(true),
    });
    actions.push({
      label: 'Reject to Draft with a reason',
      className: BTN_DANGER,
      onClick: () => app.setRejectFor(rec.rid),
    });
  }
  /* A renewal is offered on any published record, not only an expiring one —
     a justification can change long before the ID is close to running out.
     It opens the wizard on a copy; nothing happens to this record until the
     replacement is signed off. */
  if (canReq && (rec.base === 'Active' || rec.base === 'Extended' || rec.base === 'Expired')) {
    actions.push({
      label:
        status === 'Expiring soon' || status === 'Expired'
          ? 'Start periodic review — update this record'
          : 'Update this record',
      className: BTN_PRIMARY,
      onClick: () => app.startRenewal(rec.rid),
    });
  }

  let actionNote = `This record is at ${statusLabel(status)}.`;
  if (!actions.length) {
    actionNote = inScope
      ? `No action is available to you on this record at ${statusLabel(status)}. It is routed to a different role.`
      : `This is a ${rec.country} record and your access does not cover that country.`;
  }

  let sapNote = 'Valid reference. The PO approver can trust the exception is pre-validated.';
  let sapNoteClass = 'text-[#9BD5B4]';
  if (!published) {
    sapNote = 'No ID yet. Do not raise the single-quotation PO until the record is Active.';
    sapNoteClass = 'text-red-300';
  } else if (status === 'Expired') {
    sapNote =
      'Expired. Any SAP reference to this ID should be treated as non-compliant until extended.';
    sapNoteClass = 'text-red-300';
  } else if (status === 'Expiring soon') {
    sapNote = `Valid, but expires in ${dLeft} days. Begin periodic review now.`;
    sapNoteClass = 'text-amber-300';
  }

  const fields = [
    { label: 'Classification', value: clsLabel(rec.cls) },
    { label: 'Country / entity', value: rec.country },
    { label: 'Supplier SAP ID', value: rec.supplierId },
    { label: 'Supplier SAP name', value: rec.supplierName },
    { label: 'Reason code', value: rec.reason },
    { label: 'Segment tags', value: rec.segments.join(', ') || '—' },
    { label: 'Requestor', value: rec.requestor },
    { label: 'Estimated annual spend', value: money(rec.spend) },
    {
      label: 'Validator — first stage',
      // The role alone did not tell the requestor who to chase. Nobody
      // assigned is said plainly rather than left to read as a name.
      value: rec.level1Name
        ? `${rec.level1Name} — ${STAGE1}, ${rec.country}`
        : `${STAGE1}, ${rec.country} — nobody assigned yet`,
    },
    {
      label: 'Validator — final sign-off',
      value: rec.level2Names.length
        ? `${rec.level2Names.join(', ')} — ${STAGE2}`
        : `${STAGE2} — nobody assigned yet`,
    },
    { label: 'Issue date', value: rec.issue ? formatDate(rec.issue) : 'Not issued' },
    { label: 'Expiry date', value: rec.expiry ? formatDate(rec.expiry) : 'Not issued' },
  ];

  const history = [...rec.history].reverse();
  const rejectOpen = app.rejectFor === rec.rid;
  const copyLabel = app.copied ? 'Copied' : 'Copy ID';

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => app.go('registry')}
        className="text-[12.5px] font-semibold text-[#307c4c] underline underline-offset-2 hover:no-underline"
      >
        ← Back to registry
      </button>

      <div className={CARD}>
        <div className="h-1 bg-[#307c4c]" />
        <div className="flex flex-wrap items-start justify-between gap-5 px-5 py-5">
          <div className="min-w-0">
            <p className={FIELD_LABEL}>Registry ID</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-3">
              <span className="break-all font-mono text-2xl font-bold tracking-wide text-[#1d4f31] sm:text-[30px]">
                {recordLabel(rec)}
              </span>
              {/* Only once there is an ID. The heading reads "Draft #20" before
                  then, which looks copyable but is a local handle, not
                  something to put on a PO — and onCopyId would no-op anyway. */}
              {published && (
                <button
                  type="button"
                  onClick={() => app.onCopyId(rec.id)}
                  className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
                >
                  {copyLabel}
                </button>
              )}
            </div>
            <p className="mt-1.5 max-w-xl text-[12px] text-slate-500">
              {published
                ? 'Immutable once issued. Format {TYPE}-{COUNTRY}-{SAP ID}-{ISSUE YYMM}{EXPIRY YYMM}{SEQUENCE}.'
                : 'The Registry ID is generated only when the record is published to Active.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-6">
            <div>
              <p className={FIELD_LABEL}>Status</p>
              <span
                className="mt-2 inline-block rounded-full px-3 py-1 text-[12.5px] font-bold"
                style={{ background: ss[0], color: ss[1] }}
              >
                {statusLabel(status)}
              </span>
            </div>
            <div className="max-w-[260px]">
              <p className={FIELD_LABEL}>Validity</p>
              <p className="mt-2 text-[13px] font-bold text-slate-800">
                {rec.issue
                  ? `${formatDate(rec.issue)} → ${formatDate(rec.expiry)}`
                  : rec.expiry
                    ? `Expires ${formatDate(rec.expiry)} — issued on final sign-off`
                    : 'Set on the record before sign-off'}
              </p>

              <button
                type="button"
                onClick={() => {
                  setPdfError(null);
                  setPdfBusy(true);
                  void exportRecordPdf(rec)
                    .catch(() => setPdfError('Could not build the PDF.'))
                    .finally(() => setPdfBusy(false));
                }}
                disabled={pdfBusy}
                className="mt-2.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pdfBusy ? 'Building PDF…' : 'Export record as PDF'}
              </button>
              <p className="mt-1.5 text-[11px] text-slate-400">
                Attach this to the SAP transaction alongside the Registry ID.
              </p>
              {pdfError && <p className="mt-1 text-[11.5px] text-red-600">{pdfError}</p>}
            </div>
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <div className={CARD}>
            <div className={CARD_HEAD}>Registry record</div>
            <div className="grid sm:grid-cols-2">
              {fields.map((f) => (
                <div key={f.label} className="border-b border-r border-slate-100 px-4 py-3">
                  <p className={FIELD_LABEL}>{f.label}</p>
                  <p className="mt-0.5 break-words text-[13px] text-slate-800">{f.value}</p>
                </div>
              ))}
            </div>

            <div className="border-b border-slate-100 px-4 py-3.5">
              <p className={FIELD_LABEL}>Taxonomy scope</p>
              <p className="mb-2 mt-1.5 text-[12px] text-slate-500">
                Scoped at {rec.level} level. Category and Sub-Category are shown for reference only.
              </p>
              <div className="space-y-1.5">
                {rec.nodes.map((n, i) => (
                  <div
                    key={i}
                    className="rounded-r border-l-[3px] border-[#6AAF8E] bg-slate-50 px-3 py-2 text-[12.5px]"
                  >
                    <span className="text-slate-500">{nodePath(n)}</span>
                    <span className="font-bold text-slate-800">{leafOf(n)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-3.5">
              <p className={FIELD_LABEL}>Justification narrative</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-800">
                {rec.justification || '—'}
              </p>
            </div>
          </div>

          <RecordDocuments app={app} rec={rec} />

          {SHOW_SAP_PANEL && (
            <div className="overflow-hidden rounded-xl bg-slate-900 text-white shadow-sm">
              <div className="border-b border-white/10 px-4 py-3 text-[13px] font-bold">
                SAP Hand-off
              </div>
              <div className="px-4 py-4">
                <p className="mb-3.5 max-w-[620px] text-[12.5px] leading-relaxed text-slate-300">
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
                  className="block h-auto w-full max-w-[620px] rounded border border-white/10 bg-white"
                />

                <div className="mt-3.5 max-w-[620px] rounded-lg border border-white/10 bg-white/5 px-3.5 py-3">
                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                    Registry ID to enter
                  </p>
                  <p className="break-all font-mono text-[15px] font-bold text-[#9BD5B4]">
                    {rec.id || '(not yet issued)'}
                  </p>
                  <p className={`mt-2.5 text-[11.5px] font-bold ${sapNoteClass}`}>{sapNote}</p>
                </div>

                {/* What the ID means, spelled out — it is read off a printout by people who will
                    not have the registry open, so the tokens have to be decodable on sight. */}
                <div className="mt-3.5 max-w-[620px] border-t border-white/10 pt-3">
                  <p className="mb-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
                    How the Registry ID is built
                  </p>
                  <p className="mb-2.5 break-all font-mono text-[11.5px] text-slate-300">
                    SGL|SOL - COUNTRY - SAP ID - IIYY MM EEYY MM NN
                  </p>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11.5px] leading-relaxed text-slate-300">
                    <span className="font-bold text-[#9BD5B4]">SGL</span>
                    <span>Single-source — alternatives exist, NESR has chosen one vendor</span>
                    <span className="font-bold text-[#9BD5B4]">SOL</span>
                    <span>Sole-source — only one supplier can fulfil the requirement</span>
                    <span className="font-bold text-[#9BD5B4]">COUNTRY</span>
                    <span>Three-letter country code, e.g. IRQ</span>
                    <span className="font-bold text-[#9BD5B4]">SAP ID</span>
                    <span>The supplier&rsquo;s SAP code, exactly as SAP prints it</span>
                    <span className="font-bold text-[#9BD5B4]">YYMM YYMM</span>
                    <span>
                      Issue and expiry, run together as one figure — 2609 2709 is September 2026 to
                      September 2027. The two digits after it are the sequence.
                    </span>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
                    The trailing two digits are a sequence, so the same supplier can hold more than
                    one record in a country for the same period. An ID never changes once issued —
                    after a renewal it still reads with the window it was issued under, and the
                    expiry date on this record is the current one.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className={CARD}>
            <div className={CARD_HEAD}>Your actions</div>
            <div className="space-y-2.5 px-4 py-4">
              <p className="text-[11.5px] leading-relaxed text-slate-500">{actionNote}</p>
              {actions.map((a) => (
                <button key={a.label} type="button" onClick={a.onClick} className={a.className}>
                  {a.label}
                </button>
              ))}
              {approveOpen && (
                <div className="rounded-lg border border-[#6AAF8E] bg-[#307c4c]/5 p-3">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#1d4f31]">
                    Your decision — recorded on the record
                  </p>
                  <textarea
                    value={approveText}
                    onChange={(e) => setApproveText(e.target.value)}
                    placeholder="What did you check, and why does this case hold? This is the audit trail for the exception."
                    className="min-h-[76px] w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-[12.5px] outline-none transition-colors focus:border-[#307c4c]"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={app.busy || !approveText.trim()}
                      onClick={() => {
                        app.advance(rec.rid, approveText);
                        setApproveOpen(false);
                        setApproveText('');
                      }}
                      className="rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3.5 py-2 text-[12px] font-bold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {app.busy ? 'Working…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setApproveOpen(false);
                        setApproveText('');
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-bold text-slate-500 transition-colors hover:text-slate-800"
                    >
                      Cancel
                    </button>
                    {!approveText.trim() && (
                      <span className="text-[11px] text-slate-500">A comment is required.</span>
                    )}
                  </div>
                </div>
              )}

              {rejectOpen && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-red-700">
                    Rejection reason — logged on the record
                  </p>
                  <textarea
                    value={localRejectText}
                    onChange={(e) => setLocalRejectText(e.target.value)}
                    placeholder="State what is missing so the requestor can resubmit with stronger evidence."
                    className="min-h-[76px] w-full resize-y rounded-lg border border-slate-200 bg-white p-2 text-[12.5px] outline-none transition-colors focus:border-[#307c4c]"
                  />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        app.reject(rec.rid, localRejectText);
                        setLocalRejectText('');
                      }}
                      className="rounded-lg bg-red-700 px-3.5 py-2 text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                    >
                      Reject to Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        app.setRejectFor(null);
                        setLocalRejectText('');
                      }}
                      className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[12px] font-bold text-slate-500 transition-colors hover:text-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <ReminderPanel rid={rec.rid} expiry={rec.expiry} issued={rec.issue} daysLeft={dLeft} />

          <div className={CARD}>
            <div className={CARD_HEAD}>Validation &amp; review history</div>
            <div className="px-4 pb-1.5 pt-4">
              {history.map((h, i) => (
                <div key={i} className="grid grid-cols-[16px_1fr] gap-3 pb-4">
                  <div className="flex flex-col items-center gap-1">
                    <span
                      className={`mt-0.5 h-2.5 w-2.5 rounded-full ${
                        i === 0 ? 'bg-[#307c4c]' : 'bg-[#6AAF8E]'
                      }`}
                    />
                    <span className="w-px flex-1 bg-slate-200" />
                  </div>
                  <div>
                    <p className="text-[12.5px] font-bold text-slate-800">{h.step}</p>
                    <p className="text-[11.5px] text-slate-500">{h.actor}</p>
                    <p className="text-[11.5px] text-slate-500">{formatDate(h.date)}</p>
                    {h.note && (
                      <p className="mt-1.5 rounded-r border-l-[3px] border-slate-300 bg-slate-50 px-2.5 py-1.5 text-[11.5px] leading-relaxed text-slate-800">
                        {h.note}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`${CARD} px-4 py-4`}>
            <p className={`${FIELD_LABEL} mb-2`}>Classification guidance</p>
            <p className="text-[12px] leading-relaxed text-slate-700">
              {rec.cls === 'SGL'
                ? 'Single-source is a business decision: alternatives exist, but NESR has chosen one vendor. The justification is a business rationale for restricting sourcing, not proof that no alternative exists.'
                : 'Sole-source is a market condition: only one supplier is capable of fulfilling the requirement in that country. The justification is evidence that no viable alternative exists.'}
            </p>
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

const BADGE_STYLE: Record<BadgeState, { className: string; label: string }> = {
  sent: { className: 'bg-[#307c4c]/15 text-[#1d4f31]', label: 'sent' },
  queued: { className: 'bg-slate-100 text-slate-500', label: 'queued' },
  missed: { className: 'bg-amber-100 text-amber-800', label: 'missed' },
  na: { className: 'bg-slate-50 text-slate-400', label: 'N/A' },
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

function ReminderRow({ label, state }: { label: string; state: BadgeState }) {
  const st = BADGE_STYLE[state];
  return (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
      <span className={`text-[12px] ${state === 'sent' ? 'text-slate-800' : 'text-slate-500'}`}>
        {label}
      </span>
      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-bold ${st.className}`}>
        {st.label}
      </span>
    </div>
  );
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
    <div className={CARD}>
      <div className={CARD_HEAD}>Expiry reminders</div>

      {log === null ? (
        <div className="py-6 text-center text-[12px] text-slate-400">Loading…</div>
      ) : !expiry ? (
        <div className="px-4 py-5 text-[12px] leading-relaxed text-slate-500">
          Reminders start once the record is published and carries an expiry date.
        </div>
      ) : (
        <div className="px-4 pb-3.5 pt-2">
          {REMINDER_RUNGS.map((r) => (
            <ReminderRow
              key={r.dbe}
              label={r.label}
              state={rungBadge(r.dbe, daysLeft, rows, expiry, issued)}
            />
          ))}
          <ReminderRow
            label={`Past expiry (weekly)${overdueCount > 0 ? ` · ${overdueCount} sent` : ''}`}
            state={overdueBadge(daysLeft, rows)}
          />

          <p className="mt-2.5 text-[11px] leading-relaxed text-slate-400">
            Sent by the S&amp;S reminder workflow. Renewing the record restarts the ladder; closing
            the supplier account stops it.
          </p>
        </div>
      )}
    </div>
  );
}
