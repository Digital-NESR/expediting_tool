'use client';

import { Menu, Receipt } from 'lucide-react';
import type { ViewModel } from '../types';

/**
 * The tool's header bar.
 *
 * White and slim, like SourceGuide's and the rest of the platform's, rather than the solid green
 * band it used to be — a tool whose chrome looks nothing like its neighbours reads as a different
 * product, and this one already sits behind the same sign-in.
 *
 * The mark is the same `Receipt` icon the home page card carries. It used to be the letters "SOA"
 * in a coloured square, which is a placeholder for an icon rather than one: somebody arriving from
 * the home page should see the thing they clicked.
 *
 * It used to carry a "Viewing as:" dropdown that switched between champion and director. That was
 * a prototype affordance — the role is a grant now, so the bar states what the signed-in person
 * actually is rather than offering to change it. The signed-in name sits in the sidebar footer;
 * saying it twice told the reader nothing the second time.
 */
export default function Navbar({
  vm,
  onOpenSidebar,
}: {
  vm: ViewModel;
  onOpenSidebar: () => void;
}) {
  return (
    <nav className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open menu"
        title="Menu"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[9px] bg-sns-green/10">
          <Receipt className="h-[18px] w-[18px] text-sns-green" />
        </span>
        <span className="text-[15px] font-semibold tracking-tight text-slate-900">
          SOA Consolidation
        </span>
      </div>

      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-[3px] text-[11px] font-semibold tracking-[0.3px] text-slate-500">
        {vm.cycleChip}
      </span>

      <div className="flex-1" />
    </nav>
  );
}
