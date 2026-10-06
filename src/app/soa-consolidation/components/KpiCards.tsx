import { STANDING_BORDER_TOP, STANDING_TEXT } from './tones';
import type { KpiCardVM } from '../types';

/**
 * The five tiles: scope, received, awaiting, coverage and days left.
 *
 * Lifted out of the Dashboard so the Response Tracking and Consolidation screens can show the
 * same five. A champion works a quarter from those two screens and had to go back to the
 * Dashboard to see how far along they were, which is the one question the chase is about. They
 * are the same objects from the same view model, so the three screens cannot drift into showing
 * different numbers for the same country.
 */
export default function KpiCards({ cards }: { cards: KpiCardVM[] }) {
  return (
    <div className="mb-3.5 grid grid-cols-[repeat(5,1fr)] gap-2.5">
      {cards.map((kpi) => (
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
  );
}
