/**
 * The supply chain as a drawable graph, and where each tool sits on it.
 *
 * The home page's card grid answers "what do we have". It cannot answer the two questions
 * behind it: where in the chain each of those sits, and what has no system at all. This is
 * the model for the view that can -- the four routes from the `Supply Chain Process Cycles
 * & Systems` slide, every stage on them, and the tool ids pinned to each.
 *
 * IT IS A ROUTE MAP, not a set of swimlanes, and the difference is the only design decision
 * in the file that the arithmetic below will not explain. A swimlane says "these things are
 * in the same container": it draws a boundary and leaves what passes between containers as
 * an afterthought. Everything interesting about a supply chain is what passes between them
 * -- Source to Catalog feeding Supplier Assessment, Logistics leaving at Supplier
 * Acknowledgement and rejoining at Delivery, Inventory tied to the spine at both ends.
 * So the colour is in the LINE and not in a band behind it, the gutter between stages is
 * wide enough that a line is visible crossing it, and every point where one route meets
 * another is marked. The stages are stations; the lanes are lines.
 *
 * Everything here is declared, not placed: `SUPPLY_CHAIN_SPEC` says how each lane arranges
 * its own boxes and where it sits relative to the others, and `layoutProcess` works out the
 * coordinates. Position comes from array order, so adding a stage is inserting a string.
 *
 * Pure data and pure functions. Nothing here imports React or touches the DOM, so the shape
 * of the chain is testable on its own -- which matters most for the tool mapping, where the
 * test fails the day somebody adds a tool and does not place it.
 */

import { layoutProcess } from '@/lib/diagram/layout';
import type { EdgeRoute, EdgeSpec, ProcessSpec, StageSpec } from '@/lib/diagram/types';

/**
 * The canvas every coordinate below is expressed in.
 *
 * The WIDTH is forced: eleven spine stages side by side, and a stage can therefore never be
 * much more than eight percent of it. The HEIGHT is the free variable, and it is what decides
 * how big the drawing lands on screen -- the <svg> is given the canvas aspect ratio, so a
 * shorter canvas makes a shorter, and therefore proportionally smaller, element. It was 1000
 * with 76-unit stages, which worked out at a 47-pixel-tall box on a normal monitor: too short
 * for two lines of a name and a tool chip, so names were being shrunk towards illegibility or
 * clipped outright. Taller stages in a taller canvas buy back the room.
 */
/*
 * The canvas is a shape, not a size -- what matters is its RATIO to the card, because the
 * drawing is scaled to fit inside it. Showing the whole chain at once means height is the
 * binding constraint, so the ratio decides how big the thing lands: too tall and the
 * drawing is small between two side margins; too wide and it is small between a top and a
 * bottom one. The card is about 1600 by 490, so the target is a shade over 3.2 and the
 * height below is what was spent to reach it.
 */
export const CHAIN_WIDTH = 2220;

/** Every stage is the same size, so the eye reads position as meaning and not importance. */
const NODE_H = 120;
/**
 * Narrower boxes, and a gutter three times the old one.
 *
 * This is the change that makes the drawing a route map rather than a row of tiles. A
 * connector is drawn from one box's centre to the next's, so the only part of it anybody
 * ever sees is the piece crossing the gutter -- at a gutter of 12 that was a stub, and the
 * lines between stages read as joins rather than as routes. At 36 there is a visible run
 * of track between every pair of stations, which is what lets a reader follow a line
 * across the picture and see where it meets another.
 *
 * Narrowing the box to pay for it costs nothing on screen: the drawing as a whole is a
 * third shorter than it was, so it renders larger, and a 160-unit box at the new scale is
 * wider in pixels than a 180-unit box was at the old one.
 */
const SPINE_W = 160;
const SPINE_GUTTER = 36;

/* Source to Catalog's three boxes are wider than the spine's: the lane is short, so there
   is room, and it keeps "Catalog" from looking like a spine stage that wandered upwards. */
const S2C_W = 190;

/* ─── The vertical bands ──────────────────────────────────────────────────────────────────
   Top to bottom, and everything else derives from them: a lane's box, the stages inside it
   and the connectors between them all move together when one of these changes. They were
   two dozen loose literals, which is how a hand-placed waypoint came to sit at y=955 on a
   930-unit canvas -- off the bottom of the drawing, invisible, and true until somebody
   measured it. */
/** The phase bands, which sit inside the top of the spine lane rather than above it. */
/* `inset` trims each end of the DRAWN pill, so two fully rounded caps have visible air
   between them. The band's own row is computed; only these two are chosen. */
