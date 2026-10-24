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
export const CHAIN_HEIGHT = 1150;

/** Every stage is the same size, so the eye reads position as meaning and not importance. */
const NODE_H = 120;
const SPINE_W = 150;
/** Stage pitch along the spine: eleven stages at 150 wide with a 12 gutter. */
const spineX = (i: number) => 60 + i * (SPINE_W + 12);

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
/* `inset` trims each end of the DRAWN pill. The band's span stays the true extent of its
   stages, because that is what the camera flies to; the inset is only so two fully rounded
   caps have visible air between them rather than nearly touching. */
export const PHASE_BAND = { y: 520, h: 32, inset: 5 } as const;
const SPINE_TOP = 486;
const SPINE_Y = 572;
const LOGISTICS_TOP = 768;
const LOGISTICS_Y = 814;
const LOGISTICS_PROCURE_Y = 984;
const INVENTORY_TOP = 916;
const INVENTORY_Y = 952;
/** The dotted return from Goods Receipt, routed under everything else. */
const BOTTOM_ROUTE_Y = 1130;

/*
 * The "across the chain" lane, in the bottom-right quarter.
 *
 * Logistics stops at x 1265 and Inventory at y 1088, which left roughly 590 by 370 units of
 * canvas doing nothing. Three tools serve the whole process rather than any one stage and
 * used to live in a list in a side panel, which meant three of the sixteen were not on the
 * picture at all -- an odd thing for a view whose job is showing the estate. They go here,
 * and the drawing costs not one unit more than it did.
 */
const ASIDE_X = 1300;
const ASIDE_TOP = 768;
const ASIDE_FIRST = 814;
const ASIDE_PITCH = 110;
const ASIDE_NODE_H = 86;

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

export interface Stage extends Rect {
  id: string;
  laneId: LaneId;
  label: string;
  /**
   * Tool ids serving this stage. Empty means nothing covers it -- drawn as a gap, which is the
   * single most useful thing this view reports.
   */
  toolIds: string[];
}

