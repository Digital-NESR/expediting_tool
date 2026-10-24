/**
 * The supply chain as a drawable graph, and where each tool sits on it.
 *
 * The home page's card grid answers "what do we have". It cannot answer the question an
 * administrator actually asks, which is where in the chain each of those sits and what has no
 * system at all. This is the model behind the second view: the four lanes from the
 * `Supply Chain Process Cycles & Systems` slide, every stage on them, and the tool ids pinned
 * to each.
 *
 * COORDINATES ARE HAND-AUTHORED, deliberately. An auto-layout would place these by its own
 * rules, and the whole point is the slide's arrangement: the spine running left to right with
 * Source-to-Catalog descending into it, Logistics looping out below it and Inventory tied back
 * at both ends. Twenty-one stages is small enough that hand placement is cheap, exact, and
 * reviewable in a diff.
 *
 * Pure data and pure functions. Nothing here imports React or touches the DOM, so the shape of
 * the chain is testable on its own -- which matters most for the tool mapping, where the test
 * fails the day somebody adds a tool and does not place it.
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
export const CHAIN_WIDTH = 1920;

/** Every stage is the same size, so the eye reads position as meaning and not importance. */
const NODE_H = 120;
const SPINE_W = 150;
const SPINE_GUTTER = 12;

/* The one width that is not a lane default: Source to Catalog's column is wider than the
   spine's boxes. The spec reads it; nothing works out an x from it. */
const S2C_W = 180;

/* ─── The vertical bands ──────────────────────────────────────────────────────────────────
   Top to bottom, and everything else derives from them: a lane's box, the stages inside it
   and the connectors between them all move together when one of these changes. They were
   two dozen loose literals, which is how a hand-placed waypoint came to sit at y=955 on a
   930-unit canvas -- off the bottom of the drawing, invisible, and true until somebody
   measured it. */
const S2C_TOP = 8;
const S2C_FIRST = 40;
const S2C_PITCH = 136;
/** The phase bands, which sit inside the top of the spine lane rather than above it. */
/* `inset` trims each end of the DRAWN pill, so two fully rounded caps have visible air
   between them. The band's own row is computed; only these two are chosen. */
const PHASE_BAND_H = 32;
const PHASE_BAND_INSET = 5;
/*
 * Logistics is one row, not two.
 *
 * It was a 2x2 loop, which cost 170 units of height -- and height is what decides how big
 * the drawing lands, because the card is far wider than it is tall, so a fully visible
 * chain is bound by its height and never by its width. Three boxes left to right say the
 * same thing: out of the spine at Supplier Acknowledgement, through freight procurement,
 * back in at Delivery.
 *
 * Inventory rises beside it for the same reason. The two do not overlap horizontally, so
 * they cost one band between them rather than two.
 */
const LOGISTICS_TOP = 768;
const LOGISTICS_Y = 814;
const INVENTORY_TOP = 768;
const INVENTORY_Y = 804;

/*
 * The "across the chain" lane, in the bottom-right quarter.
 *
 * Logistics stops at x 1265 and Inventory at y 1088, which left roughly 590 by 370 units of
 * canvas doing nothing. Three tools serve the whole process rather than any one stage and
 * used to live in a list in a side panel, which meant three of the sixteen were not on the
 * picture at all -- an odd thing for a view whose job is showing the estate. They go here,
 * and the drawing costs not one unit more than it did.
 */
/** Air above the three boxes, inside their band -- the lane's own name sits in it. */
const ASIDE_PAD_TOP = 30;
/**
 * Smaller than a process stage, on purpose.
 *
 * These three are not steps; they sit beside the chain. Drawing them at the spine's size
 * gave them the same weight as Supplier Assessment, and the full-width row made them the
 * heaviest thing on the canvas. 74 is the floor -- a name, a gap and a chip need 70 inside
 * the padding -- so this is as small as they go without the label shrinking.
 */
const ASIDE_NODE_H = 74;
const ASIDE_W = 340;
const ASIDE_GUTTER = 16;