const PHASE_BAND_H = 32;
const PHASE_BAND_INSET = 5;
/**
 * The air between one row of stations and the next.
 *
 * This is where the junctions are drawn, so it is not slack: a line leaving the spine turns
 * in here, the caption saying why sits on the turn, and the interchange rings sit on the two
 * box edges it runs between. Below about 90 units the turn, the caption and the two rings
 * are on top of each other.
 */
const ROW_GAP = 92;

/* Logistics and Inventory share one row. They do not overlap horizontally, so they cost one
   gap between them rather than two -- which is the whole reason the drawing is three rows
   tall and not four. */
/* 98, so the clear band between the spine and the row below it is exactly 120 units:
   the two routes crossing it turn at a half and a quarter of the way down, and a round
   number is the difference between a turn at 480 and a turn at 481.5. */
const LOWER_ROW_GAP = 98;

/** Air inside a row, above and below the boxes, now that no band is drawn behind them. */
const ROW_PAD_TOP = 10;
const ROW_PAD_BOTTOM = 12;

export type LaneId = 'source-to-catalog' | 'demand-to-pay' | 'logistics' | 'inventory';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Lane {
  id: LaneId;
  label: string;
  /** The route's own colour: its line, its interchange rings and its name on the key. */
  colour: string;
  /** The lane's own bounding box, which is also its camera target. */
  box: Rect;
  /**
   * Which way the crawling dash travels along this lane's connectors.
   *
   * An edge is authored `from` the stage the drawing puts first, which is a statement about
   * the geometry and not about the work. On two lanes the two disagree: Source to Catalog is
   * drawn top-down into the spine but is read as feeding it from the catalog back up, and
   * Inventory is drawn left to right while goods travel the other way through it. Reversing
   * the animation is the honest fix -- re-authoring the edges would flip their captions and
   * their endpoints to make a decoration come out right.
   */
  flow: 'forward' | 'reverse';
  /**
   * Whether this lane's connectors carry the crawling dash when nothing is focused.
   *
   * The backbone is the thing that flows, and saying so here rather than in the component
   * is what lets a second process map name a different backbone. At most one lane.
   */
  restFlow?: boolean;
  /**
   * This lane sits BESIDE the process rather than in it.
   *
   * Its boxes are not steps anybody performs, so they are not counted when the view reports
   * how much of the chain has a system -- "18 of 24 stages" would be a worse answer than
   * "15 of 21", because three of those twenty-four are not stages.
   */
  aside?: boolean;
}

/**
 * An enterprise system the process runs on, as distinct from a tool we built.
 *
 * SAP and Ariba are where most of this process actually happens; the sixteen tools in the
 * launcher sit around them. A diagram that showed only our own tools called six stages
 * empty when what it meant was "we have not built anything here" -- which is a different
 * and much less alarming statement than "nothing happens here".
 */
export type SystemId = 'sap' | 'sap-pir' | 'ariba';

export const SYSTEM_LABEL: Record<SystemId, string> = {
  sap: 'SAP',
  /* Purchasing Info Records -- the same SAP, but naming the object is the useful part
     here, because "the catalog lives in SAP" does not tell anybody where to look. */
  'sap-pir': 'SAP PIR',
  ariba: 'Ariba',
};

export interface Stage extends Rect {
  id: string;
  laneId: LaneId;
  label: string;
  /**
   * Tool ids serving this stage. Empty means nothing covers it -- drawn as a gap, which is the
   * single most useful thing this view reports.
   */
  toolIds: string[];
  /**
   * Enterprise systems this stage runs on.
   *
   * A FIRST PASS, inferred from where SAP and Ariba normally sit in a procure-to-pay
   * process rather than from how NESR is configured. Five of what the diagram used to call
   * gaps are SAP steps, which is worth knowing and worth correcting if any of it is wrong.
   */
  systems?: SystemId[];
}

export interface Edge {
  from: string;
  to: string;
  laneId: LaneId;
  /** Solid is a lane's own flow; dashed and dotted are the slide's cross-lane ties. */
  dash: 'solid' | 'dashed' | 'dotted';
  /** The caption the slide puts beside the line, e.g. "Supplier Onboarding". */
  label?: string;
  /**
   * The whole line, centre to centre with any corners already in it.
   *
   * Resolved once by the layout from a routing INTENT -- 'h-then-v', 'channel-bottom' --
   * rather than written here as absolute waypoints. Those were how one of these came to
   * be drawn off the bottom of the canvas, invisible, with every test passing.
   */
  points: { x: number; y: number }[];
}

/** One of the four bands sitting above the spine. */
export interface Phase {
  id: string;
  label: string;
  stageIds: string[];
  x: number;
  w: number;
}

