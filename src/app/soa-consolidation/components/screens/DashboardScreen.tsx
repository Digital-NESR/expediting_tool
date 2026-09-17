import type { ScreenProps } from '../../types';
import { STANDING_BORDER_TOP, STANDING_TEXT, VENDOR_STATUS_FILL } from '../tones';

export default function DashboardScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Dashboard</h1>
          <p className="text-[12px] text-sns-grey">
            {vm.contextLine} · Deadline: {vm.deadlineLabel} ({vm.daysRemaining} days remaining)
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {vm.hasUnrequested && (
            <button
              onClick={vm.onSendRequests}
              disabled={vm.busy}
              className="bg-sns-green text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
            >
              Send {vm.unrequestedCount} Initial Requests
            </button>
          )}
          {vm.hasRemindable && (
            <button
              onClick={vm.onSendReminders}
              disabled={vm.busy}
              className="bg-[#E65100] text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
            >
              Send Reminders ({vm.remindCount})
            </button>
          )}
          <button
            onClick={vm.onGoToConsolidation}
            className="bg-sns-green text-white border-none px-3.5 py-2 rounded-[7px] text-[12px] font-bold"
          >
            Review Consolidation →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[repeat(5,1fr)] gap-2.5 mb-3.5">
        {vm.kpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className={`bg-white rounded-[10px] px-4 py-3.5 border-t-4 ${STANDING_BORDER_TOP[kpi.accent]} shadow-[0_1px_3px_rgba(0,0,0,0.07)]`}
          >
            <div className="text-[10px] uppercase tracking-[0.5px] text-sns-grey font-bold mb-1">
              {kpi.label}
            </div>
            <div className={`text-[30px] font-bold leading-none my-1 ${STANDING_TEXT[kpi.accent]}`}>
              {kpi.value}
            </div>
            <div className="text-[10px] text-sns-grey mt-[3px] leading-[1.3]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[3fr_1fr] gap-3 mb-3">
        <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-3">
            Workflow Pipeline — {vm.contextLine}
          </div>
          <div className="flex rounded-[7px] overflow-hidden">
            {vm.pipeline.map((step) => (
              <div
                key={step.id}
                className={`flex-1 px-1.5 py-3 text-center ${
                  step.done
                    ? 'bg-sns-green text-white'
                    : step.active
                      ? 'bg-[#1565C0] text-white'
                      : 'bg-[#F0F0F0] text-[#999]'
                } ${step.step < 6 ? 'border-r border-r-[rgba(255,255,255,0.15)]' : ''}`}
              >
                <div className="text-[18px] leading-none">{step.nodeIcon}</div>
                <div className="text-[11px] font-bold mt-1 leading-[1.2]">{step.label}</div>
                {step.active && <div className="text-[10px] mt-0.5 opacity-[0.85]">{step.sub}</div>}
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-2">
            18-Month PO Coverage
          </div>
          <div
            className={`text-[36px] font-bold leading-none mb-1 ${vm.coverageMet ? 'text-sns-green' : 'text-[#E65100]'}`}
          >
            {vm.coveragePct}%
          </div>
          <div className="text-[10px] text-sns-grey mb-2">
            of {vm.totalBalanceLabel} 18-month PO balance
          </div>
          <div className="bg-[#E0E8E3] rounded-[3px] h-2.5 mb-[5px] overflow-hidden">
            {/* Width tracks a live percentage, so it is the one declaration that has to stay inline. */}
            <div
              className={`rounded-[3px] h-full transition-[width] duration-[0.4s] ease-[ease] ${vm.coverageMet ? 'bg-sns-green' : 'bg-[#FF8F00]'}`}
              style={{ width: `${Math.min(vm.coveragePct, 100)}%` }}
            />
          </div>
          <div className="flex justify-between text-[9px] text-sns-grey mb-2">
            <span>0%</span>
            <span>{vm.coverageTargetPct}%</span>
            <span>{vm.yearEndTargetPct}%</span>
          </div>
          <div
            className={`text-[11px] font-bold ${vm.coverageMet ? 'text-sns-green' : 'text-[#E65100]'}`}
          >
            {vm.coverageCheckLabel}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        <div className="text-[10px] font-bold uppercase tracking-[0.5px] text-sns-grey mb-2.5">
          Vendor Response Status — {vm.totalCount} In-Scope Vendors
        </div>
        <div className="flex rounded-sm overflow-hidden h-[18px] mb-2.5 bg-[#E0E8E3]">
          {vm.statusBarSegs.map((seg) => (
            /* Each segment is weighted by its vendor count, so flex-grow stays inline. */
            <div
              key={seg.label}
              className={`${VENDOR_STATUS_FILL[seg.status]} h-full`}
              style={{ flex: seg.count }}
              title={seg.label}
            />
          ))}
        </div>
        <div className="flex gap-5 flex-wrap">
          {vm.statusBarSegs.map((seg) => (
            <div key={seg.label} className="flex items-center gap-[5px] text-[11px] text-sns-grey">
              <div
                className={`${VENDOR_STATUS_FILL[seg.status]} w-2.5 h-2.5 rounded-full inline-block mr-1 align-middle`}
              />
              <span>
                {seg.label}: <strong>{seg.count}</strong>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
