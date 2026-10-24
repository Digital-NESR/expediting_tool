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
  ['source', 154, 40, 180, 120],
  ['contract', 350, 40, 180, 120],
  ['catalog', 546, 40, 180, 120],
  ['demand-forecasting', 75, 290, 150, 120],
  ['demand-creation', 237, 290, 150, 120],
  ['demand-pr-approval', 399, 290, 150, 120],
  ['supplier-assessment', 561, 290, 150, 120],
  ['supplier-po-approval', 723, 290, 150, 120],
  ['supplier-acknowledgement', 885, 290, 150, 120],
  ['delivery', 1047, 290, 150, 120],
  ['delivery-acknowledgment', 1209, 290, 150, 120],
  ['payment-request', 1371, 290, 150, 120],
  ['three-way-match', 1533, 290, 150, 120],
  ['pay', 1695, 290, 150, 120],
  ['expediting-readiness', 885, 532, 150, 120],
  ['logistics-procure', 1047, 532, 150, 120],
  ['logistics-tracking', 1209, 532, 150, 120],
  ['stock-replenishment', 75, 522, 180, 120],
  ['physical-counting', 271, 522, 150, 120],
  ['goods-issue', 437, 522, 150, 120],
  ['goods-receipt', 603, 522, 150, 120],
  ['across-analytics', 78, 738, 340, 74],
  ['across-learning', 434, 738, 340, 74],
  ['across-travel', 790, 738, 340, 74],
  ['across-assistant', 1146, 738, 340, 74],
  ['across-taxonomy', 1502, 738, 340, 74],
];

/** id, x, y, w, h */
const LANE_GEOMETRY: [string, number, number, number, number][] = [
  ['source-to-catalog', 130, 8, 620, 172],
  ['demand-to-pay', 40, 204, 1840, 238],
  ['logistics', 835, 486, 574, 184],
  ['inventory', 40, 486, 748, 172],
  ['across', 40, 708, 1840, 120],
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
    expect({ w: COMPUTED.width, h: COMPUTED.height }).toEqual({ w: 1920, h: 834 });
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

  it('routes the three bends the drawing has, and nothing else', () => {
    const bent = COMPUTED.edges.filter((e) => e.points.length > 2);
    expect(bent.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      'goods-receipt->delivery-acknowledgment',
      'source->demand-forecasting',
    ]);
    const channel = bent.find((e) => e.from === 'goods-receipt')!;
    expect(channel.points.map((p) => p.y)).toEqual([582, 686, 686, 350]);
  });
});
