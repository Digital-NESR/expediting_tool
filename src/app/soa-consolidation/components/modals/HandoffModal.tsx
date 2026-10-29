import type { ScreenProps } from '../../types';
import { CRITERION_FILL } from '../tones';

/**
 * The handoff confirmation.
 *
 * It used to list four ticks written into the markup, under a heading that said the criteria were
 * met. Beside a coverage figure that might have been 3%. It now shows what the criteria actually
 * say, including the one that cannot be measured.
 *
 * Below target it has two quite different things to say, and the difference is whether suppliers
 * can still answer. While the window is open the action refuses outright. Once it has closed,
 * closing short is a legitimate end to a cycle nobody answered, and this is the last place to say
 * so before it is written to the evidence repository and announced to AP.
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
                  <strong className="text-sns-ink">{ci.label}</strong>, {ci.detail}
                </span>
              </div>
            ))}
          </div>
        </div>
        {vm.handoffShortOfTarget && (
          <div className="mb-3.5 rounded-lg border border-[#E65100] bg-[#FFF3E0] px-3.5 py-3 text-[12px] leading-[1.55]">
            <div className="font-bold text-[#E65100] mb-1">
              This closes the cycle below its {vm.coverageTargetPct}% target.
            </div>
            <div className="text-[#5B4A33]">
              Coverage is {vm.fmtCoveragePct} and the window suppliers were given closed on{' '}
              {vm.deadlineLabel}. The handoff notice tells AP the file closed short, and the
              shortfall is recorded against this cycle in the evidence repository.
            </div>
          </div>
        )}
        <div className="text-[12px] text-sns-grey mb-4 leading-[1.5]">
          <strong>{vm.exportFileName}</strong> will be marked as delivered to the AP/Finance Country
          Group inbox for {vm.countryLabel}, and the handoff is written to the evidence repository.
          {vm.handoffShortOfTarget
            ? ' Below target the action is allowed only because the collection window has closed.'
            : ` The action refuses below ${vm.coverageTargetPct}% coverage; this country is at ${vm.fmtCoveragePct}.`}
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
            {vm.busy
              ? 'Handing off…'
              : vm.handoffShortOfTarget
                ? 'Close short and hand off to AP/Finance →'
                : 'Confirm Handoff to AP/Finance →'}
          </button>
        </div>
      </div>
    </>
  );
}
