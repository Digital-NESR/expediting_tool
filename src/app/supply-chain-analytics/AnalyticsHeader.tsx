import Link from 'next/link';
import { ArrowLeft, BarChart3 } from 'lucide-react';
import type { SectionDef } from './sections';

/**
 * The header on every Supply Chain Analytics page. On the directory the back link goes home; on
 * a board it goes back to the directory, and the board's name follows the tool's.
 */
export default function AnalyticsHeader({
  section,
  adminPreview,
}: {
  section?: SectionDef;
  adminPreview: boolean;
}) {
  return (
    <header className="hb-print-hide flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-6">
      <Link
        href={section ? '/supply-chain-analytics' : '/home'}
        className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" />
        {section ? 'All boards' : 'Back to Home'}
      </Link>
      <div className="h-5 w-px shrink-0 bg-gray-200" />
      <div className="flex min-w-0 items-center gap-2">
        <BarChart3 className="h-4 w-4 shrink-0 text-[#307c4c]" />
        {section ? (
          <>
            <Link
              href="/supply-chain-analytics"
              className="hidden shrink-0 text-sm font-medium text-slate-500 transition-colors hover:text-slate-800 sm:inline"
            >
              Supply Chain Analytics
            </Link>
            <span className="hidden text-slate-300 sm:inline">/</span>
            <span className="truncate text-sm font-semibold text-slate-900">{section.name}</span>
          </>
        ) : (
          <span className="truncate text-sm font-semibold text-slate-900">
            Supply Chain Analytics
          </span>
        )}
      </div>
      {adminPreview && (
        <span className="ml-2 shrink-0 rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-400">
          Admin Preview
        </span>
      )}
    </header>
  );
}