export type LaneId = 'source-to-catalog' | 'demand-to-pay' | 'logistics' | 'inventory' | 'across';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Lane {
  id: LaneId;
  label: string;
  /** Stroke and text. */
  colour: string;
  /** Fill behind a stage on this lane. */
  tint: string;
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
export type SystemId = 'sap' | 'sap-pir' | 'ariba' | 'quality-governor';

export const SYSTEM_LABEL: Record<SystemId, string> = {
  sap: 'SAP',
  /* Purchasing Info Records -- the same SAP, but naming the object is the useful part
     here, because "the catalog lives in SAP" does not tell anybody where to look. */
  'sap-pir': 'SAP PIR',
  ariba: 'Ariba',
  /* Not in the launcher. If it should be, it wants a row in src/app/home/tools.tsx and
     this entry goes away -- a system badge is the honest place for something the chain
     knows about but the estate does not yet list. */
  'quality-governor': 'Quality Governor',
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
   shouting. The tints are the same hues at about 6% for the lane bands.

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
    w: 180,
    toolIds: ['translytix'],
    systems: ['sap'],
  },
  {
    id: 'physical-counting',
    laneId: 'inventory',
    label: 'Physical Counting',
    toolIds: [],
    systems: ['sap', 'quality-governor'],
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

  /* ── Across the chain ──
     Not steps in the process. Each box is named for what the tool is FOR rather than for
     the tool itself, so the lane reads as three capabilities rather than three logos. */
  {
    id: 'across-analytics',
    laneId: 'across',
    label: 'Analytics & Dashboards',
    toolIds: ['supply-chain-analytics'],
  },
  {
    id: 'across-learning',
    laneId: 'across',
    label: 'Learning & Training',
    toolIds: ['learning-hub'],
  },
  {
    id: 'across-travel',
    laneId: 'across',
    label: 'Travel',
    toolIds: ['travel-portal'],
  },
  {
    id: 'across-assistant',
    laneId: 'across',
    label: 'Ask the Assistant',
    toolIds: ['scai'],
  },
  {
    id: 'across-taxonomy',
    laneId: 'across',
    label: 'Spend Classification',
    toolIds: ['spend-taxonomy'],
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
    label: 'Approval Workflow · Contracts Repository',
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

/* ─── Phases ─────────────────────────────────────────────────────────────────────────────────
   The four bands above the spine. They are what a reader clicks first, so each one's extent is
   also a camera target. */
/* ─── Tools that serve no single stage ───────────────────────────────────────────────────────
   Analytics reads the whole chain, Learning Hub teaches it, and the Travel Portal is not part
   of it at all. Pinning each to its nearest stage would be three small lies, so they get a rail
   of their own beneath the diagram and the view says plainly that they sit across it. */
/**
 * Tools that serve no single stage AND have no home on the aside lane either.
 *
 * Empty now that the aside lane exists, and kept rather than deleted because the next tool
 * that fits nowhere needs somewhere to go, and the test that every tool is accounted for
 * needs the escape hatch to exist. The panel that lists these hides itself when it is empty.
 */
export const OFF_CHAIN_TOOL_IDS: string[] = [];

/* ─── The same drawing, declared ─────────────────────────────────────────────────────────
   Everything above is absolute coordinates. This is the spec they came from, and
   `layoutProcess` recomputes them from it.

   Written beside the literals rather than instead of them, with a test asserting the two
   agree to the unit, because the only convincing argument that a layout engine reproduces
   a hand-made drawing is the drawing itself coming back unchanged. Once that test has
   passed, the literals go and this becomes the single source.

   What it buys: positions come from array order, so adding a stage is inserting a string;
   a lane anchored to another lane's stage moves with it; the canvas is measured rather
   than declared; and a second, unrelated process map is a second file like this one. */

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
const EDGE_ROUTES: Record<string, EdgeRoute> = {
  'source->demand-forecasting': 'h-then-v',
  'goods-receipt->delivery-acknowledgment': 'channel-bottom',
};

export const SUPPLY_CHAIN_SPEC: ProcessSpec = {
  width: CHAIN_WIDTH,
  marginBottom: 6,
  channelGap: 16,
  groupBand: { h: PHASE_BAND_H, gap: 20, inset: PHASE_BAND_INSET },
  laneLabelH: 34,

  lanes: [
    {
      id: 'source-to-catalog',
      label: 'Source to Catalog',
      colour: '#C08A1E',
      tint: '#FDF8EC',
      flow: 'reverse',
      /* It descends INTO Supplier Assessment, so it is drawn over it. Move that stage
         along the spine and this whole column follows. */
      anchorX: { at: 'stage-centre', stageId: 'supplier-assessment' },
      anchorY: { at: 'top', offset: S2C_TOP },
      layout: { kind: 'column', stageIds: ['source', 'contract', 'catalog'] },
      nodeW: S2C_W,
      nodeH: NODE_H,
      gutterX: 0,
      gutterY: S2C_PITCH - NODE_H,
      pad: { x: 70, top: S2C_FIRST - S2C_TOP, bottom: 32 },
    },
    {
      id: 'demand-to-pay',
      label: 'Demand to Pay',
      colour: '#307c4c',
      tint: '#EAF4EE',
      flow: 'forward',
      restFlow: true,
      anchorX: { at: 'canvas-centre' },
      anchorY: { at: 'below', laneId: 'source-to-catalog', gap: 22 },
      layout: { kind: 'row', stageIds: SPINE_STAGE_IDS },
      nodeW: SPINE_W,
      nodeH: NODE_H,
      gutterX: SPINE_GUTTER,
      gutterY: 0,
      /* `top` holds the lane's own name AND the phase pills under it. */
      pad: { x: 20, top: 86, bottom: 32 },
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
      tint: '#FAF2F9',
      flow: 'forward',
      /* Hangs directly below the stage it leaves, on the spine's own column pitch. */
      anchorX: { at: 'stage-left', stageId: 'supplier-acknowledgement' },
      anchorY: { at: 'below', laneId: 'demand-to-pay', gap: 44 },
      layout: {
        kind: 'row',
        stageIds: ['expediting-readiness', 'logistics-procure', 'logistics-tracking'],
      },
      nodeW: SPINE_W,
      nodeH: NODE_H,
      gutterX: SPINE_GUTTER,
      gutterY: 0,
      pad: { x: 50, top: LOGISTICS_Y - LOGISTICS_TOP, bottom: 18 },
    },
    {
      id: 'inventory',
      label: 'Inventory',
      colour: '#1F5C8B',
      tint: '#EEF4FA',
      flow: 'reverse',
      anchorX: { at: 'stage-left', stageId: 'demand-forecasting' },
      anchorY: { at: 'below', laneId: 'demand-to-pay', gap: 44 },
      layout: {
        kind: 'row',
        stageIds: ['stock-replenishment', 'physical-counting', 'goods-issue', 'goods-receipt'],
      },
      nodeW: 150,
      nodeH: NODE_H,
      gutterX: 16,
      gutterY: 0,
      pad: { x: 35, top: INVENTORY_Y - INVENTORY_TOP, bottom: 16 },
    },
    {
      id: 'across',
      label: 'Across the chain',
      colour: '#58595B',
      tint: '#F5F6F7',
      flow: 'forward',
      aside: true,
      anchorX: { at: 'canvas-centre' },
      anchorY: { at: 'below', laneId: 'logistics', gap: 38 },
      layout: {
        kind: 'row',
        stageIds: [
          'across-analytics',
          'across-learning',
          'across-travel',
          'across-assistant',
          'across-taxonomy',
        ],
      },
      nodeW: ASIDE_W,
      nodeH: ASIDE_NODE_H,
      gutterX: ASIDE_GUTTER,
      gutterY: 0,
      pad: { x: 20, top: ASIDE_PAD_TOP, bottom: 16 },
      stretch: true,
    },
  ],

  stages: STAGE_DEFS,

  edges: EDGE_DEFS.map((edge) => ({
    ...edge,
    route: EDGE_ROUTES[`${edge.from}->${edge.to}`] ?? 'direct',
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
export function edgeMidpoint(edge: Edge): { x: number; y: number } {
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
      };
    }
    walked += segments[i];
  }
  return points[points.length - 1];
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