/* ─── Lanes ──────────────────────────────────────────────────────────────────────────────────
   The slide's own four colours: amber for Source to Catalog, green for Demand to Pay, orchid
   for Logistics and blue for Inventory.

   These were a green ramp first, on the reasoning that four hues would fight the rest of the
   app. They did something worse: four greens a step apart read as one lane with a gradient,
   and the thing the colour is carrying here is WHICH LANE a box belongs to -- the one question
   the diagram exists to answer at a glance. Four distinct hues answer it; four tints of one do
   not.

   Each is pulled towards the house palette rather than taken raw from the slide: the greens
   are NESR's #307c4c, and the amber, orchid and blue are desaturated to sit beside it without
   shouting. They had a 6% tint apiece for the lane bands; the bands are gone and so are the
   tints, and the hue now appears at full strength in exactly two places -- the route line and
   the rings where it meets another route.

   The lanes themselves are declared on SUPPLY_CHAIN_SPEC below, with their colours; the
   array the renderer reads is the laid-out version at the foot of this file.
*/

/**
 * Average advance of the bold label face, as a fraction of the font size.
 *
 * SVG neither wraps text nor offers the width of a string without a layout pass, so a wrap
 * has to be predicted. Erring high is the safe direction: a prediction slightly too wide
 * breaks a line early, and a prediction too narrow puts the word over the neighbouring box.
 */
export const CHAR_W = 0.58;

/**
 * Lay a stage's name out inside its box.
 *
 * The budget comes from the box: wrap to the characters that actually fit, and if the name
 * still needs more lines than the box has room for -- or holds a single word too long for
 * any wrap to help, which "Acknowledgement" very nearly is -- step the type down and try
 * again.
 *
 * Shrinking rather than clipping, because the one thing a reader must be able to do on this
 * diagram is tell which stage is which, and a truncated stage name defeats the entire view.
 */
export function fitLabel(
  label: string,
  boxW: number,
  base: number,
  maxLines: number,
): { lines: string[]; size: number } {
  const usable = boxW - 14;
  let size = base;
  let lines: string[] = [label];
  for (let step = 0; step < 6; step += 1) {
    const budget = Math.max(4, Math.floor(usable / (size * CHAR_W)));
    lines = wrap(label, budget);
    const widest = Math.max(...lines.map((l) => l.length));
    if (lines.length <= maxLines && widest * size * CHAR_W <= usable) return { lines, size };
    size *= 0.9;
  }
  return { lines: lines.slice(0, maxLines), size };
}