export interface Edge {
  from: string;
  to: string;
  laneId: LaneId;
  /** Solid is a lane's own flow; dashed and dotted are the slide's cross-lane ties. */
  dash: 'solid' | 'dashed' | 'dotted';
  /** The caption the slide puts beside the line, e.g. "Supplier Onboarding". */
  label?: string;
  /** Where the line bends. Absolute canvas points, joined centre -> via... -> centre. */
  via?: { x: number; y: number }[];
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
*/
export const LANES: Lane[] = [
  {
    id: 'source-to-catalog',
    label: 'Source to Catalog',
    colour: '#C08A1E',
    tint: '#FDF8EC',
    flow: 'reverse',
    box: { x: 460, y: S2C_TOP, w: 320, h: S2C_FIRST + 2 * S2C_PITCH + NODE_H + 24 },
  },
  {
    id: 'demand-to-pay',
    label: 'Demand to Pay',
    colour: '#307c4c',
    tint: '#EAF4EE',
    flow: 'forward',
    restFlow: true,
    /* Taller than the stages need. The extra 18 at the top is a row for the lane's own
       label, which would otherwise sit on the Demand phase band. */
    box: { x: 40, y: SPINE_TOP, w: 1840, h: SPINE_Y + NODE_H + 32 - SPINE_TOP },
  },
  {
    id: 'logistics',
    label: 'Logistics',
    colour: '#A8509B',
    tint: '#FAF2F9',
    flow: 'forward',
    box: {
      x: 835,
      y: LOGISTICS_TOP,
      w: 430,
      h: LOGISTICS_PROCURE_Y + NODE_H + 18 - LOGISTICS_TOP,
    },
  },
  {
    id: 'inventory',
    label: 'Inventory',
    colour: '#1F5C8B',
    tint: '#EEF4FA',
    flow: 'reverse',
    box: { x: 40, y: INVENTORY_TOP, w: 720, h: INVENTORY_Y + NODE_H + 16 - INVENTORY_TOP },
  },
  {
    id: 'across',
    label: 'Across the chain',
    /* Deliberately not one of the four process colours. These serve every stage, so taking
       any lane's colour would imply they belong to it. */
    colour: '#58595B',
    tint: '#F5F6F7',
    flow: 'forward',
    aside: true,
    box: {
      x: ASIDE_X - 36,
      y: ASIDE_TOP,
      w: 616,
      h: ASIDE_FIRST + 2 * ASIDE_PITCH + ASIDE_NODE_H + 18 - ASIDE_TOP,
    },
  },
];

export const LANE_BY_ID: Record<LaneId, Lane> = Object.fromEntries(
  LANES.map((lane) => [lane.id, lane]),
) as Record<LaneId, Lane>;

/* ─── Stages ─────────────────────────────────────────────────────────────────────────────── */

export const STAGES: Stage[] = [
  // ── Source to Catalog: stacked above the spine, descending into Supplier Assessment ──
  {
    id: 'source',
    laneId: 'source-to-catalog',
    label: 'Source',
    x: 531,
    y: S2C_FIRST,
    w: 180,
    h: NODE_H,
    toolIds: ['sourceguide', 'sns-registry'],
  },
  {
    id: 'contract',
    laneId: 'source-to-catalog',
    label: 'Contract',
    x: 531,
    y: S2C_FIRST + S2C_PITCH,
    w: 180,
    h: NODE_H,
    toolIds: ['sirion'],
  },
  {
    id: 'catalog',
    laneId: 'source-to-catalog',
    label: 'Catalog',
    x: 531,
    y: S2C_FIRST + 2 * S2C_PITCH,
    w: 180,
    h: NODE_H,
    toolIds: ['catalog-manager', 'spend-taxonomy'],
  },

  // ── Demand to Pay: the spine, eleven stages on one row ──
  {
    id: 'demand-forecasting',
    laneId: 'demand-to-pay',
    label: 'Planning / Demand Forecasting',
    x: spineX(0),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['translytix'],
  },
  {
    id: 'demand-creation',
    laneId: 'demand-to-pay',
    label: 'Demand Creation',
    x: spineX(1),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['laptop-procurement'],
  },
  {
    id: 'demand-pr-approval',
    laneId: 'demand-to-pay',
    label: 'Demand PR Approval',
    x: spineX(2),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['laptop-procurement'],
  },
  {
    id: 'supplier-assessment',
    laneId: 'demand-to-pay',
    label: 'Supplier Assessment',
    x: spineX(3),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['rfx-officer'],
  },
  {
    id: 'supplier-po-approval',
    laneId: 'demand-to-pay',
    label: 'Supplier PO Approval',
    x: spineX(4),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['rfx-officer'],
  },
  {
    id: 'supplier-acknowledgement',
    laneId: 'demand-to-pay',
    label: 'Supplier Acknowledgement',
    x: spineX(5),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'delivery',
    laneId: 'demand-to-pay',
    label: 'Delivery',
    x: spineX(6),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['po-expediting'],
  },
  {
    id: 'delivery-acknowledgment',
    laneId: 'demand-to-pay',
    label: 'Delivery Acknowledgment',
    x: spineX(7),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'payment-request',
    laneId: 'demand-to-pay',
    label: 'Payment Request (Invoice)',
    x: spineX(8),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['procure-guard'],
  },
  {
    id: 'three-way-match',
    laneId: 'demand-to-pay',
    label: 'Demand Supply Validation (3WM)',
    x: spineX(9),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['soa-consolidation'],
  },
  {
    id: 'pay',
    laneId: 'demand-to-pay',
    label: 'Pay',
    x: spineX(10),
    y: SPINE_Y,
    w: SPINE_W,
    h: NODE_H,
    toolIds: ['soa-consolidation'],
  },

  // ── Logistics: out of Supplier Acknowledgement, round, and back up into Delivery ──
  /* Both sit directly under Supplier Acknowledgement (centre 945) and take the spine's own
     width, so the gap to Tracking is the spine's gutter rather than the three-pixel near miss
     180 gave it. */
  {
    id: 'expediting-readiness',
    laneId: 'logistics',
    label: 'Expediting / Readiness',
    x: 870,
    y: LOGISTICS_Y,
    w: 150,
    h: NODE_H,
    toolIds: ['po-expediting'],
  },
  {
    id: 'logistics-procure',
    laneId: 'logistics',
    label: 'Freight Procurement',
    x: 870,
    y: LOGISTICS_PROCURE_Y,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'logistics-tracking',
    laneId: 'logistics',
    label: 'Tracking',
    x: 1032,
    y: LOGISTICS_Y,
    w: 150,
    h: NODE_H,
    toolIds: ['shipwaves', 'tite'],
  },

  // ── Inventory: along the bottom left, tied to the spine at both ends ──
  {
    id: 'stock-replenishment',
    laneId: 'inventory',
    label: 'Stock Replenishment Planning',
    x: 60,
    y: INVENTORY_Y,
    w: 180,
    h: NODE_H,
    toolIds: ['translytix'],
  },
  {
    id: 'physical-counting',
    laneId: 'inventory',
    label: 'Physical Counting',
    x: 256,
    y: INVENTORY_Y,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'goods-issue',
    laneId: 'inventory',
    label: 'Goods Issue',
    x: 422,
    y: INVENTORY_Y,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'goods-receipt',
    laneId: 'inventory',
    label: 'Goods Receipt',
    x: 588,
    y: INVENTORY_Y,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },

  /* ── Across the chain ──
     Not steps in the process. Each box is named for what the tool is FOR rather than for
     the tool itself, so the lane reads as three capabilities rather than three logos. */
  {
    id: 'across-analytics',
    laneId: 'across',
    label: 'Analytics & Dashboards',
    x: ASIDE_X,
    y: ASIDE_FIRST,
    w: 544,
    h: ASIDE_NODE_H,
    toolIds: ['supply-chain-analytics'],
  },
  {
    id: 'across-learning',
    laneId: 'across',
    label: 'Learning & Training',
    x: ASIDE_X,
    y: ASIDE_FIRST + ASIDE_PITCH,
    w: 544,
    h: ASIDE_NODE_H,
    toolIds: ['learning-hub'],
  },
  {
    id: 'across-travel',
    laneId: 'across',
    label: 'Travel',
    x: ASIDE_X,
    y: ASIDE_FIRST + 2 * ASIDE_PITCH,
    w: 544,
    h: ASIDE_NODE_H,
    toolIds: ['travel-portal'],
  },
];

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
 * What was here before wrapped at a flat twenty characters, a number with no relation to
 * either the box (150 units across the spine) or the type (16 units at the fitted view).
 * Twenty characters of bold sixteen runs about 185 units, so "Supplier Assessment" and
 * "Demand Creation" were drawn straight across the stages either side of them.
 *
 * So the budget comes from the box: wrap to the characters that actually fit, and if the name
 * still needs more lines than the box has room for -- or holds a single word too long for any
 * wrap to help, which "Acknowledgement" very nearly is -- step the type down and try again.
 *
 * Shrinking rather than clipping, because the one thing a reader must be able to do on this
 * diagram is tell which stage is which, and a truncated stage name defeats the entire view.
 * Six steps of 10% bottom out near half size, which no label here comes close to needing.
 */
export function fitLabel(
  label: string,
  boxW: number,
  base: number,
  maxLines: number,
): { lines: string[]; size: number } {
  const usable = boxW - 14;
  let size = base;
  let lines = [label];
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

export const STAGE_BY_ID: Record<string, Stage> = Object.fromEntries(
  STAGES.map((stage) => [stage.id, stage]),
);

/* ─── Edges ──────────────────────────────────────────────────────────────────────────────────
   The spine's own hops carry no caption; everything that leaves a lane does, because the
   slide's captions are the only thing that says WHY two stages are connected. */
export const EDGES: Edge[] = [
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
    via: [{ x: 135, y: S2C_FIRST + NODE_H / 2 }],
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
    via: [{ x: 1107, y: LOGISTICS_PROCURE_Y + NODE_H / 2 }],
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
    via: [
      { x: 663, y: BOTTOM_ROUTE_Y },
      { x: 1269, y: BOTTOM_ROUTE_Y },
    ],
  },
];

/* ─── Phases ─────────────────────────────────────────────────────────────────────────────────
   The four bands above the spine. They are what a reader clicks first, so each one's extent is
   also a camera target. */
/**
 * A band's extent is exactly the stages under it.
 *
 * These were four hand-typed pairs, and three of them were wrong: Demand ran four units into
 * Procure and Procure four units into Deliver, which with a fully rounded end made each pair
 * read as one long pill. Somebody had already found the Deliver/Pay case and patched that one
 * number with a comment. Deriving the span fixes all of them at once and inherits the spine's
 * own twelve-unit gutter, so the bands can never drift out of step with the stages again.
 */
const spanOf = (ids: string[]) => {
  const boxes = ids.map((id) => STAGES.find((s) => s.id === id)!);
  const x = Math.min(...boxes.map((b) => b.x));
  return { x, w: Math.max(...boxes.map((b) => b.x + b.w)) - x };
};

export const PHASES: Phase[] = (
  [
    ['demand', 'Demand', ['demand-forecasting', 'demand-creation', 'demand-pr-approval']],
    [
      'procure',
      'Procure',
      ['supplier-assessment', 'supplier-po-approval', 'supplier-acknowledgement'],
    ],
    ['deliver', 'Deliver', ['delivery', 'delivery-acknowledgment']],
    ['pay', 'Pay', ['payment-request', 'three-way-match', 'pay']],
  ] as const
).map(([id, label, stageIds]) => ({
  id,
  label,
  stageIds: [...stageIds],
  ...spanOf([...stageIds]),
}));

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
  const covered = inProcess.filter((stage) => stage.toolIds.length > 0).length;
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
  const points = [
    centreOf(STAGE_BY_ID[edge.from]),
    ...(edge.via ?? []),
    centreOf(STAGE_BY_ID[edge.to]),
  ];
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
  const from = centreOf(STAGE_BY_ID[edge.from]);
  const to = centreOf(STAGE_BY_ID[edge.to]);
  const points = [from, ...(edge.via ?? []), to];
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ');
}
