'use client';

import { Fragment, useEffect, useState } from 'react';
import SubmissionLines from '../SubmissionLines';
import type { ScreenProps, VendorEnrichedVM } from '../../types';
import TableToolbar from '../TableToolbar';
import SendProgressBar from '../SendProgress';
import { useConfirm } from '../useConfirm';
import {
  FILTER_TAB_SELECTED,
  VENDOR_AWAITING_VERIFICATION_BADGE,
  VENDOR_SEND_FAILED_BADGE,
  VENDOR_STATUS_BADGE,
} from '../tones';

const COLUMNS = 'grid-cols-[1fr_100px_90px_72px_82px_80px_80px_80px_150px]';

/**
 * The expanded row for one vendor.
 *
 * It now shows the addresses the request actually goes to, and lets a champion correct them: the
 * AVL carries a usable address for barely a third of suppliers, and a vendor with none is one
 * that can never be chased, which shows up later as coverage that will not move.
 */
function VendorDetail({
  v,
  busy,
  canEdit,
  onRemoveSubmission,
}: {
  v: VendorEnrichedVM;
  busy: boolean;
  canEdit: boolean;
  onRemoveSubmission: ScreenProps['vm']['onRemoveSubmission'];
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v.contactLabel);

  return (
    <div className="bg-[#F5FAF7] border-b border-b-sns-line px-3.5 py-3">
      <div className="flex gap-2.5 items-center flex-wrap">
        <div className="flex-1 min-w-[260px] text-[11px] text-sns-grey">
          {v.resolutionNote ? (
            /* The champion's own words on why this vendor was closed. Shown to whoever opens the
               row, not only to whoever downloads the evidence pack. */
            <span>Closed: {v.resolutionNote}</span>
          ) : v.sendFailed ? (
            /* The sentence the mailer gave, in full. The badge has room for two words. */
            <span className="text-[#B71C1C] font-bold">{v.sendFailedReason}</span>
          ) : v.isReceived && v.repliedByEmail ? (
            /* "0 invoices on file" beside a vendor who plainly answered reads as a parsing
               failure. Nothing was parsed because nothing was meant to be. */
            <span className="text-sns-green font-bold">
              ✓ Reply filed as correspondence. No invoice lines were read; the consolidated workbook
              refers AP to the attachment.
            </span>
          ) : v.isReceived ? (
            <span className="text-sns-green font-bold">
              ✓ SOA received · {v.invCount} invoices on file · Currency: {v.currency}
            </span>
          ) : v.isUnreachable ? (
            <span className="text-[#B71C1C] font-bold">
              No contact address on file. This vendor cannot be sent a request.
            </span>
          ) : (
            <span>Sends to: {v.contactLabel}</span>
          )}
        </div>
        {canEdit && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(v.contactLabel);
              setEditing(true);
            }}
            className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold"
          >
            Edit contacts
          </button>
        )}
        {v.canAccept && (
          <button
            type="button"
            onClick={v.onAccept}
            disabled={busy}
            className="bg-sns-green text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            Accept SOA Upload
          </button>
        )}
        {v.canResolve && (
          /* One button used to say "Mark Non-Responder" whatever the truth was. It opens the
             choice instead, because a supplier with nothing outstanding and a supplier who never
             answered are different findings and only one of them counts. */
          <button
            type="button"
            onClick={v.onResolve}
            disabled={busy}
            className="bg-[#B71C1C] text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            Close without a statement
          </button>
        )}
      </div>
      {v.submissions.length > 0 && (
        /* The statement itself, which is the evidence the whole cycle exists to collect. It is
           served from an authenticated route rather than linked from storage, because a statement
           lists a vendor's invoice numbers and balances. */
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-sns-grey">
            {v.submissions.length === 1 ? 'Statement on file:' : 'Statements on file:'}
          </span>
          {/* A vendor who re-sent a corrected file has both on record. Only the newest is counted,
              and the older one says so rather than sitting there looking equally current. */}
          {v.submissions.map((file) => (
            <span
              key={file.id}
              className={`inline-flex items-center gap-1.5 rounded-md border bg-white px-2.5 py-[5px] text-[11px] font-bold ${
                file.superseded ? 'border-sns-line' : 'border-sns-line hover:border-sns-green'
              }`}
            >
              <a
                href={`/api/soa/submissions/${file.id}`}
                download={file.fileName}
                className={
                  file.superseded ? 'text-sns-grey line-through decoration-1' : 'text-sns-green'
                }
              >
                {file.fileName}
              </a>
              {file.superseded ? (
                <span className="font-bold text-[10px] text-sns-grey">replaced</span>
              ) : (
                /* Only the current file can be taken off. A replaced one is already out of the
                   arithmetic, and removing it would be deleting the record of what was first
                   claimed, which is the opposite of what this evidence is for. */
                v.canAccept && (
                  <button
                    type="button"
                    title={`Remove ${file.fileName}`}
                    aria-label={`Remove ${file.fileName} from ${v.name}`}
                    onClick={() => onRemoveSubmission(v.id, file.kind, file.fileName)}
                    className="text-[13px] leading-none text-sns-grey hover:text-[#B71C1C]"
                  >
                    ×
                  </button>
                )
              )}
            </span>
          ))}
        </div>
      )}
      {/* The rows the coverage figure is actually computed from. The file above is the evidence;
          these are what it was read to mean, and a champion should be able to see both. */}
      {v.submissions.length > 0 && <SubmissionLines entryId={v.id} vendorName={v.name} />}
      {editing && (
        <div className="flex gap-2 items-center mt-2.5">
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="accounts@vendor.com, ar@vendor.com"
            aria-label={`Contact addresses for ${v.name}`}
            className="flex-1 rounded-md border border-sns-line bg-white px-2.5 py-[6px] text-[11px] text-sns-ink placeholder:text-sns-grey focus:border-sns-green focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              v.onSaveContacts(
                draft
                  .split(',')
                  .map((e) => e.trim())
                  .filter(Boolean),
              );
              setEditing(false);
            }}
            disabled={busy}
            className="bg-sns-green text-white border-none px-3 py-[6px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="bg-[#F5F5F5] text-sns-grey border-none px-3 py-[6px] rounded-md text-[11px] font-bold"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export default function ResponseTrackingScreen({ vm }: ScreenProps) {
  /* The screen reads the delivery log itself the first time it opens, the way Vendor Scoping reads
     its candidates. It used to sit behind a "Show failed dispatches" button on a screen that has
     since gone, which meant the one fact explaining a stalled coverage figure was only ever seen
     by somebody who already suspected it. */
  const { ask, dialog } = useConfirm();
  const { deliveryNeedsLoad, onLoadFailures } = vm;
  useEffect(() => {
    if (deliveryNeedsLoad) onLoadFailures();
  }, [deliveryNeedsLoad, onLoadFailures]);

  /* The three bulk sends. Each one puts mail in suppliers' inboxes and none of them can be
     recalled, so each says how many before it happens. Chasing a single vendor from its own row
     does not ask: it is one letter, and the row it sits on names the supplier it goes to. */
  async function confirmBulk(
    title: string,
    confirmLabel: string,
    body: React.ReactNode,
    run: () => void,
  ) {
    if (await ask({ title, confirmLabel, tone: 'normal', body })) run();
  }

  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      {dialog}
      <div className="flex items-start justify-between mb-3.5">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Response Tracking</h1>
          <p className="text-[12px] text-sns-grey">Live vendor response status, {vm.contextLine}</p>
        </div>
        <div className="flex gap-2 shrink-0 flex-wrap justify-end">
          {vm.sendProgress ? (
            <SendProgressBar progress={vm.sendProgress} pct={vm.sendProgressPct} />
          ) : (
            <>
              {/* Retry first, because it is the exception: these suppliers were never written to at
              all, and they are invisible in the counts beside them. */}
              {vm.hasRetryable && (
                <button
                  type="button"
                  onClick={() =>
                    confirmBulk(
                      'Try the refused sends again?',
                      `Retry ${vm.retryFailedCount}`,
                      <>
                        <strong>
                          {vm.retryFailedCount} {vm.retryFailedCount === 1 ? 'vendor' : 'vendors'}
                        </strong>{' '}
                        still owed the letter that was refused will be written to. Vendors whose
                        send already went through are left alone.
                      </>,
                      vm.onRetryFailed,
                    )
                  }
                  disabled={vm.busy}
                  className="bg-[#B71C1C] text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
                >
                  Retry {vm.retryFailedCount} Failed {vm.retryFailedCount === 1 ? 'Send' : 'Sends'}
                </button>
              )}
              {vm.hasUnrequested && (
                <button
                  type="button"
                  onClick={() =>
                    confirmBulk(
                      'Send the statement request?',
                      `Send to ${vm.unrequestedCount}`,
                      <>
                        <strong>
                          {vm.unrequestedCount} {vm.unrequestedCount === 1 ? 'vendor' : 'vendors'}
                        </strong>{' '}
                        who have not been written to will be emailed the request, each with the
                        blank template and their own upload link. This cannot be undone.
                      </>,
                      vm.onSendRequests,
                    )
                  }
                  disabled={vm.busy}
                  className="bg-sns-green text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
                >
                  Send {vm.unrequestedCount} Initial Requests
                </button>
              )}
              {vm.hasRemindable && (
                <button
                  type="button"
                  onClick={() =>
                    confirmBulk(
                      'Send a reminder to everyone still owing?',
                      `Remind ${vm.remindCount}`,
                      <>
                        <strong>
                          {vm.remindCount} {vm.remindCount === '1' ? 'vendor' : 'vendors'}
                        </strong>{' '}
                        who have not sent a statement will be chased again, including any already
                        reminded once. This cannot be undone.
                      </>,
                      vm.onSendReminders,
                    )
                  }
                  disabled={vm.busy}
                  className="bg-[#E65100] text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
                >
                  Send All Reminders ({vm.remindCount})
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* The deadline passing does not change a status. It changes what silence means: up to this
          date a vendor was still being waited on, and after it each one needs a champion to say
          which kind of silence it is. Said once, at the top, rather than repeated per row. */}
      {vm.pastCollectionDeadline && vm.awaitingVerificationCount > 0 && (
        <div className="bg-white rounded-[10px] px-3.5 py-3 mb-3 shadow-[0_1px_3px_rgba(0,0,0,0.07)] border-l-[3px] border-l-[#E65100]">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey">
            Past the collection deadline
          </div>
          <div className="text-[12px] text-sns-ink mt-0.5">
            <span className="font-bold text-[#8A4B00]">
              {vm.awaitingVerificationCount}{' '}
              {vm.awaitingVerificationCount === 1 ? 'vendor is' : 'vendors are'} still silent and
              await your verification.
            </span>{' '}
            Open a row and close it either as having no pending invoices, which counts towards
            coverage, or as a non-responder, which does not.
          </div>
        </div>
      )}

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {vm.filterTabs.map((tab) => (
          <button
            type="button"
            key={tab.status}
            onClick={tab.onClick}
            className={`px-3 py-1.5 rounded-[20px] cursor-pointer text-[11px] font-bold border-2 whitespace-nowrap ${
              tab.isSelected
                ? FILTER_TAB_SELECTED[tab.status]
                : 'border-transparent bg-[#F0F0F0] text-sns-grey'
            }`}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
      </div>

      <TableToolbar table={vm.trackingTable} placeholder="Filter by vendor name or number" />

      <div className="bg-white rounded-[10px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        <div
          className={`grid ${COLUMNS} gap-2 px-3.5 py-2.5 bg-sns-green text-white text-[10px] font-bold uppercase tracking-[0.5px] items-center`}
        >
          <div>Vendor</div>
          <div>Status</div>
          <div>PO Amount</div>
          <div>Share %</div>
          <div>Cumulative %</div>
          <div>Requested</div>
          <div>Reminded</div>
          <div>Responded</div>
          <div />
        </div>
        {vm.trackingTable.isEmpty && (
          <div className="px-3.5 py-6 text-center text-[12px] text-sns-grey">
            {vm.trackingTable.rangeLabel}
          </div>
        )}
        {vm.vendorsEnriched.map((v) => (
          <Fragment key={v.id}>
            <div
              onClick={v.onToggle}
              className={`grid ${COLUMNS} gap-2 px-3.5 py-2.5 text-[12px] border-b border-b-[#F0F0F0] cursor-pointer items-center ${
                v.isExpanded ? 'bg-[#F0F9F4]' : 'bg-white'
              }`}
            >
              <div>
                <div className="font-bold text-[13px]">{v.name}</div>
                <div className="text-[10px] text-sns-grey font-[family-name:monospace] mt-px">
                  {v.no}
                  {v.isUnreachable && <span className="text-[#B71C1C]"> · no email</span>}
                </div>
              </div>
              {/* A refused send is shown here rather than in a panel above the table, which
                  listed the same vendors a second time to say something about one of them. The
                  database is right that nothing changed about this vendor, and "Not Requested"
                  beside a country whose requests all went out reads as an oversight rather than
                  as a failure, so the row says which it is. */}
              <div
                title={v.sendFailed ? v.sendFailedReason : undefined}
                className={`${
                  v.sendFailed
                    ? VENDOR_SEND_FAILED_BADGE
                    : v.awaitingVerification
                      ? VENDOR_AWAITING_VERIFICATION_BADGE
                      : VENDOR_STATUS_BADGE[v.status]
                } rounded-xl px-[9px] py-0.5 text-[10px] font-bold inline-block`}
              >
                {v.sendFailed
                  ? 'Send failed'
                  : v.awaitingVerification
                    ? 'Awaiting verification'
                    : v.statusLabel}
              </div>
              <div className="font-bold">{v.fmtOpenPO}</div>
              {/* How much of the country this supplier is, and how much is covered by them and
                  everyone larger. The same two figures the scoping screen decided on, carried
                  forward so the chase can be prioritised by weight rather than by row order. */}
              <div className="text-sns-grey">{v.sharePctLabel}</div>
              <div className="font-bold text-sns-ink">{v.cumPctLabel}</div>
              <div className="text-[11px] text-sns-grey">{v.reqDate}</div>
              <div className="text-[11px] text-sns-grey">{v.remDate ?? ', '}</div>
              <div className="text-[11px] text-sns-grey">{v.respDate ?? ', '}</div>
              {/* Chasing one supplier is the commonest thing done on this screen, and it used to
                  need the row opened first. The press must not also toggle the row it sits in. */}
              <div className="flex items-center justify-end gap-2">
                {v.canChase && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      v.onChase();
                    }}
                    disabled={vm.busy}
                    title={`${v.chaseLabel} to ${v.name}`}
                    className="rounded-md border border-sns-line bg-white px-2 py-[5px] text-[10px] font-bold text-sns-green whitespace-nowrap hover:border-sns-green disabled:opacity-50"
                  >
                    {v.chaseLabel}
                  </button>
                )}
                <span className="text-[11px] text-sns-grey">{v.isExpanded ? '▲' : '▼'}</span>
              </div>
            </div>
            {v.isExpanded && (
              <VendorDetail
                v={v}
                busy={vm.busy}
                canEdit={vm.canAct}
                onRemoveSubmission={vm.onRemoveSubmission}
              />
            )}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
