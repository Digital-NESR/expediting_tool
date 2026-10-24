import { describe, expect, it } from 'vitest';
import {
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  CHAR_W,
  EDGES,
  LANES,
  OFF_CHAIN_TOOL_IDS,
  PHASES,
  PHASE_BAND,
  STAGES,
  STAGE_BY_ID,
  boundsOf,
  coverage,
  edgePath,
  fitLabel,
  placedToolIds,
  stagesForTool,
  wrap,
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

  it('routes every edge inside the canvas', () => {
    /* The dotted return from Goods Receipt is routed under the whole diagram by a pair of
       hand-placed waypoints, and they sat at y=955 after the canvas was shortened to 930 --
       so the line left the bottom of the drawing and came back, invisibly, and every test
       passed. Waypoints are derived from the layout constants now; this is what says so. */
    for (const edge of EDGES) {
      for (const point of edge.via ?? []) {
        expect(point.x, `${edge.from}->${edge.to} waypoint x`).toBeGreaterThanOrEqual(0);
        expect(point.x, `${edge.from}->${edge.to} waypoint x`).toBeLessThanOrEqual(CHAIN_WIDTH);
        expect(point.y, `${edge.from}->${edge.to} waypoint y`).toBeGreaterThanOrEqual(0);
        expect(point.y, `${edge.from}->${edge.to} waypoint y`).toBeLessThanOrEqual(CHAIN_HEIGHT);
      }
    }
  });

  it('never lets two phase bands touch', () => {
    /* Each band is a fully rounded pill, so bands that merely abut -- or, as three of these
       did, overlap by four units -- read as one long pill with two names in it. The gap is
       whatever the spine leaves between the two stages either side of the join, and the
       component then insets what it draws by PHASE_BAND.inset on top of that. */
    const bands = [...PHASES].sort((a, b) => a.x - b.x);
    for (let i = 1; i < bands.length; i += 1) {
      const gap = bands[i].x - (bands[i - 1].x + bands[i - 1].w);
      expect(
        gap + 2 * PHASE_BAND.inset,
        `"${bands[i - 1].id}" and "${bands[i].id}" are drawn ${gap + 2 * PHASE_BAND.inset} units apart`,
      ).toBeGreaterThanOrEqual(PHASE_BAND.h / 2);
    }
  });

  it('spans each phase band across exactly the stages it names', () => {
    for (const phase of PHASES) {
      const boxes = phase.stageIds.map((id) => STAGE_BY_ID[id]);
      expect(phase.x, phase.id).toBe(Math.min(...boxes.map((b) => b.x)));
      expect(phase.x + phase.w, phase.id).toBe(Math.max(...boxes.map((b) => b.x + b.w)));
    }
  });

  it('keeps the phase band inside the spine lane', () => {
    const spine = LANES.find((l) => l.id === 'demand-to-pay')!;
    const firstStage = STAGES.find((s) => s.laneId === 'demand-to-pay')!;
    expect(PHASE_BAND.y).toBeGreaterThan(spine.box.y);
    /* Below the lane's own label, and clear of the stages underneath it. */
    expect(PHASE_BAND.y + PHASE_BAND.h).toBeLessThan(firstStage.y);
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
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
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

describe('every stage name fits the box it is drawn in', () => {
  /* The canvas's own arithmetic, from ProcessChain.tsx.
   *
   * Type there is written in the CSS pixels it should RENDER at and converted to canvas units
   * against the measured width of the <svg>, so the same label occupies a different number of
   * units on a wide monitor than on a narrow one. The fit is tightest at the fitted overview,
   * where the viewBox is the whole canvas, and tighter the NARROWER the element -- so these
   * walk a range of plausible widths rather than assuming one.
   */
  const STAGE_PX = 11.5; // SIZES.stage at the fitted view
  const CHIP_PX = 13; // SIZES.chipH at the fitted view
  const WIDTHS = [1024, 1200, 1440, 1920];

  const layout = (stage: (typeof STAGES)[number], elementPx: number) => {
    const u = (cssPx: number) => (cssPx * CHAIN_WIDTH) / elementPx;
    const chipH = u(CHIP_PX);
    const chipBand =
      stage.toolIds.length === 0 ? u(16) : stage.toolIds.length * (chipH + u(2.5)) + u(5);
    const base = u(STAGE_PX);
    const maxLines = Math.max(1, Math.floor((stage.h - 10 - chipBand) / (base * 1.12)));
    return { ...fitLabel(stage.label, stage.w, base, maxLines), base, maxLines };
  };

  const cases = WIDTHS.flatMap((px) => STAGES.map((s) => [px, s.id, s.label] as const));

  it.each(cases)('at %ipx wide, %s stays inside its box', (px, id) => {
    const stage = STAGE_BY_ID[id];
    const { lines, size, maxLines } = layout(stage, px);

    /* The failure this exists for: a label drawn wider than its box runs across the stage
       next to it, which on a 12-unit gutter is every neighbour on the spine. */
    for (const line of lines) {
      const width = line.length * size * CHAR_W;
      expect(
        width,
        `"${line}" is ${Math.round(width)} units wide in a ${stage.w}-unit box`,
      ).toBeLessThanOrEqual(stage.w - 14);
    }

    expect(
      lines.length,
      `"${stage.label}" needs more lines than "${id}" has room for`,
    ).toBeLessThanOrEqual(maxLines);

    /* And it must still say what it says -- clipping a word would hide which stage this is. */
    expect(lines.join(' ')).toBe(stage.label);
  });

  it('keeps every label readable at a normal window width', () => {
    /* Shrinking is the escape hatch when a name will not fit, but a stage nobody can read is
       no better than one that overlaps. Checked at the width the view is actually used at --
       narrower than this and the diagram is simply too dense, which is a layout question
       rather than a wrapping one. */
    for (const stage of STAGES) {
      const { size, base } = layout(stage, 1440);
      expect(
        size / base,
        `"${stage.id}" had to shrink to ${Math.round((size / base) * 100)}% to fit`,
      ).toBeGreaterThan(0.72);
    }
  });

  it('never breaks a word across lines', () => {
    for (const stage of STAGES) {
      const { lines } = layout(stage, 1440);
      for (const line of lines) expect(stage.label).toContain(line);
    }
  });

  it('wraps to the budget it is given', () => {
    expect(wrap('Demand Supply Validation (3WM)', 14)).toEqual([
      'Demand Supply',
      'Validation',
      '(3WM)',
    ]);
  });

  it('shrinks rather than overflow when one word is wider than the box', () => {
    /* No wrap can help a single long word, so the only lever left is the type size. */
    const { lines, size } = fitLabel('Acknowledgement', 120, 16, 2);
    expect(lines).toEqual(['Acknowledgement']);
    expect(size).toBeLessThan(16);
    expect(lines[0].length * size * CHAR_W).toBeLessThanOrEqual(120 - 14);
  });
});
