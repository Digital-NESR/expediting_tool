import type { ScreenProps } from '../../types';
import TableToolbar from '../TableToolbar';
import { STANDING_TEXT, VENDOR_STATUS_BADGE } from '../tones';

const COLUMNS = 'grid-cols-[36px_1fr_110px_90px_100px_90px]';

/**
 * Vendor Scoping, which used to be a read-only table of fixtures.
 *
 * Scoping is the step that makes every other screen possible — it draws the country's vendor list
 * from the cycle's PO snapshot — and it had no button. It has one now, and re-running it is safe:
 * `scopeSoaCountry` refreshes the vendors already in the cycle rather than starting again, which
 * is why the result reports `added` and `refreshed` separately.
 */
export default function VendorScopingScreen({ vm }: ScreenProps) {
  return (
    <div className="animate-[fadeIn_0.2s_ease]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-[20px] font-bold mb-[3px]">Vendor Scoping</h1>
          <p className="text-[12px] text-sns-grey">
            All POs in last 18 months · {vm.contextLine} · Threshold: {vm.thresholdLabel}
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {vm.canScope && (
            <button
              type="button"
              onClick={vm.onScopeCountry}
              disabled={vm.busy}
              className="bg-sns-green text-white border-none px-3.5 py-[9px] rounded-[7px] text-[12px] font-bold disabled:opacity-50"
            >
              {vm.isScoped ? 'Re-scope this country' : 'Scope this country'}
            </button>
          )}
          <div className="bg-sns-green-wash border border-sns-green rounded-lg px-3.5 py-2 text-right">
            <div className="text-[10px] text-sns-green font-bold uppercase tracking-[0.5px]">
              Total Balance
            </div>
            <div className="text-[18px] font-bold text-sns-green">{vm.totalBalanceLabel}</div>
          </div>
        </div>
      </div>

      {vm.scopeSummary && (
        <div className="bg-white rounded-lg border-l-4 border-l-[#6A1B9A] px-3.5 py-3 mb-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
          <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold mb-0.5">
            Last scoping run
          </div>
          <div className="text-[12px] text-sns-ink leading-[1.5]">{vm.scopeSummaryLine}</div>
          {vm.scopeSummary.unreachable > 0 && (
            <div className="text-[11px] text-[#E65100] mt-1">
              {vm.scopeSummary.unreachable} in-scope vendors have no email address on file and
              cannot be chased until one is supplied.
            </div>
          )}
        </div>
      )}

      {!vm.isScoped && (
        <div className="bg-white rounded-[10px] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.07)] border-t-4 border-t-sns-grey">
          <div className="text-[14px] font-bold mb-1.5">No vendor list has been drawn yet</div>
          <p className="text-[12px] text-sns-grey leading-[1.6] max-w-[620px]">
            Scoping reads the cycle&apos;s PO snapshot for {vm.countryLabel}, keeps every supplier
            above {vm.thresholdLabel}, and freezes each one&apos;s open PO amount into the cycle so
            a vendor is asked to confirm the same figure on the last day it was asked on the first.
          </p>
          {!vm.canScope && (
            <p className="text-[12px] text-[#E65100] mt-2.5">
              You have read-only access to this country, so you cannot scope it. A champion or a
              manager for {vm.countryLabel} can.
            </p>
          )}
        </div>
      )}

      {vm.isScoped && (
        <>
          <div className="flex gap-2.5 mb-3.5">
            <div className="flex-1 bg-white rounded-lg px-3.5 py-3 border-l-4 border-l-sns-green shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
              <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
                {vm.cycleLabel} Target ({vm.coverageTargetPct}%)
              </div>
              <div className="text-[16px] font-bold text-sns-green mt-0.5">
                ≥ {vm.quarterTargetLabel} in SOAs received
              </div>
            </div>
            <div className="flex-1 bg-white rounded-lg px-3.5 py-3 border-l-4 border-l-sns-grey shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
              <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
                Year-End Target ({vm.yearEndTargetPct}%)
              </div>
              <div className="text-[16px] font-bold text-sns-grey mt-0.5">
                ≥ {vm.yearEndTargetLabel} in SOAs received
              </div>
            </div>
            <div className="flex-1 bg-white rounded-lg px-3.5 py-3 border-l-4 border-l-[#1565C0] shadow-[0_1px_3px_rgba(0,0,0,0.07)]">
              <div className="text-[10px] text-sns-grey uppercase tracking-[0.5px] font-bold">
                Vendors In Scope
              </div>
              <div className="text-[16px] font-bold text-[#1565C0] mt-0.5">
                {vm.totalCount} suppliers · {vm.unreachableCount} with no email
              </div>
            </div>
          </div>

          <TableToolbar table={vm.scopingTable} placeholder="Filter by vendor name or number" />

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
            {vm.scopingTable.isEmpty && (
              <div className="px-3.5 py-6 text-center text-[12px] text-sns-grey">
                {vm.scopingTable.rangeLabel}
              </div>
            )}
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
        </>
      )}
    </div>
  );
}
