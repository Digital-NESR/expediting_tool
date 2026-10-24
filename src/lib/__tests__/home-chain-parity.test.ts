import { describe, expect, it } from 'vitest';
import {
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  COMPUTED,
  JUNCTIONS,
  PHASE_BAND,
} from '@/lib/home/process-chain';

/**
 * The drawing, written down.
 *
 * Every coordinate in the supply-chain map was placed by hand over several rounds of
 * looking at it. They are computed now, from SUPPLY_CHAIN_SPEC, and this table is what
 * made that swap safe: it was written from the hand-placed values and the engine had to
 * reproduce all twenty-six boxes exactly before the literals were deleted.
 *
 * It keeps earning its place afterwards, in a different way. Nothing else stops somebody
 * nudging a band gap or a lane's padding and silently redrawing the slide -- the suite
 * would stay green because every other test checks relationships, not positions. A diff
 * of this file is a diff of the picture, which is exactly what a reviewer needs to see.
 *
 * If you MEANT to move something: look at /dev-preview/chain, satisfy yourself it is
 * right, then update the number. Do not update the number to make the test pass.
 */

/**
 * id, x, y, w, h
 *
 * Read down the `x` column: every lower-row box lands in a spine column. That is not a
 * coincidence to be preserved by hand, it is Inventory and Logistics taking the spine's
 * own pitch from one of the spine's own stages, and it is what lets four of the six
 * cross-lane lines be straight drops instead of turns.
 */
const STAGE_GEOMETRY: [string, number, number, number, number][] = [
  ['source', 171, 20, 190, 120],
  ['contract', 397, 20, 190, 120],
  ['catalog', 623, 20, 190, 120],
  ['demand-forecasting', 50, 300, 160, 120],
  ['demand-creation', 246, 300, 160, 120],
  ['demand-pr-approval', 442, 300, 160, 120],
  ['supplier-assessment', 638, 300, 160, 120],
  ['supplier-po-approval', 834, 300, 160, 120],
  ['supplier-acknowledgement', 1030, 300, 160, 120],
  ['delivery', 1226, 300, 160, 120],
  ['delivery-acknowledgment', 1422, 300, 160, 120],
  ['payment-request', 1618, 300, 160, 120],
  ['three-way-match', 1814, 300, 160, 120],
  ['pay', 2010, 300, 160, 120],
  ['expediting-readiness', 834, 540, 160, 120],
  ['logistics-procure', 1030, 540, 160, 120],
  ['logistics-tracking', 1226, 540, 160, 120],
  ['stock-replenishment', 50, 540, 160, 120],
  ['physical-counting', 246, 540, 160, 120],
  ['goods-issue', 442, 540, 160, 120],
  ['goods-receipt', 638, 540, 160, 120],
];

/**
 * id, x, y, w, h
 *
 * No band is drawn behind a lane any more -- the colour is in the line, not in a tinted
 * rectangle with the lane's name at the left. These rects are still computed, because a
 * lane is still what the filter pills fly the camera to, and they still have to be checked:
 * a lane box is the hull of its own stations, so a wrong one means a wrong stage.
 */
const LANE_GEOMETRY: [string, number, number, number, number][] = [
  ['source-to-catalog', 147, 10, 690, 142],
  ['demand-to-pay', 40, 244, 2140, 188],
  ['logistics', 818, 530, 584, 142],
  ['inventory', 34, 530, 780, 142],
];

