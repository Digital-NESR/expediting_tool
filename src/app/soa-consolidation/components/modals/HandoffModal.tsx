import type { ScreenProps } from '../../types';
import { CRITERION_FILL } from '../tones';

/**
 * The handoff confirmation.
 *
 * It used to list four ticks written into the markup, under a heading that said the criteria were
 * met — beside a coverage figure that might have been 3%. It now shows what the criteria actually
 * say, including the one that cannot be measured, and the action behind the button refuses a
 * country below the cycle's coverage target regardless of what this dialog shows.
 */
export default function HandoffModal({ vm }: ScreenProps) {
  return (
    <>
      <div className="bg-sns-green px-5 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-[14px]">Confirm Handoff to Finance</div>
        <button
          type="button"
          onClick={vm.onCloseModal}
          aria-label="Close"
          className="text-white cursor-pointer text-[18px] opacity-70"
        >
          ✕
        </button>
      </div>
      <div className="p-5">
        <div
          className={`rounded-lg p-3.5 mb-3.5 border ${
            vm.allPass ? 'bg-sns-green-wash border-sns-green-pale' : 'bg-[#FFF3E0] border-[#E65100]'
          }`}
        >
          <div
            className={`text-[12px] font-bold mb-2 ${vm.allPass ? 'text-sns-green' : 'text-[#E65100]'}`}
          >
            {vm.allPassLabel}
          </div>
          <div className="text-[11px] text-sns-grey leading-[1.6]">
            {vm.complianceItems.map((ci) => (
              <div key={ci.label} className="flex items-start gap-2 mb-1 last:mb-0">
                <span
                  className={`${CRITERION_FILL[ci.state]} mt-[3px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white`}
                >
                  {ci.icon}
                </span>
                <span>
                  <strong className="text-sns-ink">{ci.label}</strong> — {ci.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="text-[12px] text-sns-grey mb-4 leading-[1.5]">
          <strong>{vm.exportFileName}</strong> will be marked as delivered to the AP/Finance Country
          Group inbox for {vm.countryLabel}, and the handoff is written to the evidence repository.
          The action refuses below {vm.coverageTargetPct}% coverage; this country is at{' '}
          {vm.coveragePct}%.
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={vm.onCloseModal}
            className="flex-1 bg-[#F5F5F5] text-sns-grey border-none p-2.5 rounded-[7px] text-[12px] font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={vm.onConfirmHandoff}
            disabled={vm.busy}
            className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
          >
            {vm.busy ? 'Handing off…' : 'Confirm Handoff to AP/Finance →'}
          </button>
        </div>
      </div>
    </>
  );
}
