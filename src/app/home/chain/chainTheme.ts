/**
 * The chain's shared drawing vocabulary: colours, and the two rules for sizing type.
 *
 * Pulled out of ProcessChain.tsx when that file passed a thousand lines. Every piece of the
 * diagram reads from here, so there is one place where a decision about how the thing looks
 * is written down, and no second copy to drift. The test suite imports BOX from here too --
 * it used to keep its own transcription with a comment admitting as much.
 */

import { SYSTEM_LABEL, type SystemId } from '@/lib/home/process-chain';
import { TOOLS, type ToolDef } from '../tools';

export const INK = '#1f2d2a';
export const MUTED = '#94a3b8';
export const GAP_STROKE = '#cbd5e1';
/** SAP and Ariba badges. One slate-blue for both: they are the same kind of thing. */
export const SYSTEM_INK = '#5B7A99';

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
 * An edge caption floats free -- it sits on open line, with nothing to bound it but the
 * drawing -- so it is sized for the screen. `grow` interpolates on 1 - 1/scale, reaching the
 * upper figure asymptotically, which is what stops a caption becoming forty six pixels of
 * shouting at 6x.
 *
 * It was a list of two. The lane names left the canvas with the bands they were written in,
 * and live on the filter pills above it now. The phase heading was never here: its pill is a
 * fixed 32 units, so it is bounded and belongs with the box type below.
 */
export const SIZES = {
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

/**
 * How the chips and system badges at the foot of a stage pack.
 *
 * Three of them at full size overflow a 120-unit box -- Source carries SourceGuide, S&S
 * Registry and Ariba -- so a crowded tail tightens rather than spilling. Exported because
 * the layout test has to model this exactly, and a transcribed copy of it in the test file
 * is how the last set of constants drifted.
 */
export function tailMetrics(tailCount: number) {
  const tight = tailCount >= 3;
  return {
    chipH: tight ? 18 : BOX.chipH,
    chipText: tight ? 11 : BOX.chipText,
    chipGap: tight ? 4 : BOX.chipGap,
  };
}

/**
 * The largest a screen-sized label may be in CANVAS units, whatever the element's size.
 *
 * SIZES are rendered pixels converted through `u()`, and `u()` divides by the element's
 * width -- so the smaller the element, the more canvas units one pixel buys. On a narrow
 * card that inverts the intent: a 9.5-pixel caption becomes forty-odd units of canvas and
 * runs across the boxes either side of the line it annotates. The conversion is right, it
 * just needs a ceiling.
 */
export const SCREEN_TYPE_CAP = { edge: 20 } as const;

export type SizeKey = keyof typeof SIZES;
export type Sizes = Record<SizeKey, number>;

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/* ─── The chips on the floor of a station ────────────────────────────────────────────────── */

export interface TailChip {
  key: string;
  kind: 'tool' | 'system';
  label: string;
  /** The width it is MEASURED at, which is not always the width it is drawn at. See below. */
  mw: number;
}

/**
 * Lay a station's chips out in rows, fitting as many to a row as the box is wide.
 *
 * One chip per row was fine while every box was the same 120 units tall. It stopped being
 * fine when the branches became columns: a column is narrow across and ruinously expensive
 * down -- three stacked boxes are most of the drawing's height, and the drawing's height is
 * the only thing that decides how big it lands on screen -- so a branch box is wide and
 * short, and three chips stacked in it do not fit at all.
 *
 * Greedy, left to right, in the order given. A spine box is 160 wide and still gets about
 * one chip per row, so nothing about the main line changes.
 */
export function packChips<T extends { mw: number }>(items: T[], maxW: number, gap: number): T[][] {
  const rows: T[][] = [];
  let row: T[] = [];
  let used = 0;
  for (const item of items) {
    const next = row.length === 0 ? item.mw : used + gap + item.mw;
    if (row.length > 0 && next > maxW) {
      rows.push(row);
      row = [item];
      used = item.mw;
    } else {
      row.push(item);
      used = next;
    }
  }
  if (row.length > 0) rows.push(row);
  return rows;
}

/**
 * How tall a station's chips are, and which of them share a row.
 *
 * Here rather than in the component because the number it returns decides how many lines
 * are left for the station's NAME, and the test that every name fits its box has to arrive
 * at the same answer. A transcribed copy of this arithmetic in the test file is exactly how
 * the last set of these constants drifted from the canvas they described.
 *
 * `mw` assumes every tool chip carries a state glyph, whether or not this particular reader
 * sees one. Measuring the real width would make the packing depend on who is looking: a
 * locked tool's chip is wider, so the same station could wrap to two rows for one person and
 * one for another, and its name would be laid out differently for each of them. The drawn
 * width is still the real one -- the row is positioned from that -- so a chip without a
 * glyph simply leaves a little slack in its row.
 */
export function tailLayout(stage: { w: number; toolIds: string[]; systems?: SystemId[] }) {
  const systems = stage.systems ?? [];
  const tailCount = stage.toolIds.length + systems.length;
  const { chipH, chipText, chipGap } = tailMetrics(tailCount);
  const maxW = stage.w - 12;

  const chips: TailChip[] = [
    ...stage.toolIds.map((id) => {
      const tool = TOOL_BY_ID[id];
      const label = typeof tool?.name === 'string' ? tool.name : id;
      return {
        key: id,
        kind: 'tool' as const,
        label,
        mw: Math.min(maxW, label.length * chipText * 0.58 + 14 + chipText + 4),
      };
    }),
    ...systems.map((sys) => {
      const label = SYSTEM_LABEL[sys];
      return {
        key: sys,
        kind: 'system' as const,
        label,
        mw: Math.min(maxW, label.length * chipText * 0.62 + 18),
      };
    }),
  ];

  const rows = tailCount === 0 ? [] : packChips(chips, maxW, chipGap);
  const tailH =
    tailCount === 0 ? BOX.gapNote * 1.3 : rows.length * chipH + (rows.length - 1) * chipGap;

  return { chips, rows, tailH, chipH, chipText, chipGap };
}
