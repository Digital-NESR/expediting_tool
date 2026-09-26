'use client';

import { Fragment, useState } from 'react';
import type { ScreenProps, VendorEnrichedVM } from '../../types';
import TableToolbar from '../TableToolbar';
import { FILTER_TAB_SELECTED, VENDOR_STATUS_BADGE } from '../tones';

const COLUMNS = 'grid-cols-[1fr_100px_90px_80px_80px_80px_60px]';

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
}: {
  v: VendorEnrichedVM;
  busy: boolean;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v.contactLabel);

  return (
    <div className="bg-[#F5FAF7] border-b border-b-sns-line px-3.5 py-3">
      <div className="flex gap-2.5 items-center flex-wrap">
        <div className="flex-1 min-w-[260px] text-[11px] text-sns-grey">
          {v.isReceived ? (
            <span className="text-sns-green font-bold">
              ✓ SOA received · {v.invCount} invoices on file · Currency: {v.currency}
            </span>
          ) : v.isUnreachable ? (
            <span className="text-[#B71C1C] font-bold">
              No contact address on file — this vendor cannot be sent a request.
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
        {v.canRemind && (
          <button
            type="button"
            onClick={v.onRemind}
            disabled={busy}
            className="bg-[#1565C0] text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            Send Reminder
          </button>
        )}
        {v.canNR && (
          <button
            type="button"
            onClick={v.onNR}
            disabled={busy}
            className="bg-[#B71C1C] text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            Mark Non-Responder
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
          {v.submissions.map((file) => (
            <a
              key={file.id}
              href={`/api/soa/submissions/${file.id}`}
              download={file.fileName}
              className="inline-flex items-center gap-1.5 rounded-md border border-sns-line bg-white px-2.5 py-[5px] text-[11px] font-bold text-sns-green hover:border-sns-green"
            >
              {file.fileName}
            </a>
          ))}
        </div>
      )}
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
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-3.5">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Response Tracking</h1>
          <p className="text-[12px] text-sns-grey">
            Live vendor response status — {vm.contextLine}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {vm.hasUnrequested && (
            <button
              type="button"
              onClick={() => vm.onSendRequests()}
              disabled={vm.busy}
              className="bg-sns-green text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
            >
              Send {vm.unrequestedCount} Initial Requests
            </button>
          )}
          {vm.hasRemindable && (
            <button
              type="button"
              onClick={() => vm.onSendReminders()}
              disabled={vm.busy}
              className="bg-[#E65100] text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
            >
              Send All Reminders ({vm.remindCount})
            </button>
          )}
        </div>
      </div>

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
              <div
                className={`${VENDOR_STATUS_BADGE[v.status]} rounded-xl px-[9px] py-0.5 text-[10px] font-bold inline-block`}
              >
                {v.statusLabel}
              </div>
              <div className="font-bold">{v.fmtOpenPO}</div>
              <div className="text-[11px] text-sns-grey">{v.reqDate}</div>
              <div className="text-[11px] text-sns-grey">{v.remDate ?? '—'}</div>
              <div className="text-[11px] text-sns-grey">{v.respDate ?? '—'}</div>
              <div className="text-[11px] text-sns-grey text-right">{v.isExpanded ? '▲' : '▼'}</div>
            </div>
            {v.isExpanded && <VendorDetail v={v} busy={vm.busy} canEdit={vm.canAct} />}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