/** Greedy wrap to a character budget. The caller decides how many lines it can take. */
export function wrap(text: string, max: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (!line) line = word;
    else if (`${line} ${word}`.length <= max) line = `${line} ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/* ─── Edges ──────────────────────────────────────────────────────────────────────────────────
   The spine's own hops carry no caption; everything that leaves a lane does, because the
   slide's captions are the only thing that says WHY two stages are connected. */
/**
 * What the stages ARE. Where they go is the lanes' business, on the spec below.
 *
 * No x, y or h: the engine works those out from the lane a stage is on and its position in
 * that lane's list. `w` appears only where a box has to be wider than its lane's default,
 * which today is Stock Replenishment Planning and nothing else.
 */
const STAGE_DEFS: StageSpec[] = [
  // ── Source to Catalog: stacked above the spine, descending into Supplier Assessment ──
  {
    id: 'source',
    laneId: 'source-to-catalog',
    label: 'Source',
    toolIds: ['sourceguide', 'sns-registry'],
    systems: ['ariba'],
  },
  {
    id: 'contract',
    laneId: 'source-to-catalog',
    label: 'Contract',
    toolIds: ['sirion'],
  },
  {
    id: 'catalog',
    laneId: 'source-to-catalog',
    label: 'Catalog',
    toolIds: ['catalog-manager', 'spend-taxonomy'],
    systems: ['sap-pir'],
  },

  // ── Demand to Pay: the spine, eleven stages on one row ──
  {
    id: 'demand-forecasting',
    laneId: 'demand-to-pay',
    label: 'Planning / Demand Forecasting',
    toolIds: ['translytix'],
    systems: ['sap'],
  },
  {
    id: 'demand-creation',
    laneId: 'demand-to-pay',
    label: 'Demand Creation',
    toolIds: ['laptop-procurement'],
    systems: ['sap'],
  },
  {
    id: 'demand-pr-approval',
    laneId: 'demand-to-pay',
    label: 'Demand PR Approval',
    toolIds: [],
    systems: ['sap'],
  },
  {
    id: 'supplier-assessment',
    laneId: 'demand-to-pay',
    label: 'Supplier Assessment',
    toolIds: ['rfx-officer'],
    systems: ['ariba'],
  },
  {
    id: 'supplier-po-approval',
    laneId: 'demand-to-pay',
    label: 'Supplier PO Approval',
    toolIds: [],
    systems: ['sap'],
  },
  {
    id: 'supplier-acknowledgement',
    laneId: 'demand-to-pay',
    label: 'Supplier Acknowledgement',
    toolIds: [],
    systems: ['sap'],
  },
  {
    id: 'delivery',
    laneId: 'demand-to-pay',
    label: 'Delivery',
    toolIds: ['po-expediting'],
    systems: ['sap'],
  },
  {
    id: 'delivery-acknowledgment',
    laneId: 'demand-to-pay',
    label: 'Delivery Acknowledgment',
    toolIds: [],
    systems: ['sap'],
  },
  {
    id: 'payment-request',
    laneId: 'demand-to-pay',
    label: 'Payment Request (Invoice)',
    toolIds: ['procure-guard'],
    systems: ['sap'],
  },
  {
    id: 'three-way-match',
    laneId: 'demand-to-pay',
    label: 'Demand Supply Validation (3WM)',
    toolIds: ['soa-consolidation'],
    systems: ['sap'],
  },
  {
    id: 'pay',
    laneId: 'demand-to-pay',
    label: 'Pay',
    toolIds: [],
    systems: ['sap'],
  },

  // ── Logistics: out of Supplier Acknowledgement, round, and back up into Delivery ──
  /* Both sit directly under Supplier Acknowledgement (centre 945) and take the spine's own
     width, so the gap to Tracking is the spine's gutter rather than the three-pixel near miss
     180 gave it. */
  {
    id: 'expediting-readiness',
    laneId: 'logistics',
    label: 'Expediting / Readiness',
    toolIds: ['po-expediting'],
  },
  {
    id: 'logistics-procure',
    laneId: 'logistics',
    label: 'Freight Procurement',
    toolIds: ['shipwaves'],
  },
  {
    id: 'logistics-tracking',
    laneId: 'logistics',
    label: 'Tracking',
    toolIds: ['shipwaves', 'tite'],
  },

  // ── Inventory: along the bottom left, tied to the spine at both ends ──
  {
    id: 'stock-replenishment',
    laneId: 'inventory',
    label: 'Stock Replenishment Planning',
    toolIds: ['translytix'],
    systems: ['sap'],
  },
  {
    id: 'physical-counting',
    laneId: 'inventory',
    label: 'Physical Counting',
    toolIds: ['quality-governor'],
    systems: ['sap'],
  },
  {
    id: 'goods-issue',
    laneId: 'inventory',
    label: 'Goods Issue',
    toolIds: [],
    systems: ['sap'],
  },
  {
    id: 'goods-receipt',
    laneId: 'inventory',
    label: 'Goods Receipt',
    toolIds: [],
    systems: ['sap'],
  },
];

/**
 * What is connected to what, and why. Where the line bends is a routing intent on the
 * spec below, not a coordinate here -- absolute waypoints are how one of these came to be
 * drawn off the bottom of the canvas, invisible, with the whole suite green.
 */
const EDGE_DEFS: Omit<EdgeSpec, 'route'>[] = [
  // Source to Catalog, descending, then into the spine.
  {
    from: 'source',
    to: 'contract',
    laneId: 'source-to-catalog',
    dash: 'solid',
    label: 'Supplier Onboarding',
  },
  {
    from: 'contract',
    to: 'catalog',
    laneId: 'source-to-catalog',
    dash: 'solid',
    /* "Contracts Repository" on the slide as well, and dropped: Sirion is the contracts
       repository and its chip is on the Contract box this line leaves. Two captions on one
       row have to fit side by side in the band under it, and the half worth keeping is the
       half the boxes do not already say. */
    label: 'Approval workflow',
  },
  {
    from: 'catalog',
    to: 'supplier-assessment',
    laneId: 'source-to-catalog',
    dash: 'solid',
    label: 'Supplier Price / LT Records',
  },
  // ...and the dashed tie back to the head of the spine.
  {
    from: 'source',
    to: 'demand-forecasting',
    laneId: 'source-to-catalog',
    dash: 'dashed',
  },

  // The spine.
  { from: 'demand-forecasting', to: 'demand-creation', laneId: 'demand-to-pay', dash: 'solid' },
  { from: 'demand-creation', to: 'demand-pr-approval', laneId: 'demand-to-pay', dash: 'solid' },
  { from: 'demand-pr-approval', to: 'supplier-assessment', laneId: 'demand-to-pay', dash: 'solid' },
  {
    from: 'supplier-assessment',
    to: 'supplier-po-approval',
    laneId: 'demand-to-pay',
    dash: 'solid',
  },
  {
    from: 'supplier-po-approval',
    to: 'supplier-acknowledgement',
    laneId: 'demand-to-pay',
    dash: 'solid',
  },
  { from: 'supplier-acknowledgement', to: 'delivery', laneId: 'demand-to-pay', dash: 'solid' },
  { from: 'delivery', to: 'delivery-acknowledgment', laneId: 'demand-to-pay', dash: 'solid' },
  {
    from: 'delivery-acknowledgment',
    to: 'payment-request',
    laneId: 'demand-to-pay',
    dash: 'solid',
  },
  { from: 'payment-request', to: 'three-way-match', laneId: 'demand-to-pay', dash: 'solid' },
  { from: 'three-way-match', to: 'pay', laneId: 'demand-to-pay', dash: 'solid' },

  // Logistics: down out of the spine, round the loop, back up into it.
  {
    from: 'supplier-acknowledgement',
    to: 'expediting-readiness',
    laneId: 'logistics',
    dash: 'solid',
    label: 'Expediting / Readiness',
  },
  { from: 'expediting-readiness', to: 'logistics-procure', laneId: 'logistics', dash: 'solid' },
  {
    from: 'logistics-procure',
    to: 'logistics-tracking',
    laneId: 'logistics',
    dash: 'solid',
    label: 'FF Bid & Award',
  },
  {
    from: 'logistics-tracking',
    to: 'delivery',
    laneId: 'logistics',
    dash: 'solid',
    label: 'Tracking & update variations',
  },

  // Inventory: tied to the spine at both ends.
  { from: 'demand-forecasting', to: 'stock-replenishment', laneId: 'inventory', dash: 'dotted' },
  { from: 'stock-replenishment', to: 'physical-counting', laneId: 'inventory', dash: 'solid' },
  { from: 'physical-counting', to: 'goods-issue', laneId: 'inventory', dash: 'solid' },
  { from: 'goods-issue', to: 'goods-receipt', laneId: 'inventory', dash: 'solid' },
  {
    from: 'goods-receipt',
    to: 'delivery-acknowledgment',
    laneId: 'inventory',
    dash: 'dotted',
  },
];

/* ─── Phases ─────────────────────────────────────────────────────────────────────────────
   The four pills over the spine. They are what a reader clicks first, so each one's extent
   is also a camera target. */
/**
 * Tools that are on neither the map nor the rail beneath it.
 *
 * Empty, and kept rather than deleted: the test that every tool is accounted for needs an
 * escape hatch to name, and the next tool that fits nowhere needs somewhere to go. Anything
 * listed here joins the "across the chain" rail with no capability label beside it.
 *
 * See `ACROSS_THE_CHAIN` near the foot of this file for the four that are deliberately off
 * the canvas.
 */
export const OFF_CHAIN_TOOL_IDS: string[] = [];

/* ─── The drawing, declared ──────────────────────────────────────────────────────────────
   One spec, from which `layoutProcess` works out all twenty-one boxes, four lane hulls and
   twenty-four lines.

   What it buys: positions come from array order, so adding a stage is inserting a string;
   a lane anchored to another lane's stage moves with it; the canvas is measured rather than
   declared; and a second, unrelated process map is a second file like this one.

   `home-chain-parity.test.ts` holds every resulting coordinate. Nothing else would stop
   somebody nudging a row gap and silently redrawing the picture, because every other test
   checks relationships rather than positions -- a diff of that table is a diff of the map. */

const SPINE_STAGE_IDS = [
  'demand-forecasting',
  'demand-creation',
  'demand-pr-approval',
  'supplier-assessment',
  'supplier-po-approval',
  'supplier-acknowledgement',
  'delivery',
  'delivery-acknowledgment',
  'payment-request',
  'three-way-match',
  'pay',
];

/** Only the edges that bend. Everything else runs centre to centre. */
/**
 * Only the lines that leave their lane.
 *
 * Everything inside a lane is a straight horizontal hop and needs nothing said about it.
 * A line BETWEEN lanes, left to its own devices, runs diagonally from one centre to the
 * other -- across whatever sits between them, at an angle nothing else on the drawing
 * uses, and straight through the caption that explains it. These turn in the empty band
 * between the two lanes instead.
 */
const EDGE_ROUTES: Record<string, { route: EdgeRoute; turn?: number }> = {
  'source->demand-forecasting': { route: 'v-h-v' },
  /* These three are declared rather than left straight because they are only straight by
     arithmetic: the boxes happen to share a column today, and `v-h-v` collapses a run that
     never leaves one axis to a single line. Move either end and the turn comes back on its
     own, in the corridor, instead of becoming a diagonal. */
  'catalog->supplier-assessment': { route: 'v-h-v' },
  'logistics-tracking->delivery': { route: 'v-h-v' },
  'demand-forecasting->stock-replenishment': { route: 'v-h-v' },
  'supplier-acknowledgement->expediting-readiness': { route: 'v-h-v' },
  /*
   * A quarter of the way down rather than halfway, and no longer round the bottom.
   *
   * It used to run in a channel below the whole drawing, which meant climbing back up
   * through Tracking to reach Delivery Acknowledgment -- a line crossing a box, hidden
   * only because the lines were thin enough to disappear under it. Turning in the corridor
   * is shorter and clear of every box; the quarter keeps it off Logistics' own turn, which
   * crosses the same corridor at the halfway mark.
   */
  'goods-receipt->delivery-acknowledgment': { route: 'v-h-v', turn: 0.25 },
};

export const SUPPLY_CHAIN_SPEC: ProcessSpec = {
  width: CHAIN_WIDTH,
  marginBottom: 6,
  channelGap: 16,
  groupBand: { h: PHASE_BAND_H, gap: 20, inset: PHASE_BAND_INSET },
  /* Air above the phase pills. It used to be the strip a lane's own name was written in;
     the names are gone from the canvas with the bands, and the pills moved up into it. */
  laneLabelH: 10,

  lanes: [
    {
      id: 'source-to-catalog',
      label: 'Source to Catalog',
      colour: '#C08A1E',
      flow: 'reverse',
      /*
       * A row, not a column.
       *
       * It was three boxes stacked, which is how the slide draws it and cost 270 units of
       * height -- and height is the only thing that limits how big this drawing lands,
       * because the card is always wider than the drawing needs. Laid out left to right
       * the sequence reads exactly the same and the whole picture gets a third taller on
       * screen.
       *
       * Aligned by its LAST box: Catalog is what feeds Supplier Assessment, so Catalog is
       * what sits over it. Centring the row instead would leave that connector running
       * diagonally across two other boxes.
       */
      anchorX: { at: 'align-stages', mine: 'catalog', onto: 'supplier-assessment' },
      anchorY: { at: 'top', offset: 10 },
      layout: { kind: 'row', stageIds: ['source', 'contract', 'catalog'] },
      nodeW: S2C_W,
      nodeH: NODE_H,
      gutterX: SPINE_GUTTER,
      gutterY: 0,
      pad: { x: 24, top: ROW_PAD_TOP, bottom: ROW_PAD_BOTTOM },
    },
    {
      id: 'demand-to-pay',
      label: 'Demand to Pay',
      colour: '#307c4c',
      flow: 'forward',
      restFlow: true,
      anchorX: { at: 'canvas-centre' },
      anchorY: { at: 'below', laneId: 'source-to-catalog', gap: ROW_GAP },
      layout: { kind: 'row', stageIds: SPINE_STAGE_IDS },
      nodeW: SPINE_W,
      nodeH: NODE_H,
      gutterX: SPINE_GUTTER,
      gutterY: 0,
      /* `top` is the phase pills and the air around them; the lane's own name is no
         longer drawn on the canvas. */
      pad: { x: 20, top: 56, bottom: ROW_PAD_BOTTOM },
      stretch: true,
      groups: [
        {
          id: 'demand',
          label: 'Demand',
          stageIds: ['demand-forecasting', 'demand-creation', 'demand-pr-approval'],
        },
        {
          id: 'procure',
          label: 'Procure',
          stageIds: ['supplier-assessment', 'supplier-po-approval', 'supplier-acknowledgement'],
        },
        { id: 'deliver', label: 'Deliver', stageIds: ['delivery', 'delivery-acknowledgment'] },
        {
          id: 'pay',
          label: 'Pay',
          stageIds: ['payment-request', 'three-way-match', 'pay'],
        },
      ],
    },
    {
      id: 'logistics',
      label: 'Logistics',
      colour: '#A8509B',
      flow: 'forward',
      /*
       * Anchored one column LEFT of the stage it leaves, which is the whole trick.
       *
       * It used to start under Supplier Acknowledgement, which put Tracking under Delivery
       * Acknowledgment -- so the line back into Delivery had to turn, and it turned in the
       * same corridor and the same column as Inventory's line back into Delivery
       * Acknowledgment. Two routes, one corridor, drawn on top of each other.
       *
       * Starting a column earlier costs nothing and buys two straight verticals instead:
       * Tracking sits directly under Delivery, so the return line is a plain drop, and the
       * column Inventory needs is clear. A line that does not have to turn is one a reader
       * does not have to follow.
       */
      anchorX: { at: 'stage-left', stageId: 'supplier-po-approval' },
      anchorY: { at: 'below', laneId: 'demand-to-pay', gap: LOWER_ROW_GAP },
      layout: {
        kind: 'row',
        stageIds: ['expediting-readiness', 'logistics-procure', 'logistics-tracking'],
      },
      nodeW: SPINE_W,
      nodeH: NODE_H,
      gutterX: SPINE_GUTTER,
      gutterY: 0,
      pad: { x: 16, top: ROW_PAD_TOP, bottom: ROW_PAD_BOTTOM },
    },
    {
      id: 'inventory',
      label: 'Inventory',
      colour: '#1F5C8B',
      flow: 'reverse',
      anchorX: { at: 'stage-left', stageId: 'demand-forecasting' },
      anchorY: { at: 'below', laneId: 'demand-to-pay', gap: LOWER_ROW_GAP },
      layout: {
        kind: 'row',
        stageIds: ['stock-replenishment', 'physical-counting', 'goods-issue', 'goods-receipt'],
      },
      nodeW: SPINE_W,
      nodeH: NODE_H,
      /* The spine's gutter, not its own: four boxes on the spine's pitch from the spine's
         own left edge land in the spine's columns, so Stock Replenishment sits exactly
         under Planning and the tie between them is a straight drop. */
      gutterX: SPINE_GUTTER,
      gutterY: 0,
      pad: { x: 16, top: ROW_PAD_TOP, bottom: ROW_PAD_BOTTOM },
    },
  ],

  stages: STAGE_DEFS,

  edges: EDGE_DEFS.map((edge) => ({
    ...edge,
    ...(EDGE_ROUTES[`${edge.from}->${edge.to}`] ?? { route: 'direct' as const }),
  })),
};

export const COMPUTED = layoutProcess(SUPPLY_CHAIN_SPEC);

/* ─── The drawing ────────────────────────────────────────────────────────────────────────
   Everything below is the laid-out spec under the names the renderer already used. The
   shapes are unchanged, which is the whole point: the component and its tests were written
   against hand-placed coordinates and neither had to be touched when those went away. */

export const CHAIN_HEIGHT = COMPUTED.height;
export const CONTENT = COMPUTED.content;
export const STAGES: Stage[] = COMPUTED.stages as Stage[];
export const LANES: Lane[] = COMPUTED.lanes as Lane[];
export const EDGES: Edge[] = COMPUTED.edges as Edge[];
export const PHASES: Phase[] = COMPUTED.groups;
export const STAGE_BY_ID: Record<string, Stage> = COMPUTED.stageById as Record<string, Stage>;
export const LANE_BY_ID: Record<LaneId, Lane> = COMPUTED.laneById as Record<LaneId, Lane>;
/** Where a phase pill sits, and how it is drawn. The row comes from the layout. */
export const PHASE_BAND = {
  y: COMPUTED.groupBandY,
  h: PHASE_BAND_H,
  inset: PHASE_BAND_INSET,
} as const;

/* ─── Interchanges ───────────────────────────────────────────────────────────────────────
   Where one route meets another, which on a map of this kind is the single most useful
   thing it can say. */

export interface Junction {
  id: string;
  x: number;
  y: number;
  /** The route arriving. Its colour is what the ring is drawn in. */
  laneId: LaneId;
  /** The stage it lands on, so a click can take the camera there. */
  stageId: string;
}

/**
 * Where a connector crosses the edge of the box it leaves or enters.
 *
 * Every line is drawn centre to centre, so the ends of it are underneath the two boxes and
 * the join is invisible -- you can see that Logistics goes somewhere, not that it comes out
 * of Supplier Acknowledgement specifically. The boundary crossing is the point a reader is
 * actually looking for, and marking it is what turns a set of boxes with lines between them
 * into something you can trace.
 *
 * Only for lines that change route. A hop between two stations on the same line is not an
 * interchange and ringing it would say nothing.
 */
function boundaryPoint(
  box: Rect,
  centre: { x: number; y: number },
  toward: { x: number; y: number },
) {
  /* Every segment is axis-aligned, so "which edge" is decided by which coordinate moves. */
  if (toward.x === centre.x) {
    return { x: centre.x, y: toward.y > centre.y ? box.y + box.h : box.y };
  }
  return { x: toward.x > centre.x ? box.x + box.w : box.x, y: centre.y };
}

export const JUNCTIONS: Junction[] = EDGES.flatMap((edge) => {
  const from = STAGE_BY_ID[edge.from];
  const to = STAGE_BY_ID[edge.to];
  if (from.laneId === to.laneId) return [];
  const pts = edge.points;
  return [
    {
      id: `${edge.from}->${edge.to}@out`,
      ...boundaryPoint(from, pts[0], pts[1]),
      laneId: edge.laneId,
      stageId: edge.from,
    },
    {
      id: `${edge.from}->${edge.to}@in`,
      ...boundaryPoint(to, pts[pts.length - 1], pts[pts.length - 2]),
      laneId: edge.laneId,
      stageId: edge.to,
    },
  ];
});

/* ─── Beside the chain, not on it ────────────────────────────────────────────────────────
   Four tools serve every stage or none: analytics reads the whole chain, the Learning Hub
   teaches it, the assistant answers about it, and the Travel Portal is not part of it at
   all. They had a lane of their own along the foot of the canvas for a while, which was
   honest about what they are and wrong about where they belong -- a full-width row of the
   heaviest boxes on the drawing, under a process map, implying a fifth process. They are a
   list below the picture instead.

   Spend Classification is NOT here. It was, and it was also on Catalog, which is the one
   place it genuinely belongs; a tool in two places on one page is a tool the reader has to
   reconcile. */
export const ACROSS_THE_CHAIN: { label: string; toolId: string }[] = [
  { label: 'Analytics & dashboards', toolId: 'supply-chain-analytics' },
  { label: 'Learning & training', toolId: 'learning-hub' },
  { label: 'Ask the assistant', toolId: 'scai' },
  { label: 'Travel', toolId: 'travel-portal' },
];

/* ─── Derived ────────────────────────────────────────────────────────────────────────────────
   Computed rather than written down, so a stage added above cannot leave a stale count or
   lookup behind. */

/** Every stage a tool appears on. Drives hover-highlighting across lanes. */
export function stagesForTool(toolId: string): Stage[] {
  return STAGES.filter((stage) => stage.toolIds.includes(toolId));
}

/** Every tool id placed anywhere on the chain. */
export function placedToolIds(): string[] {
  return [...new Set(STAGES.flatMap((stage) => stage.toolIds))];
}

/** The headline under the canvas: how much of the chain has a system behind it. */
export function coverage(): { total: number; covered: number; gaps: number } {
  /* Aside lanes are not part of the process, so counting their boxes would inflate both
     halves of the figure and make the view less true, not more. */
  const inProcess = STAGES.filter((stage) => !LANE_BY_ID[stage.laneId].aside);
  /* "Has a system" means exactly that, and SAP is a system. A stage running on SAP with no
     tool of ours is not a hole in the process -- it is a place we have not built anything,
     which is a different statement and the diagram should not conflate them. */
  const covered = inProcess.filter(
    (stage) => stage.toolIds.length > 0 || (stage.systems?.length ?? 0) > 0,
  ).length;
  return { total: inProcess.length, covered, gaps: inProcess.length - covered };
}

/** The smallest rect containing these stages, plus padding. A camera target. */

export function boundsOf(stageIds: string[], pad = 70): Rect {
  const picked = stageIds.map((id) => STAGE_BY_ID[id]).filter(Boolean);
  if (!picked.length) return { x: 0, y: 0, w: CHAIN_WIDTH, h: CHAIN_HEIGHT };
  const x1 = Math.min(...picked.map((s) => s.x));
  const y1 = Math.min(...picked.map((s) => s.y));
  const x2 = Math.max(...picked.map((s) => s.x + s.w));
  const y2 = Math.max(...picked.map((s) => s.y + s.h));
  return { x: x1 - pad, y: y1 - pad, w: x2 - x1 + pad * 2, h: y2 - y1 + pad * 2 };
}

/** The centre of a rect, which is where every edge starts and ends. */
export function centreOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * The point halfway ALONG an edge, measured by length, which is where its caption goes.
 *
 * Taking the middle element of the points array is the obvious thing and is wrong: a plain
 * two-point edge has no middle element, so `points[1]` is the destination and every caption on
 * a straight run was printed on top of the node it pointed at. Walking the polyline gives the
 * real midpoint, and on a bent edge it lands on the longer leg where there is room for it.
 */
export function edgeMidpoint(edge: Edge): { x: number; y: number; horizontal: boolean } {
  const points = edge.points;
  const segments = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  const half = segments.reduce((a2, b2) => a2 + b2, 0) / 2;

  let walked = 0;
  for (let i = 0; i < segments.length; i += 1) {
    if (walked + segments[i] >= half) {
      const f = segments[i] === 0 ? 0 : (half - walked) / segments[i];
      return {
        x: points[i].x + (points[i + 1].x - points[i].x) * f,
        y: points[i].y + (points[i + 1].y - points[i].y) * f,
        /* Which way the line is running HERE, so the caption can step aside from it
           rather than sit on top of it. Every segment is axis-aligned. */
        horizontal: points[i].y === points[i + 1].y,
      };
    }
    walked += segments[i];
  }
  const last = points[points.length - 1];
  return { ...last, horizontal: points[points.length - 2].y === last.y };
}

/**
 * The path for an edge: centre to centre, through any waypoints, as orthogonal runs.
 *
 * Straight diagonals would cross the lanes at angles the slide never uses and would cut
 * through stage boxes on the way. Every connection here is either a straight run or a right
 * angle, which is what the slide draws and what keeps the lanes legible.
 */
export function edgePath(edge: Edge): string {
  return edge.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}
