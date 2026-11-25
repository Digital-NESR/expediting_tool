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
    /* Scrolls sideways rather than wrapping: at phone width five tabs do not fit, and a wrapped
       strip both breaks "How it works" over three lines and pushes the page into a horizontal
       scroll of its own. `scrollbar-none` is not used -- an invisible scroller gives no hint
       there is more to the right. `overflow-y-hidden`: with only overflow-x set the strip also
       scrolled vertically by the tabs' -1px overlap, which drew stray up/down arrows. */
    <div className="mb-6 flex gap-0.5 overflow-x-auto overflow-y-hidden border-b border-slate-200">
      {tabs.map(({ key, label }) => {
        const isActive = key === active;
        const dim = inactive === 'dim';
        return (
          <button
            key={key}
            onClick={() => onSelect(key)}
            className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-4 py-2.5 text-[13.5px] font-medium transition-colors ${
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
