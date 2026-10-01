import Image from 'next/image';

/**
 * The marks that identify each tool.
 *
 * One definition per tool, used by the home page card and by the tool's own header. They used to
 * be written out separately in each place, which is how PO Expediting ended up showing a box on
 * its card and a split-panel glyph in its header, and how TI-TE ended up with a wordmark inside
 * and an icon outside. Somebody arriving from the home page should see the thing they clicked.
 *
 * Every mark draws in `currentColor` and takes a className, so the same component serves a green
 * glyph on a tinted square and a white one on a solid square.
 */

interface MarkProps {
  className?: string;
  /** For a brand colour that is not a Tailwind token, such as TI-TE's own green. */
  style?: React.CSSProperties;
}

/** PO Expediting — a package in transit. */
export function PoExpeditingMark({ className = 'h-6 w-6', style }: MarkProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"
      />
    </svg>
  );
}

/** TI-TE — temporary import and export, drawn as a globe of trade routes. */
export function TiteMark({ className = 'h-6 w-6', style }: MarkProps) {
  return (
    <svg
      className={className}
      style={style}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.75}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

/**
 * RFx Officer — a supplied artwork rather than a drawn glyph.
 *
 * An image, so unlike the others it cannot take its colour from the surrounding text. It carries
 * its own green and therefore wants a light background, not a solid one.
 */
export function RfxOfficerMark({
  className = 'h-6 w-6',
  size = 48,
}: MarkProps & { size?: number }) {
  return (
    <Image
      src="/rfx-officer-logo.png"
      alt=""
      width={size}
      height={size}
      className={`${className} object-contain`}
      aria-hidden
    />
  );
}

/**
 * ProcureGuard — its own artwork, which the tool has always used in-app while the home card drew a
 * generic document glyph instead. The asset is a JPEG on white, so it wants a white ground rather
 * than the tinted square the other marks sit on.
 */
export function ProcureGuardMark({
  className = 'h-6 w-6',
  size = 96,
}: MarkProps & { size?: number }) {
  return (
    <Image
      src="/procureguard-logo.jpg"
      alt=""
      width={size}
      height={size}
      className={`${className} object-contain`}
      aria-hidden
    />
  );
}

/**
 * ShipWaves, a ship's wheel inside a map pin.
 *
 * Drawn rather than served as a file, like the other marks: the same glyph serves the home page
 * card and anywhere else the tool is named, and an SVG takes the colour it is given instead of
 * needing one copy per background.
 *
 * The disc behind the wheel is a HOLE, punched through the pin with an even-odd fill, not a white
 * circle painted on top. A hardcoded white worked on the tinted tile and disappeared on a solid
 * one, where the mark is drawn in white and every layer became the same colour. As a hole it takes
 * whatever is behind it, so the wheel reads on any tile.
 *
 * Six spokes, not the eight a real wheel has. This renders at 24px on the card, and at that size
 * eight closed into a dark blur; six keeps daylight between them.
 */
export function ShipWavesMark({ className = 'h-6 w-6', style }: MarkProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.6c-4.2 0-7.6 3.37-7.6 7.53 0 5.24 6.62 12.27 6.9 12.56a.96.96 0 0 0 1.4 0c.28-.29 6.9-7.32 6.9-12.56C19.6 4.97 16.2 1.6 12 1.6Zm0 3.06a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"
        fill="currentColor"
      />
      {/* The wheel, inside the hole. The rim sits clear of the edge so it never merges with it. */}
      <circle cx="12" cy="9.16" r="2.05" fill="none" stroke="currentColor" strokeWidth="1" />
      <circle cx="12" cy="9.16" r="0.62" fill="currentColor" />
      {[0, 60, 120].map((deg) => (
        <line
          key={deg}
          x1="12"
          y1="5.95"
          x2="12"
          y2="12.37"
          stroke="currentColor"
          strokeWidth="0.95"
          strokeLinecap="round"
          transform={`rotate(${deg} 12 9.16)`}
        />
      ))}
    </svg>
  );
}

/**
 * Travel Portal - a globe with a plane leaving it.
 *
 * The two halves are kept apart rather than overlapped: at 24px a plane crossing the globe's
 * meridians turns into a smudge, and there is no background colour a halo could be punched in,
 * because the same glyph sits on a tinted square and on a solid one. So the globe takes the
 * lower-left and the plane the upper-right corner the globe does not reach, and nothing overlaps.
 *
 * The plane is an aircraft silhouette rather than the obvious paper-plane triangle: rendered at the
 * size the card actually uses, a filled triangle reads as a cursor arrow, and wings are what makes
 * it an aeroplane.
 */
export function TravelPortalMark({ className = 'h-6 w-6', style }: MarkProps) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
        <circle cx="10" cy="14" r="6.8" />
        {/* Meridian and equator: the two lines that make a circle read as a globe. */}
        <ellipse cx="10" cy="14" rx="2.92" ry="6.8" />
        <line x1="3.2" y1="14" x2="16.8" y2="14" />
      </g>
      <path
        d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"
        fill="currentColor"
        transform="translate(12.4 0.1) scale(0.46)"
      />
    </svg>
  );
}
