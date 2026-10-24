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
 * The slide's own shape: Source to Catalog a column descending into Supplier Assessment,
 * the spine left to right, Logistics looping out below it and back in, Inventory along the
 * bottom. Six rows of boxes, which is what the drawing costs and why its boxes are the size
 * they are -- see the canvas test below.
 *
 * Read down the `x` column for the spine and Logistics: every box in the loop lands in a
 * spine column, because the lane takes the spine's own pitch from one of the spine's own
 * stages. That is what makes both of Logistics' ties to the main line plain vertical drops.
 */
const STAGE_GEOMETRY: [string, number, number, number, number][] = [
  ['source', 553, 16, 330, 76],
  ['contract', 553, 114, 330, 76],
  ['catalog', 553, 212, 330, 76],
  ['demand-forecasting', 50, 418, 160, 120],
  ['demand-creation', 246, 418, 160, 120],
  ['demand-pr-approval', 442, 418, 160, 120],
  ['supplier-assessment', 638, 418, 160, 120],
  ['supplier-po-approval', 834, 418, 160, 120],
  ['supplier-acknowledgement', 1030, 418, 160, 120],
  ['delivery', 1226, 418, 160, 120],
  ['delivery-acknowledgment', 1422, 418, 160, 120],
  ['payment-request', 1618, 418, 160, 120],
  ['three-way-match', 1814, 418, 160, 120],
  ['pay', 2010, 418, 160, 120],
  ['expediting-readiness', 1030, 630, 160, 100],
  ['logistics-tracking', 1226, 630, 160, 100],
  ['logistics-procure', 1030, 758, 160, 100],
  ['stock-replenishment', 50, 758, 230, 100],
  ['physical-counting', 316, 758, 200, 100],
  ['goods-issue', 552, 758, 200, 100],
  ['goods-receipt', 788, 758, 200, 100],
];

/**
 * id, x, y, w, h
 *
 * No band is drawn behind a lane -- the colour is in the line, not in a tinted rectangle
 * with the lane's name at the left. These rects are still computed, because a lane is what
 * the filter pills fly the camera to, and they still have to be checked: a lane box is the
 * hull of its own stations, so a wrong one means a wrong stage.
 *
 * Logistics and Inventory share a band and must not overlap across it. They are 26 units
 * apart, which is the whole reason the lower half of the drawing is two rows and not four.
 */
const LANE_GEOMETRY: [string, number, number, number, number][] = [
  ['source-to-catalog', 533, 8, 370, 290],
  ['demand-to-pay', 40, 362, 2140, 188],
  ['logistics', 1014, 620, 388, 250],
  ['inventory', 34, 620, 970, 250],
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
    /*
     * Height is the figure that matters, and it is what the slide's shape costs.
     *
     * The drawing is scaled to fit a card roughly 1600 by 490, and the element is given the
     * canvas's aspect ratio -- so a box renders at its own units times 490/height, and
     * NOTHING else moves it. Widening the canvas adds empty paper; narrowing it does not
     * help either. Six rows of boxes in 892 units means a spine station lands about 66
     * pixels tall.
     *
     * Three rows would land it near 90, which is what the all-horizontal version did. That
     * version read as four swimlanes, which is the thing this layout exists not to be. The
     * trade is deliberate and this is where it is written down.
     */
    expect({ w: COMPUTED.width, h: COMPUTED.height }).toEqual({ w: 2220, h: 892 });
    expect(CHAIN_WIDTH).toBe(COMPUTED.width);
    expect(CHAIN_HEIGHT).toBe(COMPUTED.height);
  });

  it('puts the phase pills on one row inside the spine band', () => {
    expect(PHASE_BAND.y).toBe(372);
    const spine = COMPUTED.laneById['demand-to-pay'].box;
    const firstStage = COMPUTED.stageById['demand-forecasting'];
    expect(PHASE_BAND.y).toBeGreaterThan(spine.y);
    expect(PHASE_BAND.y + PHASE_BAND.h).toBeLessThan(firstStage.y);
  });

  it('turns every cross-lane connector in the gap, and runs the rest straight', () => {
    const bent = COMPUTED.edges.filter((e) => e.points.length > 2);
    /*
     * Four, and every other line on the drawing is straight.
     *
     * The three ties between a branch and the main line that are NOT here are the point of
     * the shape: Catalog drops into Supplier Assessment, Supplier Acknowledgement drops into
     * Expediting, Tracking climbs back into Delivery, all of them plain verticals, because
     * each branch is anchored to the stage it leaves.
     */
    expect(bent.map((e) => `${e.from}->${e.to}`).sort()).toEqual([
      'demand-forecasting->stock-replenishment',
      'goods-receipt->delivery-acknowledgment',
      'logistics-procure->logistics-tracking',
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

  it('keeps every branch clear of every other box', () => {
    /*
     * The two routes that cross the drawing rather than dropping straight out of it.
     *
     * Source leaves its column sideways and runs down the far left; Inventory runs along
     * the foot and climbs back up to Delivery Acknowledgment. Both were drawn through a box
     * at some point -- the inventory tie used to climb through Tracking, invisible only
     * because the lines were thin -- so both are checked against every box there is.
     */
    const crossing = ['source->demand-forecasting', 'goods-receipt->delivery-acknowledgment'];
    for (const key of crossing) {
      const e = COMPUTED.edges.find((x) => `${x.from}->${x.to}` === key)!;
      for (let i = 1; i < e.points.length; i += 1) {
        const a = e.points[i - 1];
        const b = e.points[i];
        for (const box of COMPUTED.stages) {
          if (box.id === e.from || box.id === e.to) continue;
          /* An axis-aligned segment meets a rect when it overlaps on both axes. */
          const hits =
            Math.min(a.x, b.x) < box.x + box.w &&
            Math.max(a.x, b.x) > box.x &&
            Math.min(a.y, b.y) < box.y + box.h &&
            Math.max(a.y, b.y) > box.y;
          expect(hits, `${key} segment ${i} runs through "${box.id}"`).toBe(false);
        }
      }
    }
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
