import { Fragment } from 'react';
import type { ScreenProps } from '../../types';
import { FILTER_TAB_SELECTED, VENDOR_STATUS_BADGE } from '../tones';

const COLUMNS = 'grid-cols-[1fr_100px_90px_80px_80px_80px_60px]';

export default function ResponseTrackingScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-3.5">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Response Tracking</h1>
          <p className="text-[12px] text-sns-grey">
            Live vendor response status — Saudi Arabia (SA) · Q3 2026
          </p>
        </div>
        {vm.hasRemindable && (
          <button
            onClick={vm.onSendReminders}
            className="bg-[#E65100] text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold"
          >
            Send All Reminders ({vm.remindCount})
          </button>
        )}
      </div>

      <div className="flex gap-1.5 mb-3 flex-wrap">
        {vm.filterTabs.map((tab) => (
          <div
            key={tab.status}
            onClick={tab.onClick}
            className={`px-3 py-1.5 rounded-[20px] cursor-pointer text-[11px] font-bold border-2 whitespace-nowrap ${
              tab.isSelected
                ? FILTER_TAB_SELECTED[tab.status]
                : 'border-transparent bg-[#F0F0F0] text-sns-grey'
            }`}
          >
            {tab.label} ({tab.count})
          </div>
        ))}
      </div>

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
            {v.isExpanded && (
              <div className="bg-[#F5FAF7] border-b border-b-sns-line px-3.5 py-3 flex gap-2.5 items-center">
                <div className="flex-1 text-[11px] text-sns-grey">
                  {v.canAccept && (
                    <span>Upload link active · Vendor can submit via email link</span>
                  )}
                  {v.isReceived && (
                    <span className="text-sns-green font-bold">
                      ✓ SOA received · {v.invCount} invoices on file · Currency: {v.currency}
                    </span>
                  )}
                </div>
                {v.canAccept && (
                  <button
                    onClick={v.onAccept}
                    className="bg-sns-green text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold"
                  >
                    Accept SOA Upload
                  </button>
                )}
                {v.canRemind && (
                  <button
                    onClick={v.onRemind}
                    className="bg-[#1565C0] text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold"
                  >
                    Send Reminder
                  </button>
                )}
                {v.canNR && (
                  <button
                    onClick={v.onNR}
                    className="bg-[#B71C1C] text-white border-none px-3 py-[7px] rounded-md text-[11px] font-bold"
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
