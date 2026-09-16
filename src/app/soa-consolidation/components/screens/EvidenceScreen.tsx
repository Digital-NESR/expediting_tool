import type { ScreenProps } from '../../types';
import { EVIDENCE_TYPE_FILL } from '../tones';

export default function EvidenceScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="mb-4">
        <h1 className="text-[20px] font-bold mb-[3px]">Evidence Repository</h1>
        <p className="text-[12px] text-sns-grey">
          System-generated audit trail · Saudi Arabia (SA) · Q3 2026 · All actions time-stamped
        </p>
      </div>
      <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        {vm.evidenceEnriched.map((e) => (
          <div key={e.id} className="flex gap-3 py-2.5 border-b border-b-[#F5F5F5] items-start">
            <div
              className={`${EVIDENCE_TYPE_FILL[e.type]} w-2.5 h-2.5 rounded-full shrink-0 mt-1.5`}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-[3px]">
                <div
                  className={`${EVIDENCE_TYPE_FILL[e.type]} text-white rounded-sm px-[7px] py-px text-[10px] font-bold inline-block`}
                >
                  {e.typeLabel}
                </div>
                <div className="text-[12px] font-bold text-sns-ink">{e.action}</div>
                <div className="text-[10px] text-sns-grey ml-auto">{e.ts}</div>
              </div>
              <div className="text-[11px] text-sns-grey leading-[1.4] mb-0.5">{e.detail}</div>
              <div className="text-[10px] text-[#A0A0A0]">Actor: {e.actor}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
