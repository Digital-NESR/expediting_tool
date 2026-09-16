import Image from 'next/image';
import type { ViewModel } from '../types';

/**
 * The tool's header bar.
 *
 * It used to carry a "Viewing as:" dropdown that switched between champion, manager and director.
 * That was a prototype affordance — the role is a grant now, so the bar states what the signed-in
 * person actually is rather than offering to change it. The menu button is what opens the
 * sidebar, which is a slide-over drawer like every other NESR tool's.
 */
export default function Navbar({
  vm,
  onOpenSidebar,
}: {
  vm: ViewModel;
  onOpenSidebar: () => void;
}) {
  return (
    <nav className="bg-sns-green h-[54px] flex items-center px-[18px] gap-3 shrink-0 shadow-[0_2px_8px_rgba(0,0,0,0.2)] z-10">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open menu"
        title="Menu"
        className="shrink-0 rounded-md p-1.5 text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 overflow-hidden">
        <Image src="/nesr-logo-circle.png" alt="NESR" width={26} height={26} />
      </div>
      <div className="border-l border-l-[rgba(255,255,255,0.3)] pl-3">
        <div className="text-[rgba(255,255,255,0.65)] text-[10px] tracking-[0.3px]">
          SOA Consolidation Portal
        </div>
      </div>
      <div className="bg-[rgba(0,0,0,0.18)] rounded-[20px] px-2.5 py-[3px] text-[11px] text-[rgba(255,255,255,0.9)] font-bold tracking-[0.5px]">
        Q3 2026
      </div>
      <div className="flex-1" />
      <div className="text-right leading-tight min-w-0">
        <div className="text-white text-[12px] font-bold truncate">{vm.viewerName}</div>
        <div className="text-[rgba(255,255,255,0.65)] text-[10px] truncate">
          {vm.roleLabel} · {vm.roleCountry}
        </div>
      </div>
      <div className="bg-[rgba(255,255,255,0.18)] rounded-full w-8 h-8 flex items-center justify-center text-white font-bold text-[13px] shrink-0">
        {vm.viewerInitials}
      </div>
    </nav>
  );
}
