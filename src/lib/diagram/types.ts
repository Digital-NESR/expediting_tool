/**
 * A declarative process diagram: what you write, and what you get back.
 *
 * Nothing in `src/lib/diagram` knows what a supply chain is. A spec says how a lane
 * arranges its own boxes and where that lane sits relative to the others; `layoutProcess`
 * turns that into absolute coordinates. The point is not auto-layout -- a graph library
 * would fight the slide this diagram reproduces -- it is that the arithmetic lives in one
 * place instead of being spread across two dozen hand-typed numbers that have to be
 * re-derived by hand every time a stage moves.
 *
 * The thing that makes it worth doing: position comes from ARRAY ORDER, never an index.
 * Adding a stage is inserting a string, and everything anchored to that lane moves with it.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * How a lane arranges its own boxes, in lane-local coordinates.
 *
 * `row` and `column` are degenerate grids and could be dropped, but
 * `['source', 'contract', 'catalog']` reads better than `[['source'], ['contract'],
 * ['catalog']]` and a reviewer scanning the file should see a list, not nested arrays.
 */
export type LaneLayout =
  | { kind: 'row'; stageIds: string[] }
  | { kind: 'column'; stageIds: string[] }
  /** Ordered rows of ordered ids; `null` leaves a cell empty. */
  | { kind: 'grid'; rows: (string | null)[][] };

/** Where a lane's content starts horizontally. */
export type AnchorX =
  | { at: 'canvas-centre' }
  /** Content's left edge meets this stage's left edge. */
  | { at: 'stage-left'; stageId: string }
  /** Content is centred on this stage. */
  | { at: 'stage-centre'; stageId: string }
  /**
   * One of THIS lane's boxes is centred on a box of another's.
   *
   * `stage-centre` centres the whole lane, which is right for a column descending into
   * the spine and wrong for a row: Source to Catalog ends at Catalog, and it is Catalog
   * that feeds Supplier Assessment, so centring the row would leave that connector
   * running diagonally across two other boxes.
   */
  | { at: 'align-stages'; mine: string; onto: string };

/** Where a lane's band starts vertically. */
export type AnchorY =
  | { at: 'top'; offset: number }
  /** Below another lane's band, by `gap`. */
  | { at: 'below'; laneId: string; gap: number };

export interface LaneSpec {
  id: string;
  label: string;
  /** Stroke and text. */
  colour: string;
  /** Fill behind the band. */
  tint: string;
  /** Which way a crawling dash travels along this lane's connectors. */
  flow: 'forward' | 'reverse';
  /** This lane's connectors carry the dash at rest. At most one per process. */
  restFlow?: boolean;
  /** Beside the process rather than in it; excluded from coverage. */
  aside?: boolean;

  anchorX: AnchorX;
  anchorY: AnchorY;
  layout: LaneLayout;

  nodeW: number;
  nodeH: number;
  gutterX: number;
  gutterY: number;
  /** Air between the band's edge and its content. `top` also holds the lane's own label. */
  pad: { x: number; top: number; bottom: number };
  /** The band spans the canvas rather than its content. */
  stretch?: boolean;
  /** Pills over subsets of this lane's stages, each spanning exactly the ones it names. */
  groups?: { id: string; label: string; stageIds: string[] }[];
}

export interface StageSpec {
  id: string;
  laneId: string;
  label: string;
  /**
   * Whatever sits on this box. The engine never looks inside them -- it does not know
   * these are tools, which is what lets a different process map put something else here.
   */
  toolIds?: string[];
  systems?: string[];
  /** Override the lane's node width, for the one box that has to be wider. */
  w?: number;
}

/**
 * Routing as intent rather than coordinates.
 *
 * Three edges in the supply-chain map need to bend. Expressing where they bend in absolute
 * units is how one of them came to sit below the bottom of the canvas, drawn off the page
 * and invisible, with every test passing.
 */
export type EdgeRoute =
  /** Straight, centre to centre. The default and the great majority. */
  | 'direct'
  /** Sideways first, then up or down. Corner at (to.cx, from.cy). */
  | 'h-then-v'
  /** Up or down first, then sideways. Corner at (from.cx, to.cy). */
  | 'v-then-h'
  /** Out, along a lane reserved clear of the whole drawing, and back in. */
  | 'channel-bottom';

export interface EdgeSpec {
  from: string;
  to: string;
  laneId: string;
  dash: 'solid' | 'dashed' | 'dotted';
  /** The caption beside the line. */
  label?: string;
  route?: EdgeRoute;
}

export interface ProcessSpec {
  width: number;
  /** Air under the lowest band. */
  marginBottom: number;
  /** How far the reserved routing channel sits below the drawing. */
  channelGap: number;
  /** The group pill: its height, the air under it, and how far each drawn end is trimmed. */
  groupBand: { h: number; gap: number; inset: number };
  /** The strip at the top of a band reserved for the lane's own name. */
  laneLabelH: number;
  lanes: LaneSpec[];
  stages: StageSpec[];
  edges: EdgeSpec[];
}

/* ─── What comes back ──────────────────────────────────────────────────────────────── */

export interface LaidOutStage extends Rect {
  id: string;
  laneId: string;
  label: string;
  toolIds: string[];
  systems: string[];
}

export interface LaidOutLane {
  id: string;
  label: string;
  colour: string;
  tint: string;
  flow: 'forward' | 'reverse';
  restFlow: boolean;
  aside: boolean;
  /** The band, which is also the camera target. */
  box: Rect;
  stageIds: string[];
}

export interface LaidOutGroup {
  id: string;
  label: string;
  laneId: string;
  stageIds: string[];
  /** The true extent of the stages it covers; the view insets what it draws. */
  x: number;
  w: number;
}

export interface LaidOutEdge extends EdgeSpec {
  /** Centre -> corners -> centre, already resolved. The view never routes. */
  points: Point[];
}

export interface LaidOutProcess {
  width: number;
  /** Derived from the content, never declared. */
  height: number;
  /** Where a group pill sits. One row, shared by every grouped lane. */
  groupBandY: number;
  groupBand: ProcessSpec['groupBand'];
  lanes: LaidOutLane[];
  stages: LaidOutStage[];
  edges: LaidOutEdge[];
  groups: LaidOutGroup[];
  laneById: Record<string, LaidOutLane>;
  stageById: Record<string, LaidOutStage>;
  /** The rect the drawing actually occupies, which is not the canvas. */
  content: Rect;
}
