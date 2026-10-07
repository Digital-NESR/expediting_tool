/**
 * A line-art motif per worksheet, for the header.
 *
 * Eight releases, eight marks, each drawn from what its release is actually about: links for the
 * foundation, a demand curve, a replenishment sawtooth, a trade route, a compass for strategy, a
 * design lattice, a systems stack, a gauge for measurement. They exist so the eight sheets are
 * distinguishable at a glance, which a repeated generic icon would not achieve.
 *
 * Deliberately stroke-only and `currentColor`, so each one takes the module's own colour and
 * nothing has to be re-exported when a track is recoloured. Decorative, so `aria-hidden`.
 */
export default function WorksheetMark({
  worksheetKey,
  className = 'h-16 w-16',
}: {
  worksheetKey: string;
  className?: string;
}) {
  const draw = MARKS[worksheetKey] ?? MARKS.l1;
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {draw}
    </svg>
  );
}

const MARKS: Record<string, React.ReactNode> = {
  /* Foundation — three links of a chain, which is the thing the whole level names. */
  l1: (
    <>
      <rect x="4" y="24" width="20" height="16" rx="8" />
      <rect x="22" y="24" width="20" height="16" rx="8" />
      <rect x="40" y="24" width="20" height="16" rx="8" />
    </>
  ),

  /* Plan the Demand — a demand history with a forecast running past the last actual. */
  'l2-r1': (
    <>
      <path d="M6 46c6-4 8-16 14-16s8 12 14 12" />
      <path d="M34 42c6 0 8-20 14-20s6 10 10 10" strokeDasharray="3 3" />
      <path d="M6 54h52" opacity={0.35} />
      <circle cx="34" cy="42" r="2.4" />
    </>
  ),

  /* Plan the Supply — the sawtooth of stock drawn down and replenished, over a reorder line. */
  'l2-r2': (
    <>
      <path d="M6 20v26l10-16v16l10-16v16l10-16v16l10-16v16" />
      <path d="M6 38h52" strokeDasharray="3 3" opacity={0.5} />
      <path d="M6 52h52" opacity={0.35} />
    </>
  ),

  /* Source, Move and Trade — a route between two nodes, crossing a boundary. */
  'l2-r3': (
    <>
      <circle cx="12" cy="44" r="5" />
      <circle cx="52" cy="20" r="5" />
      <path d="M17 42c10-2 14-14 30-18" strokeDasharray="4 3" />
      <path d="M32 8v48" opacity={0.35} />
      <path d="M28 30h8" />
    </>
  ),

  /* Develop the Strategy — a compass rose: the level is about choosing a direction. */
  'l3-r1': (
    <>
      <circle cx="32" cy="32" r="22" />
      <path d="M32 10v8M32 46v8M10 32h8M46 32h8" opacity={0.5} />
      <path d="M24 40l6-14 10-4-6 14z" />
    </>
  ),

  /* Design the Supply Chain — a network being configured, one node still unplaced. */
  'l3-r2': (
    <>
      <circle cx="32" cy="16" r="4" />
      <circle cx="14" cy="42" r="4" />
      <circle cx="50" cy="42" r="4" />
      <circle cx="32" cy="50" r="4" strokeDasharray="3 2" />
      <path d="M30 20L16 38M34 20l14 18M18 43h28" />
      <path d="M32 46V20" opacity={0.4} strokeDasharray="3 2" />
    </>
  ),

  /* Technology and Projects — a stack of systems with a project line running through it. */
  'l3-r3': (
    <>
      <rect x="10" y="12" width="44" height="12" rx="3" />
      <rect x="10" y="28" width="44" height="12" rx="3" />
      <rect x="10" y="44" width="44" height="12" rx="3" />
      <circle cx="18" cy="18" r="1.6" fill="currentColor" />
      <circle cx="18" cy="34" r="1.6" fill="currentColor" />
      <circle cx="18" cy="50" r="1.6" fill="currentColor" />
      <path d="M44 18v16M44 34v16" opacity={0.5} />
    </>
  ),

  /* Measure, Analyse and Improve — a gauge with its needle past the midpoint. */
  'l3-r4': (
    <>
      <path d="M8 44a24 24 0 0 1 48 0" />
      <path d="M32 44L46 28" />
      <circle cx="32" cy="44" r="3" fill="currentColor" stroke="none" />
      <path d="M12 36l-4-2M32 20v-4M52 36l4-2" opacity={0.5} />
    </>
  ),
};
