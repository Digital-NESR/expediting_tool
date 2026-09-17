import type { ScreenProps } from '../../types';

/**
 * Outreach.
 *
 * The prototype could only send reminders, which meant the first request could never be sent at
 * all: a freshly scoped country is 270 vendors sitting at `scoped`, and nothing moved them. Both
 * sends are here now, and each reports what actually happened rather than assuming it worked.
 */
export default function OutreachScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Outreach</h1>
          <p className="text-[12px] text-sns-grey">
            Automated vendor outreach — {vm.contextLine} · Deadline {vm.deadlineLabel}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {vm.hasUnrequested && (
            <button
              type="button"
              onClick={vm.onSendRequests}
              disabled={vm.busy}
              className="bg-sns-green text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
            >
              Send Initial Requests to {vm.unrequestedCount} Vendors
            </button>
          )}
          {vm.canSendReminders && (
            <button
              type="button"
              onClick={vm.onSendReminders}
              disabled={vm.busy}
              className="bg-[#E65100] text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold disabled:opacity-50"
            >
              Send Reminders to {vm.remindCount} Vendors
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(4,1fr)] gap-2.5 mb-4">
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Not Yet Requested
          </div>
          <div className="text-[28px] font-bold text-sns-grey">{vm.unrequestedCount}</div>
          <div className="text-[10px] text-sns-grey">of {vm.totalCount} in scope</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-[#1565C0] shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Reminders Sent
          </div>
          <div className="text-[28px] font-bold text-[#1565C0]">{vm.remindedCount}</div>
          <div className="text-[10px] text-sns-grey">Second request on file</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-[#E65100] shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Awaiting Response
          </div>
          <div className="text-[28px] font-bold text-[#E65100]">{vm.remindCount}</div>
          <div className="text-[10px] text-sns-grey">Eligible for reminder</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Responses Received
          </div>
          <div className="text-[28px] font-bold text-sns-green">{vm.receivedCount}</div>
          <div className="text-[10px] text-sns-grey">{vm.coveragePct}% coverage</div>
        </div>
      </div>

      {/* Unreachable vendors and refused dispatches are the usual reason coverage stops moving,
          and neither was visible anywhere in the prototype. */}
      <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)] mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey">
              Delivery
            </div>
            <div className="text-[12px] text-sns-ink mt-0.5">
              {vm.unreachableCount > 0 ? (
                <span className="text-[#B71C1C] font-bold">
                  {vm.unreachableCount} in-scope vendors have no email address and cannot be sent
                  anything.
                </span>
              ) : (
                <span>Every in-scope vendor has at least one contact address on file.</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={vm.onLoadFailures}
            disabled={vm.busy}
            className="bg-white text-sns-ink border border-sns-line px-3 py-[7px] rounded-md text-[11px] font-bold disabled:opacity-50"
          >
            {vm.failuresLoaded ? 'Refresh failed dispatches' : 'Show failed dispatches'}
          </button>
        </div>
        {vm.failuresLoaded && !vm.hasFailures && (
          <div className="text-[11px] text-sns-grey mt-2.5">
            No send has been refused for this country in this cycle.
          </div>
        )}
        {vm.hasFailures && (
          <div className="mt-2.5 border-t border-t-[#F0F0F0] pt-2.5">
            {vm.failures?.map((f) => (
              <div
                key={`${f.vendorNo}-${f.sentAt}`}
                className="flex gap-3 py-1.5 text-[11px] border-b border-b-[#F5F5F5] items-start"
              >
                <div className="w-[190px] shrink-0">
                  <div className="font-bold text-sns-ink">{f.vendorName}</div>
                  <div className="text-sns-grey font-[family-name:monospace] text-[10px]">
                    {f.vendorNo}
                  </div>
                </div>
                <div className="flex-1 text-[#B71C1C] leading-[1.4]">{f.error}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-[10px] p-[18px] shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-3">
          Approved Email Template (Ref: SOP Appendix 6.3)
        </div>
        <div className="border border-sns-line rounded-lg overflow-hidden max-w-[680px]">
          <div className="bg-sns-green px-[18px] py-3.5 flex items-center justify-between">
            <div className="text-white font-bold text-[13px] tracking-[2px]">NESR</div>
            <div className="text-[rgba(255,255,255,0.7)] text-[11px]">
              National Energy Services Reunited Corp.
            </div>
          </div>
          <div className="p-[18px]">
            <div className="text-[11px] text-sns-grey mb-[3px]">
              <strong>From:</strong> noreply-soa@nesr.com
            </div>
            <div className="text-[11px] text-sns-grey mb-[3px]">
              <strong>To:</strong> [vendor contact addresses on file]
            </div>
            <div className="text-[11px] text-sns-grey mb-3">
              <strong>Subject:</strong> NESR Statement of Account Request — {vm.cycleLabel} |{' '}
              {vm.entityName}
            </div>
            <div className="border-t border-t-[#E0E0E0] pt-3">
              <p className="text-[12px] mb-2.5">Dear [Vendor Name],</p>
              <p className="text-[12px] mb-2.5 leading-[1.5]">
                As part of NESR&apos;s quarterly reconciliation process, we kindly request your
                Statement of Account for <strong>{vm.periodLabel}</strong> for transactions with our
                legal entity in <strong>{vm.countryLabel}</strong>.
              </p>
              <p className="text-[12px] mb-2.5 leading-[1.5]">
                Please submit your SOA in the standard NESR format (template attached) by{' '}
                <strong>{vm.deadlineLabel}</strong> using the secure upload link below. No account
                creation is required.
              </p>
              <div className="bg-[#F5F5F5] rounded-md p-3 my-3 text-center">
                <div className="text-[11px] text-sns-grey mb-1.5">
                  Secure Upload Link (expires: {vm.deadlineLabel})
                </div>
                <div className="bg-sns-green text-white inline-block px-5 py-2 rounded-[5px] text-[12px] font-bold">
                  Submit Your SOA →
                </div>
              </div>
              <p className="text-[11px] text-sns-grey leading-[1.5]">
                For queries, contact your NESR Supply Chain SOA Champion: {vm.championContact}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
