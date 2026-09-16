import type { ScreenProps } from '../../types';

export default function HandoffModal({ vm }: ScreenProps) {
  return (
    <>
      <div className="bg-sns-green px-5 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-[14px]">Confirm Handoff to Finance</div>
        <div onClick={vm.onCloseModal} className="text-white cursor-pointer text-[18px] opacity-70">
          ✕
        </div>
      </div>
      <div className="p-5">
        <div className="bg-sns-green-wash border border-sns-green-pale rounded-lg p-3.5 mb-3.5">
          <div className="text-[12px] font-bold text-sns-green mb-1.5">
            Control Criteria Met — Ready for Handoff
          </div>
          <div className="text-[11px] text-sns-grey leading-[1.6]">
            ✓ Coverage: {vm.coveragePct}% (≥70% Q3 threshold)
            <br />✓ 2-request evidence: complete for all {vm.receivedCount} vendors
            <br />
            ✓ 10–14 day gap: all reminders within SOP window
            <br />✓ Non-responder evidence: retained on file
          </div>
        </div>
        <div className="text-[12px] text-sns-grey mb-4 leading-[1.5]">
          The consolidated SOA file <strong>NESR-KSA-SOA-Q3-2026.xlsx</strong> will be marked as
          delivered to the AP/Finance Country Group inbox. This action is logged in the evidence
          repository.
        </div>
        <div className="flex gap-2">
          <button
            onClick={vm.onCloseModal}
            className="flex-1 bg-[#F5F5F5] text-sns-grey border-none p-2.5 rounded-[7px] text-[12px] font-bold"
          >
            Cancel
          </button>
          <button
            onClick={vm.onConfirmHandoff}
            className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold"
          >
            Confirm Handoff to AP/Finance →
          </button>
        </div>
      </div>
    </>
  );
}
