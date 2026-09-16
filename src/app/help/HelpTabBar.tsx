'use client';

/*
 * The underlined tab strip above the video players on the help pages.
 *
 * The brand colour arrives as a prop because each tool owns its own green, and
 * only the selected tab is painted with it.
 *
 * The two knobs below exist because the two pages this replaces were not quite
 * identical, and the audit asked for de-duplication rather than a redesign —
 * each one carries a difference a reader can see rather than flattening it.
 */

export interface HelpTab<K extends string> {
  key: K;
  label: string;
}

export default function HelpTabBar<K extends string>({
  tabs,
  active,
  onSelect,
  brand,
  boldActiveTab = false,
  inactive = 'slate-hover',
}: {
  tabs: readonly HelpTab<K>[];
  active: K;
  onSelect: (key: K) => void;
  /** Hex colour for the selected tab's label and underline. */
  brand: string;
  /** TI-TE thickens its selected tab. RFx Officer leaves it at the base weight. */
  boldActiveTab?: boolean;
  /**
   * How unselected tabs are painted. 'slate-hover' is TI-TE's: the Tailwind
   * slate-400 that lifts towards slate-700 on hover. 'dim' is RFx Officer's: a
   * flat #94a3b8 that ignores hover. The two are a shade apart — slate-400 is
   * oklch in Tailwind v4 and lands on #90a1b9 — so they are kept distinct
   * rather than rounded together.
   */
  inactive?: 'slate-hover' | 'dim';
}) {
  return (
    <div className="flex gap-0.5 border-b border-slate-200 mb-6">
      {tabs.map(({ key, label }) => {
        const isActive = key === active;
        const dim = inactive === 'dim';
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`px-4 py-2.5 text-[13.5px] font-medium transition-colors border-b-2 -mb-px ${
              isActive
                ? boldActiveTab
                  ? 'font-semibold'
                  : ''
                : dim
                  ? ''
                  : 'text-slate-400 border-transparent hover:text-slate-700'
            }`}
            style={
              isActive
                ? { color: brand, borderColor: brand }
                : dim
                  ? { color: '#94a3b8', borderColor: 'transparent' }
                  : undefined
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
