import type { ScreenProps } from '../../types';

const COLUMNS = 'grid-cols-[30px_1fr_110px_65px_85px_55px_80px]';

export default function ConsolidationScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Consolidation &amp; Handoff</h1>
          <p className="text-[12px] text-sns-grey">
            Automated consolidation · Saudi Arabia (SA) · Q3 2026
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={vm.onGenerateExport}
            className="bg-[#1565C0] text-white border-none px-3.5 py-[9px] rounded-[7px] text-[12px] font-bold"
          >
            Generate Export File
          </button>
          {vm.canHandoff && (
            <button
              onClick={vm.onOpenHandoffModal}
              className="bg-sns-green text-white border-none px-3.5 py-[9px] rounded-[7px] text-[12px] font-bold"
            >
              Mark Handed Off to Finance →
            </button>
          )}
          {vm.handedOff && (
            <div className="bg-sns-green-wash border border-sns-green rounded-[7px] px-3.5 py-[9px] text-[12px] font-bold text-sns-green">
              ✓ Handed Off
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-[10px] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.07)] mb-3.5">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[12px] font-bold uppercase tracking-[0.5px] text-sns-grey">
            Control Criteria Check (SOP NESR-SC-01-GR2PAY)
          </div>
          <div
            className={`text-[12px] font-bold rounded-md px-3 py-1 border ${
              vm.allPass
                ? 'text-sns-green bg-sns-green-wash border-sns-green'
                : 'text-[#E65100] bg-[#FFF3E0] border-[#E65100]'
            }`}
          >
            {vm.allPassLabel}
          </div>
        </div>
        {vm.complianceItems.map((ci) => (
          <div
            key={ci.label}
            className={`flex items-start gap-3 px-[15px] py-3 bg-white rounded-lg mb-2 border-l-4 ${
              ci.pass ? 'border-l-sns-green' : 'border-l-[#B71C1C]'
            }`}
          >
            <div
              className={`w-6.5 h-6.5 rounded-full text-white flex items-center justify-center font-bold shrink-0 text-[13px] mt-px ${
                ci.pass ? 'bg-sns-green' : 'bg-[#B71C1C]'
              }`}
            >
              {ci.icon}
            </div>
            <div className="flex-1">
              <div className="text-[12px] font-bold mb-0.5">{ci.label}</div>
              <div className="text-[11px] text-sns-grey leading-[1.4]">{ci.detail}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-[10px] overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
        <div className="px-3.5 py-3 border-b border-b-[#F0F0F0] flex items-center justify-between">
          <div className="text-[12px] font-bold text-sns-ink">
            Consolidated SOA — {vm.receivedCount} Vendors · NESR-KSA-SOA-Q3-2026
          </div>
          <div className="text-[11px] text-sns-grey">Auto-compiled · No manual re-keying</div>
        </div>
        <div
          className={`grid ${COLUMNS} gap-2 px-3.5 py-[9px] bg-sns-green text-white text-[10px] font-bold uppercase tracking-[0.5px] items-center`}
        >
          <div>#</div>
          <div>Vendor Name</div>
          <div>Vendor No.</div>
          <div>Curr.</div>
          <div>Amount</div>
          <div>Inv.</div>
          <div>Response</div>
        </div>
        {vm.consolidatedRows.map((r, i) => (
          <div
            key={r.id}
            className={`grid ${COLUMNS} gap-2 px-3.5 py-[9px] text-[11px] border-b border-b-[#F0F0F0] items-center ${
              i % 2 === 0 ? 'bg-white' : 'bg-[#F0F7F3]'
            }`}
          >
            <div className="text-sns-grey">{r.num}</div>
            <div className="font-bold text-[12px]">{r.name}</div>
            <div className="text-sns-grey font-[family-name:monospace] text-[10px]">{r.no}</div>
            <div className="text-sns-grey">{r.currency}</div>
            <div className="font-bold text-sns-green">{r.fmtOpenPO}</div>
            <div className="text-sns-grey">{r.invCount}</div>
            <div className="text-sns-grey text-[10px]">{r.respDate}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
