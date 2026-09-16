import type { ScreenProps } from '../types';

export default function Sidebar({ vm }: ScreenProps) {
  return (
    <aside className="w-[205px] bg-[#151C18] flex flex-col shrink-0 overflow-y-auto px-2.5 py-3">
      <div className="bg-[rgba(42,126,79,0.15)] border border-[rgba(42,126,79,0.3)] rounded-[7px] px-[11px] py-2.5 mb-3">
        <div className="text-[rgba(255,255,255,0.4)] text-[9px] uppercase tracking-[1px] mb-0.5">
          Active Scope
        </div>
        <div className="text-white text-[13px] font-bold leading-[1.3]">{vm.roleCountry}</div>
        <div className="text-[rgba(255,255,255,0.5)] text-[10px] mt-px">{vm.roleLabel}</div>
      </div>

      {vm.navItems.map((nav) => (
        <div
          key={nav.id}
          onClick={nav.onClick}
          className={`flex items-center gap-2 px-[11px] py-2 rounded-md mb-0.5 cursor-pointer text-[12px] ${
            nav.isActive
              ? 'font-bold bg-[rgba(42,126,79,0.3)] text-white'
              : 'font-normal bg-transparent text-[rgba(255,255,255,0.6)]'
          }`}
        >
          <span className="flex-1">{nav.label}</span>
          {nav.hasBadge && (
            <span className="bg-[#E65100] text-white rounded-[10px] px-1.5 py-px text-[10px] font-bold shrink-0">
              {nav.badge}
            </span>
          )}
        </div>
      ))}

      <div className="flex-1" />
      <div className="p-2.5 border-t border-t-[rgba(255,255,255,0.07)] mt-2.5">
        <div className="text-[rgba(255,255,255,0.3)] text-[9px] leading-[1.7]">
          NESR-SC-01-GR2PAY
        </div>
        <div className="text-[rgba(255,255,255,0.3)] text-[9px]">Rev.01 · Jul 2024</div>
      </div>
    </aside>
  );
}
