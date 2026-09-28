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
