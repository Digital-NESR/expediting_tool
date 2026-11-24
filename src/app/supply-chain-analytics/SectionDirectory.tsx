/* The directory of analytics boards. Server-rendered: every card is a plain link, so nothing
   here ships as JavaScript.

   The card is the /home launcher's live tool card (src/app/home/ToolCard.tsx): same container,
   logo tile, type scale, hover and footer, without the favourite star and help link, which
   belong to the launcher. A card opens its board in the same tab; the board links back. */

import Link from 'next/link';
import { sectionHref, type SectionDef } from './sections';

const CARD =
  'group relative flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 text-left transition-all duration-200 cursor-pointer hover:border-[#307c4c] hover:shadow-md hover:shadow-[#307c4c]/10';

function SectionCard({ section }: { section: SectionDef }) {
  return (
    <Link href={sectionHref(section.id)} className={CARD}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#307c4c]/10">
        {section.icon}
      </div>
      <div className="flex-1">
        <h3 className="text-[18px] font-semibold text-slate-900">{section.name}</h3>
        <p className="mt-0.5 text-[13px] font-medium text-slate-400">{section.subtitle}</p>
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{section.description}</p>
      </div>
      <div className="mt-auto flex items-center justify-between">
        {section.adminOnly ? (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
            Admin only
          </span>
        ) : (
          <span
            className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700"
            style={{ border: '1px solid #bbf7d0' }}
          >
            <svg
              className="h-3 w-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
            </svg>
            Travel grant
          </span>
        )}
        <span className="text-sm font-semibold text-[#307c4c] group-hover:underline">Open →</span>
      </div>
    </Link>
  );
}

export default function SectionDirectory({ sections }: { sections: SectionDef[] }) {
  return (
    <section aria-label="Analytics boards">
      <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-wide text-slate-500">
        Boards
      </h2>
      <div className="grid grid-cols-1 content-start gap-6 md:grid-cols-2 xl:grid-cols-3">
        {sections.map((s) => (
          <SectionCard key={s.id} section={s} />
        ))}
      </div>
    </section>
  );
}
