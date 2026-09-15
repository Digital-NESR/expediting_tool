/* The SCAI side panel is static markup, so it stays a server component:
   none of it (nor the four icons it uses) needs to reach the browser. */

import { Sparkles, ScanSearch, BookOpen, Building2 } from 'lucide-react';

const WHY_SCAI = [
  "Trained on NESR's internal data, not generic AI",
  'Answers in seconds, not email chains',
  'Always up to date with the latest policies and supplier data',
];

export default function ScaiPanel() {
  return (
    <aside className="w-80 shrink-0">
      <div className="h-[540px] flex flex-col gap-4 bg-[#f0f9f4] border border-[#b6ddc8] rounded-2xl p-6 overflow-hidden">
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
        <p className="text-xs text-slate-400">3 specialized agents, one platform</p>

        {/* Agent cards */}
        <div className="flex flex-col gap-3">
          <div className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60">
            <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
              <ScanSearch className="w-4 h-4 text-[#307c4c]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">Materials AI</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                Duplicate checks, VDC stock lookups, and new material creation support
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60">
            <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
              <BookOpen className="w-4 h-4 text-[#307c4c]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">SC Policy AI</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                Instant answers from NESR&apos;s internal freight, warehouse, compliance, and field
                operations policies
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start bg-white/70 rounded-xl p-3 border border-[#b6ddc8]/60">
            <div className="w-8 h-8 rounded-lg bg-[#307c4c]/10 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-[#307c4c]" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-800">SourceGuide AI</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">
                Find approved suppliers, check compliance status, and access purchase history across
                countries
              </p>
            </div>
          </div>
        </div>

        {/* Divider */}
        <hr className="border-[#b6ddc8]/50" />

        {/* Why SCAI? */}
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

        {/* Divider */}
        <hr className="border-[#b6ddc8]/50" />

        {/* Available 24/7 badge */}
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
    </aside>
  );
}
