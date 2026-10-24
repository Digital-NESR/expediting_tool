import { describe, expect, it } from 'vitest';
import { CHAIN_HEIGHT, CHAIN_WIDTH, COMPUTED, PHASE_BAND } from '@/lib/home/process-chain';

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

/** id, x, y, w, h */
const STAGE_GEOMETRY: [string, number, number, number, number][] = [
  ['source', 169, 40, 210, 120],
  ['contract', 395, 40, 210, 120],
  ['catalog', 621, 40, 210, 120],
  ['demand-forecasting', 60, 290, 180, 120],
  ['demand-creation', 252, 290, 180, 120],
  ['demand-pr-approval', 444, 290, 180, 120],
  ['supplier-assessment', 636, 290, 180, 120],
  ['supplier-po-approval', 828, 290, 180, 120],
  ['supplier-acknowledgement', 1020, 290, 180, 120],
  ['delivery', 1212, 290, 180, 120],
  ['delivery-acknowledgment', 1404, 290, 180, 120],
  ['payment-request', 1596, 290, 180, 120],
  ['three-way-match', 1788, 290, 180, 120],
  ['pay', 1980, 290, 180, 120],
  ['expediting-readiness', 1020, 532, 180, 120],
  ['logistics-procure', 1212, 532, 180, 120],
  ['logistics-tracking', 1404, 532, 180, 120],
  ['stock-replenishment', 60, 522, 210, 120],
  ['physical-counting', 286, 522, 180, 120],
  ['goods-issue', 482, 522, 180, 120],
  ['goods-receipt', 678, 522, 180, 120],
  ['across-analytics', 78, 738, 400, 74],
  ['across-learning', 494, 738, 400, 74],
  ['across-travel', 910, 738, 400, 74],
  ['across-assistant', 1326, 738, 400, 74],
  ['across-taxonomy', 1742, 738, 400, 74],
];

/** id, x, y, w, h */
const LANE_GEOMETRY: [string, number, number, number, number][] = [
  ['source-to-catalog', 145, 8, 710, 172],
  ['demand-to-pay', 40, 204, 2140, 238],
  ['logistics', 970, 486, 664, 184],
  ['inventory', 40, 486, 838, 172],
  ['across', 40, 708, 2140, 120],
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
    expect({ w: COMPUTED.width, h: COMPUTED.height }).toEqual({ w: 2220, h: 834 });
    expect(CHAIN_WIDTH).toBe(COMPUTED.width);
    expect(CHAIN_HEIGHT).toBe(COMPUTED.height);
  });

  it('puts the phase pills on one row inside the spine band', () => {
    expect(PHASE_BAND.y).toBe(238);
    const spine = COMPUTED.laneById['demand-to-pay'].box;
    const firstStage = COMPUTED.stageById['demand-forecasting'];
    expect(PHASE_BAND.y).toBeGreaterThan(spine.y);
    expect(PHASE_BAND.y + PHASE_BAND.h).toBeLessThan(firstStage.y);
  });

  it('turns every cross-lane connector in the gap, and runs the rest straight', () => {
    const bent = COMPUTED.edges.filter((e) => e.points.length > 2);
    expect(bent.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      'demand-forecasting->stock-replenishment',
      'goods-receipt->delivery-acknowledgment',
      'logistics-tracking->delivery',
      'source->demand-forecasting',
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
});
