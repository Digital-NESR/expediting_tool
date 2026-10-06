import type { ScreenProps } from '../../types';
import { COUNTRY_STATUS_BADGE, STANDING_BG, STANDING_BORDER_TOP, STANDING_TEXT } from '../tones';
import { formatPct } from '@/lib/soa/spend-share';

const COLUMNS = 'grid-cols-[140px_120px_85px_1fr_115px_70px_65px]';

export default function CorporateRollupScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Corporate Rollup</h1>
          <p className="text-[12px] text-sns-grey">
            {vm.entityCount} legal entities started · {vm.cycleLabel} · {vm.roleLabel} view
          </p>
        </div>
        <div
          className={`border rounded-lg px-3.5 py-2 text-[12px] font-bold max-w-[360px] ${
            vm.hasAtRisk
              ? 'bg-[#FFF3E0] border-[#E65100] text-[#E65100]'
              : 'bg-sns-green-wash border-sns-green text-sns-green'
          }`}
        >
          {vm.hasAtRisk && (
            <>
              ⚠ {vm.atRiskCount} countries at risk, below {vm.coverageTargetPct}% coverage with
              &lt;10 days remaining
            </>
          )}
          {vm.noAtRisk && <>✓ All active countries on track</>}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(4,1fr)] gap-2.5 mb-3.5">
        {vm.corpKpiCards.map((kpi) => (
          <div
            key={kpi.label}
            className={`bg-white rounded-[10px] px-4 py-3.5 border-t-4 ${STANDING_BORDER_TOP[kpi.accent]} shadow-[0_1px_3px_rgba(0,0,0,0.07)]`}
          >
            <div className="text-[10px] uppercase tracking-[0.5px] text-sns-grey font-bold mb-1">
              {kpi.label}
            </div>
            <div className={`text-[28px] font-bold leading-none my-1 ${STANDING_TEXT[kpi.accent]}`}>
              {kpi.value}
            </div>
            <div className="text-[10px] text-sns-grey mt-[3px]">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[10px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        <div
          className={`grid ${COLUMNS} gap-2 px-3.5 py-2.5 bg-sns-green text-white text-[10px] font-bold uppercase tracking-[0.5px] items-center`}
        >
          <div>Country</div>
          <div>SC Champion</div>
          <div>18M PO Bal.</div>
          <div>Chase progress, share of balance</div>
          <div>Status</div>
          <div>Resp.</div>
          <div>Days</div>
        </div>
        {vm.entityCount === 0 && (
          <div className="px-3.5 py-6 text-center text-[12px] text-sns-grey">
            No country has started this cycle yet. A country appears here once its vendor list has
            been scoped. It has not failed, it has not begun.
          </div>
        )}
        {vm.countriesEnriched.map((c, i) => (
          <div
            key={c.id}
            className={`grid ${COLUMNS} items-center gap-2 px-3.5 py-2.5 border-b border-b-[#F0F0F0] border-l-[3px] ${
              c.isAtRisk
                ? 'bg-[#FFF8F5] border-l-[#E65100]'
                : `${i % 2 === 0 ? 'bg-white' : 'bg-[#F9FBF9]'} border-l-transparent`
            }`}
          >
            <div className="font-bold text-[12px]">{c.name}</div>
            <div className="text-[11px] text-sns-grey">{c.champion}</div>
            <div className="font-bold text-[12px]">{c.fmtBalance}</div>
            {/* One bar per stage, all against the same denominator, so the bars line up and the
                gaps between them can be read straight down the column. */}
            <div className="space-y-[3px] pr-3">
              {c.funnel.map((stage) => (
                <div key={stage.label} className="flex items-center gap-2">
                  {/* Wide enough for REQUESTED, the longest of the four, at this size and
                      tracking. Anything tighter clips it rather than wrapping, because the row
                      must not change height between countries or the bars stop lining up. */}
                  <span className="w-[64px] shrink-0 whitespace-nowrap text-[9.5px] uppercase tracking-[0.3px] text-sns-grey">
                    {stage.label}
                  </span>
                  <div className="flex-1 bg-[#E8EDE9] rounded-xs h-1.5 overflow-hidden">
                    {/* Width tracks a live percentage, so it is the one declaration that has to stay inline. */}
                    <div
                      className={`${STANDING_BG[stage.standing]} h-full rounded-xs`}
                      style={{ width: `${Math.min(stage.pct, 100)}%` }}
                    />
                  </div>
                  <span
                    /* 100% is four characters and w-8 fitted three. */
                    className={`w-[38px] shrink-0 whitespace-nowrap text-right text-[10.5px] tabular-nums ${
                      stage.label === 'Answered' ? 'font-bold text-sns-ink' : 'text-sns-grey'
                    }`}
                  >
                    {formatPct(stage.pct)}
                  </span>
                </div>
              ))}
            </div>
            <div
              className={`${COUNTRY_STATUS_BADGE[c.status]} rounded-xl px-[9px] py-0.5 text-[10px] font-bold`}
            >
              {c.statusLabel}
            </div>
            <div className="text-[11px] text-sns-grey">
              {c.responded}/{c.total}
            </div>
            <div
              className={`text-[11px] font-bold ${c.isDeadlineTight ? 'text-[#B71C1C]' : 'text-sns-grey'}`}
            >
              {c.daysLeft}d
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
