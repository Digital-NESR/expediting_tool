import { describe, expect, it } from 'vitest';
import {
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  EDGES,
  LANES,
  OFF_CHAIN_TOOL_IDS,
  PHASES,
  STAGES,
  STAGE_BY_ID,
  boundsOf,
  coverage,
  edgePath,
  placedToolIds,
  stagesForTool,
} from '@/lib/home/process-chain';
import { TOOLS } from '@/app/home/tools';

/**
 * The process chain's model.
 *
 * It is a drawing, so most of what could go wrong is invisible to a type checker and obvious
 * only on screen: an edge pointing at a stage that was renamed, two boxes overlapping, a lane
 * extending past the canvas. Those are cheap to assert and expensive to notice.
 *
 * The first block is the one that earns its keep. A tool added to the launcher appears in the
 * card grid automatically, and would be silently absent from the chain forever -- the view
 * would simply be a little less true each time, with nothing to say so. That test fails until
 * somebody places it.
 */

describe('every tool is accounted for', () => {
  const placed = new Set(placedToolIds());
  const offChain = new Set(OFF_CHAIN_TOOL_IDS);

  it.each(TOOLS.map((t) => [t.id, t.name] as const))(
    '%s is placed on a stage or declared off-chain',
    (id) => {
      expect(
        placed.has(id) || offChain.has(id),
        `"${id}" is in the launcher but nowhere on the chain. Put it on a stage in ` +
          'src/lib/home/process-chain.ts, or add it to OFF_CHAIN_TOOL_IDS if it serves no ' +
          'single stage.',
      ).toBe(true);
    },
  );

  it('places no tool that the launcher does not have', () => {
    const known = new Set(TOOLS.map((t) => t.id));
    for (const id of [...placed, ...offChain]) {
      expect(known.has(id), `the chain places "${id}", which is not a tool`).toBe(true);
    }
  });

  it('does not both place a tool and call it off-chain', () => {
    const both = [...placed].filter((id) => offChain.has(id));
    expect(both, 'a tool is on a stage and on the rail at once').toEqual([]);
  });
});

describe('the graph holds together', () => {
  it('every edge joins two real stages', () => {
    for (const edge of EDGES) {
      expect(STAGE_BY_ID[edge.from], `edge from "${edge.from}"`).toBeDefined();
      expect(STAGE_BY_ID[edge.to], `edge to "${edge.to}"`).toBeDefined();
    }
  });

  it('every phase names real stages, all of them on the spine', () => {
    for (const phase of PHASES) {
      for (const id of phase.stageIds) {
        const stage = STAGE_BY_ID[id];
        expect(stage, `phase "${phase.id}" names "${id}"`).toBeDefined();
        expect(stage.laneId, `"${id}" is in a phase but not on the spine`).toBe('demand-to-pay');
      }
    }
  });

  it('accounts for every spine stage in exactly one phase', () => {
    /* A spine stage in no phase would render with no band above it and no way to fly to it. */
    const inPhases = PHASES.flatMap((p) => p.stageIds);
    const spine = STAGES.filter((s) => s.laneId === 'demand-to-pay').map((s) => s.id);
    expect([...inPhases].sort()).toEqual([...spine].sort());
  });

  it('gives every stage a unique id', () => {
    const ids = STAGES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws a path for every edge', () => {
    for (const edge of EDGES) {
      const d = edgePath(edge);
      expect(d.startsWith('M'), `edge ${edge.from}->${edge.to}`).toBe(true);
      expect(d).not.toContain('NaN');
    }
  });
});

describe('the layout is inside the canvas and does not collide', () => {
  it('keeps every stage on the canvas', () => {
    for (const s of STAGES) {
      expect(s.x, s.id).toBeGreaterThanOrEqual(0);
      expect(s.y, s.id).toBeGreaterThanOrEqual(0);
      expect(s.x + s.w, s.id).toBeLessThanOrEqual(CHAIN_WIDTH);
      expect(s.y + s.h, s.id).toBeLessThanOrEqual(CHAIN_HEIGHT);
    }
  });

  it('keeps every lane band on the canvas', () => {
    for (const lane of LANES) {
      expect(lane.box.x + lane.box.w, lane.id).toBeLessThanOrEqual(CHAIN_WIDTH);
      expect(lane.box.y + lane.box.h, lane.id).toBeLessThanOrEqual(CHAIN_HEIGHT);
    }
  });

  it('never overlaps two stages', () => {
    /* Overlapping boxes are the one layout error that looks like a rendering bug rather than a
       data one, so it is worth catching here where the message can name both. */
    for (let i = 0; i < STAGES.length; i += 1) {
      for (let j = i + 1; j < STAGES.length; j += 1) {
        const a = STAGES[i];
        const b = STAGES[j];
        const apart =
          a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `"${a.id}" overlaps "${b.id}"`).toBe(true);
      }
    }
  });

  it('puts each lane in exactly one place', () => {
    const laneIds = STAGES.map((s) => s.laneId);
    for (const lane of LANES) {
      expect(laneIds, `lane "${lane.id}" has no stages`).toContain(lane.id);
    }
  });
});

describe('the derived figures', () => {
  it('counts coverage over every stage', () => {
    const c = coverage();
    expect(c.total).toBe(STAGES.length);
    expect(c.covered + c.gaps).toBe(c.total);
    /* The whole premise of the view: there ARE gaps. If this ever reaches zero the wording
       under the canvas needs rethinking, not just the number. */
    expect(c.gaps).toBeGreaterThan(0);
  });

  it('finds every stage a tool appears on, across lanes', () => {
    /* Translytix is the case that matters: it is on the spine AND in Inventory, and a
       single-stage lookup would have quietly dropped one of them. */
    const lanes = stagesForTool('translytix').map((s) => s.laneId);
    expect(lanes).toContain('demand-to-pay');
    expect(lanes).toContain('inventory');
  });

  it('returns the whole canvas when asked to bound nothing', () => {
    expect(boundsOf([])).toEqual({ x: 0, y: 0, w: CHAIN_WIDTH, h: CHAIN_HEIGHT });
  });

  it('bounds a group of stages with padding around them', () => {
    const phase = PHASES[0];
    const box = boundsOf(phase.stageIds, 10);
    const first = STAGE_BY_ID[phase.stageIds[0]];
    expect(box.x).toBe(first.x - 10);
    expect(box.w).toBeGreaterThan(first.w);
  });

  it('ignores an unknown stage id rather than producing NaN', () => {
    const box = boundsOf(['nope', 'demand-creation']);
    expect(Number.isFinite(box.x) && Number.isFinite(box.w)).toBe(true);
  });
});