describe('the layout engine reproduces the drawing', () => {
  it.each(STAGE_GEOMETRY)('%s sits at %i, %i', (id, x, y, w, h) => {
    const s = COMPUTED.stageById[id];
    expect(s, `the engine does not place "${id}" at all`).toBeDefined();
    expect({ x: s.x, y: s.y, w: s.w, h: s.h }).toEqual({ x, y, w, h });
  });

  it.each(LANE_GEOMETRY)('the %s band sits at %i, %i', (id, x, y, w, h) => {
    expect(COMPUTED.laneById[id].box).toEqual({ x, y, w, h });
  });

  it('places exactly these boxes and no others', () => {
    expect(COMPUTED.stages.map((s) => s.id).sort()).toEqual(
      STAGE_GEOMETRY.map(([id]) => id).sort(),
    );
    expect(COMPUTED.lanes.map((l) => l.id).sort()).toEqual(LANE_GEOMETRY.map(([id]) => id).sort());
  });

  it('measures the canvas around them', () => {
    /* The ratio is the number that matters, not either figure on its own: the drawing is
       scaled to fit a card roughly 1600 by 490, so anything much taller than 2220 by 678
       lands small between two side margins and anything flatter lands small between a top
       and a bottom one. 3.27 fills it both ways. */
    expect({ w: COMPUTED.width, h: COMPUTED.height }).toEqual({ w: 2220, h: 678 });
    expect(CHAIN_WIDTH).toBe(COMPUTED.width);
    expect(CHAIN_HEIGHT).toBe(COMPUTED.height);
  });

  it('puts the phase pills on one row inside the spine band', () => {
    expect(PHASE_BAND.y).toBe(254);
    const spine = COMPUTED.laneById['demand-to-pay'].box;
    const firstStage = COMPUTED.stageById['demand-forecasting'];
    expect(PHASE_BAND.y).toBeGreaterThan(spine.y);
    expect(PHASE_BAND.y + PHASE_BAND.h).toBeLessThan(firstStage.y);
  });

  it('turns every cross-lane connector in the gap, and runs the rest straight', () => {
    const bent = COMPUTED.edges.filter((e) => e.points.length > 2);
    /* Three. It was five: Logistics moved one column left so that Tracking sits directly
       under Delivery, which turned two of them into straight drops and freed the column
       Inventory needed to get back to Delivery Acknowledgment. */
    expect(bent.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      'goods-receipt->delivery-acknowledgment',
      'source->demand-forecasting',
      'supplier-acknowledgement->expediting-readiness',
    ]);
    /* Every turn is a right angle: consecutive points share an x or a y. A diagonal here
       is the bug this replaced -- a line from centre to centre across whatever sat
       between, at an angle nothing else on the drawing uses. */
    for (const e of COMPUTED.edges) {
      for (let i = 1; i < e.points.length; i += 1) {
        const a = e.points[i - 1];
        const b = e.points[i];
        expect(a.x === b.x || a.y === b.y, `${e.from}->${e.to} segment ${i} runs diagonally`).toBe(
          true,
        );
      }
    }
  });

  it('gives each route crossing the lower gap a corridor of its own', () => {
    /*
     * Two lines cross the band between the spine and the row below it, in opposite
     * directions: Logistics on its way out at Supplier Acknowledgement, and Inventory on
     * its way back in at Delivery Acknowledgment. Both turn in that band, and left to the
     * default both turn at the halfway mark -- two differently coloured horizontal runs
     * drawn on top of each other, which reads as one line of whichever was painted last.
     * The `turn` fraction is what separates them, and nothing else would notice if it
     * were dropped.
     */
    const runY = (from: string, to: string) => {
      const e = COMPUTED.edges.find((x) => x.from === from && x.to === to)!;
      return e.points.filter((p, i) => i > 0 && p.y === e.points[i - 1].y).map((p) => p.y);
    };
    const logistics = runY('supplier-acknowledgement', 'expediting-readiness');
    const inventory = runY('goods-receipt', 'delivery-acknowledgment');
    expect(logistics).toEqual([480]);
    expect(inventory).toEqual([510]);
  });

  it('marks both ends of every line that changes route, and no others', () => {
    /* A ring per boundary crossing: six cross-lane lines, two ends each. A hop between two
       stations on the same line is not an interchange and must not be ringed. */
    expect(JUNCTIONS).toHaveLength(12);
    for (const j of JUNCTIONS) {
      const box = COMPUTED.stageById[j.stageId];
      const onVerticalEdge = j.x === box.x || j.x === box.x + box.w;
      const onHorizontalEdge = j.y === box.y || j.y === box.y + box.h;
      expect(
        onVerticalEdge || onHorizontalEdge,
        `${j.id} is not on the edge of "${j.stageId}"`,
      ).toBe(true);
      /* ...and ON the box, not floating past a corner. */
      expect(j.x).toBeGreaterThanOrEqual(box.x);
      expect(j.x).toBeLessThanOrEqual(box.x + box.w);
      expect(j.y).toBeGreaterThanOrEqual(box.y);
      expect(j.y).toBeLessThanOrEqual(box.y + box.h);
    }
  });
});
