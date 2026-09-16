import type { ScreenProps } from '../../types';

export default function OutreachScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Outreach</h1>
          <p className="text-[12px] text-sns-grey">
            Automated vendor outreach — Saudi Arabia (SA) · Q3 2026
          </p>
        </div>
        {vm.canSendReminders && (
          <button
            onClick={vm.onSendReminders}
            className="bg-[#E65100] text-white border-none px-4 py-[9px] rounded-[7px] text-[13px] font-bold"
          >
            Send Reminders to {vm.remindCount} Vendors
          </button>
        )}
      </div>

      <div className="grid grid-cols-[repeat(4,1fr)] gap-2.5 mb-4">
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Requests Sent
          </div>
          <div className="text-[28px] font-bold text-sns-green">{vm.totalCount}</div>
          <div className="text-[10px] text-sns-grey">01 Jul 2026 · All vendors</div>
        </div>
        <div className="bg-white rounded-lg p-3.5 border-t-[3px] border-t-[#1565C0] shadow-[0_1px_3px_rgba(0,0,0,0.07)] text-center">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-1">
            Reminders Sent
          </div>
          <div className="text-[28px] font-bold text-[#1565C0]">{vm.remindedCount}</div>
          <div className="text-[10px] text-sns-grey">15 Jul 2026 · Day 14</div>
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
              <strong>To:</strong> [vendor-accounts@example.com]
            </div>
            <div className="text-[11px] text-sns-grey mb-3">
              <strong>Subject:</strong> NESR Statement of Account Request — Q3 2026 | Saudi Arabia
            </div>
            <div className="border-t border-t-[#E0E0E0] pt-3">
              <p className="text-[12px] mb-2.5">Dear [Vendor Name],</p>
              <p className="text-[12px] mb-2.5 leading-[1.5]">
                As part of NESR&apos;s quarterly reconciliation process, we kindly request your
                Statement of Account for the period ending <strong>30 June 2026</strong> for
                transactions with our legal entity in <strong>Saudi Arabia (SA)</strong>.
              </p>
              <p className="text-[12px] mb-2.5 leading-[1.5]">
                Please submit your SOA in the standard NESR format (template attached) by{' '}
                <strong>15 July 2026</strong> using the secure upload link below. No account
                creation is required.
              </p>
              <div className="bg-[#F5F5F5] rounded-md p-3 my-3 text-center">
                <div className="text-[11px] text-sns-grey mb-1.5">
                  Secure Upload Link (expires: 15 Jul 2026)
                </div>
                <div className="bg-sns-green text-white inline-block px-5 py-2 rounded-[5px] text-[12px] font-bold">
                  Submit Your SOA →
                </div>
              </div>
              <p className="text-[11px] text-sns-grey leading-[1.5]">
                For queries, contact your NESR Supply Chain SOA Champion: Ahmed Al-Rashidi ·
                aarashidi@nesr.com
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
