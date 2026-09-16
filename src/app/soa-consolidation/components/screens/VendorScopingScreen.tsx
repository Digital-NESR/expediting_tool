import type { ScreenProps } from '../../types';
import { STANDING_TEXT, VENDOR_STATUS_BADGE } from '../tones';

const COLUMNS = 'grid-cols-[36px_1fr_110px_90px_100px_90px]';

export default function VendorScopingScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Vendor Scoping</h1>
          <p className="text-[12px] text-sns-grey">
            All POs in last 18 months · Saudi Arabia (SA) · Q3 2026 · Threshold: $250,000
          </p>
        </div>
        <div className="bg-sns-green-wash border border-sns-green rounded-lg px-3.5 py-2 text-right">
          <div className="text-[10px] text-sns-green font-bold uppercase tracking-[0.5px]">
            Total Balance
          </div>
          <div className="text-[18px] font-bold text-sns-green">$42.5M</div>
        </div>
      </div>

      <div className="flex gap-2.5 mb-3.5">
        <div className="flex-1 bg-white rounded-lg px-3.5 py-3 border-l-4 border-l-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
            Q3 2026 Target (70%)
          </div>
          <div className="text-[16px] font-bold text-sns-green mt-0.5">
            ≥ $29.75M in SOAs received
          </div>
        </div>
        <div className="flex-1 bg-white rounded-lg px-3.5 py-3 border-l-4 border-l-sns-grey shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
            Year-End Target (95%)
          </div>
          <div className="text-[16px] font-bold text-sns-grey mt-0.5">
            ≥ $40.375M in SOAs received
          </div>
        </div>
        <div className="flex-1 bg-white rounded-lg px-3.5 py-3 border-l-4 border-l-[#1565C0] shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
            Vendors In Scope
          </div>
          <div className="text-[16px] font-bold text-[#1565C0] mt-0.5">
            {vm.totalCount} suppliers · POs last 18 months
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[10px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        <div
          className={`grid ${COLUMNS} gap-2 px-3.5 py-2.5 bg-sns-green text-white text-[10px] font-bold uppercase tracking-[0.5px]`}
        >
          <div>#</div>
          <div>Vendor Name</div>
          <div>Vendor No.</div>
          <div>PO Amount</div>
          <div>Cumulative %</div>
          <div>Status</div>
        </div>
        {vm.scopingVendors.map((v, i) => (
          <div
            key={v.id}
            className={`grid ${COLUMNS} gap-2 px-3.5 py-[9px] text-[12px] border-b border-b-[#F0F0F0] items-center ${
              i % 2 === 0 ? 'bg-white' : 'bg-[#F8FBF9]'
            }`}
          >
            <div className="text-sns-grey text-[11px]">{v.rank}</div>
            <div className="font-bold">{v.name}</div>
            <div className="text-sns-grey text-[11px] font-[family-name:monospace]">{v.no}</div>
            <div className="font-bold">{v.fmtOpenPO}</div>
            <div className={`font-bold ${STANDING_TEXT[v.cumStanding]}`}>{v.cumPct}%</div>
            <div
              className={`${VENDOR_STATUS_BADGE[v.status]} rounded-xl px-[9px] py-0.5 text-[10px] font-bold inline-block`}
            >
              {v.statusLabel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
