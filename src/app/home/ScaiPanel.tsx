/* The SCAI side panel is static markup, so it stays a server component:
   none of it (nor the icons it uses) needs to reach the browser. */

import { Sparkles, ScanSearch, BookOpen, Building2, PackageSearch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * The agents, as data.
 *
 * They were three near-identical blocks of markup, which is why the count in the line above them
 * had to be remembered separately and why adding a fourth meant copying twelve lines of styling.
 * The count is derived now, so it cannot disagree with the list under it.
 */
const AGENTS: { name: string; icon: LucideIcon; blurb: string }[] = [
  {
    name: 'Materials AI',
    icon: ScanSearch,
    blurb: 'Duplicate checks, VDC stock lookups, and new material creation support',
  },
  {
    name: 'SC Policy AI',
    icon: BookOpen,
    blurb:
      "Instant answers from NESR's internal freight, warehouse, compliance, and field operations policies",
  },
  {
    name: 'SourceGuide AI',
    icon: Building2,
    blurb:
      'Find approved suppliers, check compliance status, and access purchase history across countries',
  },
  {
    name: 'Track My Order',
    icon: PackageSearch,
    blurb:
      'Give it a PR, a PO or a shipment and it says where the order actually is: awaiting approval, under release, released, open on the PO, in transit or received',
  },
];

const WHY_SCAI = [
  "Trained on NESR's internal data, not generic AI",
  'Answers in seconds, not email chains',
  'Always up to date with the latest policies and supplier data',
];

export default function ScaiPanel() {
  return (
    /* No fixed height. It carried h-[540px] with overflow-hidden, and the content had already
       outgrown it: the third agent was being cut off mid-sentence and everything below it was
       simply not on the page. A panel that silently drops its own content as it grows is a panel
       that will do it again with the next agent. */
    <div className="flex flex-col gap-4 rounded-2xl border border-[#b6ddc8] bg-[#f0f9f4] p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-[#307c4c]" />
        <p className="text-[10px] font-semibold tracking-widest uppercase text-[#307c4c]">
          AI Assistant
        </p>
      </div>

      <div className="flex items-center justify-between">
        {/* Opens in this tab; the "Launch SCAI" button opens a new one.
            tabIndex={-1} keeps the pair to a single tab stop, as before. */}
        <a href="https://scai.nesr.com" tabIndex={-1} className="group cursor-pointer">
          <h2 className="text-2xl font-bold text-slate-900 leading-tight group-hover:underline">
            SCAI
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">Supply Chain AI</p>
        </a>
        <a
          href="https://scai.nesr.com"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#307c4c] hover:bg-[#276041] text-white text-xs font-semibold px-4 py-2 rounded-xl text-center transition-colors whitespace-nowrap"
        >
          Launch SCAI
        </a>
      </div>
      <p className="text-xs text-slate-400">
        {AGENTS.length} specialized agents, one platform
      </p>

      <div className="flex flex-col gap-3">
        {AGENTS.map(({ name, icon: Icon, blurb }) => (
          <div
            key={name}
            className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60"
          >
            <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-[#307c4c]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">{name}</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{blurb}</p>
            </div>
          </div>
        ))}
      </div>

      <hr className="border-[#b6ddc8]/50" />

      <div>
        <p className="text-[10px] font-semibold tracking-widest uppercase text-[#307c4c] mb-2">
          Why SCAI?
        </p>
        <ul className="flex flex-col gap-1.5">
          {WHY_SCAI.map((point) => (
            <li key={point} className="flex items-start gap-2 text-[11px] text-slate-500">
              <span className="w-1.5 h-1.5 rounded-full bg-[#307c4c] shrink-0 mt-1" />
              {point}
            </li>
          ))}
        </ul>
      </div>

      <hr className="border-[#b6ddc8]/50" />

      <div className="flex justify-center">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/80 border border-[#b6ddc8]/60 text-[11px] font-medium text-slate-600">
          <span className="w-1.5 h-1.5 rounded-full bg-[#307c4c]" />
          Available 24/7
        </span>
      </div>

      <p className="text-[11px] text-slate-400 leading-relaxed">
        Powered by NESR&apos;s internal data and policy documents.
      </p>
    </div>
  );
}
