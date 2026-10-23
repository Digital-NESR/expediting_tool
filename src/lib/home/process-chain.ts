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

/** The canvas every coordinate below is expressed in. */
export const CHAIN_WIDTH = 1920;
export const CHAIN_HEIGHT = 1000;

/** Every stage is the same size, so the eye reads position as meaning and not importance. */
const NODE_H = 76;
const SPINE_W = 150;
const SPINE_Y = 440;
/** Stage pitch along the spine: eleven stages at 150 wide with a 12 gutter. */
const spineX = (i: number) => 60 + i * (SPINE_W + 12);

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
  /** Stroke and text. */
  colour: string;
  /** Fill behind a stage on this lane. */
  tint: string;
  /** The lane's own bounding box, which is also its camera target. */
  box: Rect;
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
   The slide uses amber, green, pink and blue. Those are its own palette and would fight every
   other surface in this app, so each lane takes a step down the green ramp already declared in
   globals.css instead. The lanes stay as distinguishable from one another as the slide's four
   hues, and the page still looks like the rest of the product. */
export const LANES: Lane[] = [
  {
    id: 'source-to-catalog',
    label: 'Source to Catalog',
    colour: '#6AAF8E',
    tint: '#F2F9F5',
    box: { x: 460, y: 30, w: 320, h: 380 },
  },
  {
    id: 'demand-to-pay',
    label: 'Demand to Pay',
    colour: '#307c4c',
    tint: '#EAF4EE',
    box: { x: 40, y: 380, w: 1840, h: 200 },
  },
  {
    id: 'logistics',
    label: 'Logistics',
    colour: '#1f5733',
    tint: '#EDF3EF',
    box: { x: 835, y: 630, w: 430, h: 270 },
  },
  {
    id: 'inventory',
    label: 'Inventory',
    colour: '#2E6B47',
    tint: '#F1F6F3',
    box: { x: 40, y: 770, w: 720, h: 140 },
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
    y: 60,
    w: 180,
    h: NODE_H,
    toolIds: ['sourceguide', 'sns-registry'],
  },
  {
    id: 'contract',
    laneId: 'source-to-catalog',
    label: 'Contract',
    x: 531,
    y: 180,
    w: 180,
    h: NODE_H,
    toolIds: ['sirion'],
  },
  {
    id: 'catalog',
    laneId: 'source-to-catalog',
    label: 'Catalog',
    x: 531,
    y: 300,
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
    y: 660,
    w: 150,
    h: NODE_H,
    toolIds: ['po-expediting'],
  },
  {
    id: 'logistics-procure',
    laneId: 'logistics',
    label: 'Freight Procurement',
    x: 870,
    y: 790,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'logistics-tracking',
    laneId: 'logistics',
    label: 'Tracking',
    x: 1032,
    y: 660,
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
    y: 800,
    w: 180,
    h: NODE_H,
    toolIds: ['translytix'],
  },
  {
    id: 'physical-counting',
    laneId: 'inventory',
    label: 'Physical Counting',
    x: 256,
    y: 800,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'goods-issue',
    laneId: 'inventory',
    label: 'Goods Issue',
    x: 422,
    y: 800,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
  {
    id: 'goods-receipt',
    laneId: 'inventory',
    label: 'Goods Receipt',
    x: 588,
    y: 800,
    w: 150,
    h: NODE_H,
    toolIds: [],
  },
];

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
    via: [{ x: 135, y: 98 }],
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
    via: [{ x: 1107, y: 828 }],
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
      { x: 663, y: 955 },
      { x: 1269, y: 955 },
    ],
  },
];

/* ─── Phases ─────────────────────────────────────────────────────────────────────────────────
   The four bands above the spine. They are what a reader clicks first, so each one's extent is
   also a camera target. */
export const PHASES: Phase[] = [
  {
    id: 'demand',
    label: 'Demand',
    stageIds: ['demand-forecasting', 'demand-creation', 'demand-pr-approval'],
    x: 52,
    w: 490,
  },
  {
    id: 'procure',
    label: 'Procure',
    stageIds: ['supplier-assessment', 'supplier-po-approval', 'supplier-acknowledgement'],
    x: 538,
    w: 490,
  },
  {
    id: 'deliver',
    label: 'Deliver',
    stageIds: ['delivery', 'delivery-acknowledgment'],
    x: 1024,
    /* 316, not 328: at 328 this band's right edge met Pay's left edge exactly and the two
       read as one long pill. */
    w: 316,
  },
  {
    id: 'pay',
    label: 'Pay',
    stageIds: ['payment-request', 'three-way-match', 'pay'],
    x: 1348,
    w: 490,
  },
];

/* ─── Tools that serve no single stage ───────────────────────────────────────────────────────
   Analytics reads the whole chain, Learning Hub teaches it, and the Travel Portal is not part
   of it at all. Pinning each to its nearest stage would be three small lies, so they get a rail
   of their own beneath the diagram and the view says plainly that they sit across it. */
export const OFF_CHAIN_TOOL_IDS: string[] = [
  'supply-chain-analytics',
  'learning-hub',
  'travel-portal',
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
  const covered = STAGES.filter((stage) => stage.toolIds.length > 0).length;
  return { total: STAGES.length, covered, gaps: STAGES.length - covered };
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
