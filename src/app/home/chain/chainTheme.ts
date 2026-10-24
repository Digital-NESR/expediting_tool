/**
 * The chain's shared drawing vocabulary: colours, and the two rules for sizing type.
 *
 * Pulled out of ProcessChain.tsx when that file passed a thousand lines. Every piece of the
 * diagram reads from here, so there is one place where a decision about how the thing looks
 * is written down, and no second copy to drift. The test suite imports BOX from here too --
 * it used to keep its own transcription with a comment admitting as much.
 */

import { TOOLS, type ToolDef } from '../tools';

export const INK = '#1f2d2a';
export const MUTED = '#94a3b8';
export const GAP_STROKE = '#cbd5e1';

/* Edge captions are hidden until there is room for them: they float free of any box and at
   the overview they land on top of each other and on the lines they annotate. Tool names used
   to be gated the same way and are not any more -- now that they scale with their chip they
   are proportionally legible at every zoom, and a row of anonymous pills was its own kind of
   unreadable. */
export const SHOW_EDGE_LABELS = 2.1;

/** How far in the pointer pulls the camera, and the range the wheel may set that to. */
export const FOLLOW_SCALE = 2.6;
export const FOLLOW_MIN = 1.3;

/**
 * Type that labels a REGION of the canvas, in rendered CSS pixels: [at the overview,
 * approached when fully zoomed].
 *
 * A lane name and an edge caption float free -- a lane band spans the whole canvas and a
 * caption sits on open line -- so nothing bounds them but the drawing, and they are sized for
 * the screen. `grow` interpolates on 1 - 1/scale, reaching the upper figure asymptotically,
 * which is what stops a heading becoming forty six pixels of shouting at 6x.
 *
 * The phase heading is NOT here: its band is a fixed 32-unit pill, so it is bounded and
 * belongs with the box type below. It was in this list and came out visibly smaller than the
 * stage names underneath it, which is backwards for a heading.
 */
export const SIZES = {
  lane: [12.5, 22],
  edge: [9.5, 15],
} as const;

/**
 * Type INSIDE a stage box, in canvas units, which is to say a fixed fraction of the box.
 *
 * The opposite rule to SIZES above, and the distinction is the whole point. A stage box is
 * 120 canvas units tall whatever the zoom; sizing its contents in screen pixels meant that
 * going in made the box bigger and left the writing exactly where it was, so a stage ended up
 * as a large empty rectangle with a word adrift in the middle of it. Text bounded by a box
 * belongs to that box and should scale with it. Text labelling open canvas should not.
 *
 * The figures are chosen against the 120-unit box: a three-line name, a gap, and a chip come
 * to about 110 of it including padding, so a full stage is comfortably filled and a one-word
 * stage reads as generous padding rather than a hole.
 */
export const BOX = {
  label: 18,
  /** Sized against PHASE_BAND.h, the 32-unit pill it sits in. */
  phase: 19,
  /** Line spacing, as a multiple of the label size. */
  leading: 1.12,
  chipH: 22,
  chipText: 13,
  chipGap: 5,
  gapNote: 14,
  /** Between the name and whatever follows it. */
  blockGap: 10,
  pad: 9,
} as const;

export type SizeKey = keyof typeof SIZES;
export type Sizes = Record<SizeKey, number>;

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));
