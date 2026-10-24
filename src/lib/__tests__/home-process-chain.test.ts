import { describe, expect, it } from 'vitest';
import {
  ACROSS_THE_CHAIN,
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  CHAR_W,
  EDGES,
  LANES,
  LANE_BY_ID,
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
import { BOX, tailLayout } from '@/app/home/chain/chainTheme';

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
  const across = new Set(ACROSS_THE_CHAIN.map((a) => a.toolId));
  const offChain = new Set(OFF_CHAIN_TOOL_IDS);

  it.each(TOOLS.map((t) => [t.id, t.name] as const))(
    '%s is on a stage, on the rail, or declared off-chain',
    (id) => {
      expect(
        placed.has(id) || across.has(id) || offChain.has(id),
        `"${id}" is in the launcher but nowhere on the home page's chain view. Put it on ` +
          'a stage in src/lib/home/process-chain.ts, add it to ACROSS_THE_CHAIN if it ' +
          'serves every stage, or to OFF_CHAIN_TOOL_IDS if it serves none.',
      ).toBe(true);
    },
  );

  it('places no tool that the launcher does not have', () => {
    const known = new Set(TOOLS.map((t) => t.id));
    for (const id of [...placed, ...across, ...offChain]) {
      expect(known.has(id), `the chain places "${id}", which is not a tool`).toBe(true);
    }
  });

  it('never shows a tool on the rail AND on a stage', () => {
    /* Spend Classification was on both -- on Catalog, where it belongs, and again on the
       rail -- and a reader seeing one tool in two places has to work out whether they are
       the same thing. The rail is for tools with no single home, which is a claim the
       drawing can contradict. */
    for (const { toolId } of ACROSS_THE_CHAIN) {
      expect(
        placed.has(toolId),
        `"${toolId}" is on the "across the chain" rail and also on a stage`,
      ).toBe(false);
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
    /* The dotted return from Goods Receipt is routed under the whole diagram, and its
       waypoints sat at y=955 after the canvas was shortened to 930 -- so the line left the
       bottom of the drawing and came back, invisibly, with every test passing. They are
       computed from a routing intent now, and this checks the whole line rather than only
       the corners, which is strictly more than the hand-placed version could be asked. */
    for (const edge of EDGES) {
      for (const point of edge.points) {
        expect(point.x, `${edge.from}->${edge.to} x`).toBeGreaterThanOrEqual(0);
        expect(point.x, `${edge.from}->${edge.to} x`).toBeLessThanOrEqual(CHAIN_WIDTH);
        expect(point.y, `${edge.from}->${edge.to} y`).toBeGreaterThanOrEqual(0);
        expect(point.y, `${edge.from}->${edge.to} y`).toBeLessThanOrEqual(CHAIN_HEIGHT);
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
  it('counts coverage over the process, and not over what sits beside it', () => {
    const c = coverage();
    /* Every box on the canvas is a step again, now that the tools serving the whole chain
       are on a rail below it rather than in a lane of their own. The filter stays: it is
       what stops a future aside lane quietly inflating both halves of the figure, and it
       is the reason the rail's four tools are not counted as four more stages. */
    const inProcess = STAGES.filter((s) => !LANE_BY_ID[s.laneId].aside);
    expect(inProcess.length).toBe(STAGES.length);
    expect(c.total).toBe(inProcess.length);
    expect(c.covered + c.gaps).toBe(c.total);
    /* This used to assert there ARE gaps, with a note that reaching zero would mean the
       wording needed rethinking rather than the number. It reached zero -- ShipWaves took
       Freight Procurement, the last uncovered step -- and the wording was rethought: the
       heading reads "Every one of the 21 stages has a system", and the key drops its
       hollow line because nothing is drawn hollow. So the invariant is not "there are
       gaps", it is that the count and the covered count still describe the same set. */
    expect(c.covered + c.gaps).toBe(c.total);
    expect(c.gaps).toBeGreaterThanOrEqual(0);
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
  /* The canvas's own BOX constants, from ProcessChain.tsx.
   *
   * Type inside a stage is in canvas units -- a fixed fraction of the box -- so unlike the
   * lane and phase labels it does not depend on the zoom or on how wide the element is, and
   * one set of numbers describes every screen. */
  /* BOX and tailLayout are imported, not transcribed: a copy of them here is exactly how
     the last set of these drifted from the canvas they were supposed to describe. The tail
     holds tool chips AND system badges, and both count towards what is left for the name --
     modelling only the chips would let a stage that runs on SAP overflow without the suite
     noticing. */

  const layout = (stage: (typeof STAGES)[number]) => {
    const { tailH } = tailLayout(stage);
    const room = stage.h - 2 * BOX.pad - BOX.blockGap - tailH;
    const maxLines = Math.max(1, Math.floor(room / (BOX.label * BOX.leading)));
    return { ...fitLabel(stage.label, stage.w, BOX.label, maxLines), maxLines, tailH };
  };

  it.each(STAGES.map((s) => [s.id, s.label] as const))('%s stays inside its box', (id) => {
    const stage = STAGE_BY_ID[id];
    const { lines, size, maxLines } = layout(stage);

    /* A label drawn wider than its box runs across the stage next to it, which on a
       12-unit gutter is every neighbour along the spine. */
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

    /* Shrinking is the escape hatch when a name will not fit, but a stage nobody can read
       is no better than one that overlaps.
       The floor was 0.78 until stages started carrying a system badge as well as a tool.
       "Planning / Demand Forecasting" with Translytix and SAP under it has room for two
       lines rather than three, and two lines of that name in a 150-unit box needs 73%.
       Three lines will not fit in a 120-unit box alongside two tail items at any size, so
       this is the real constraint rather than a number chosen to make a test pass. */
    expect(
      size / BOX.label,
      `"${id}" had to shrink to ${Math.round((size / BOX.label) * 100)}% to fit`,
    ).toBeGreaterThan(0.72);

    /* And it must still say what it says -- clipping a word would hide which stage this is. */
    expect(lines.join(' ')).toBe(stage.label);
  });

  it('fills a good share of every box', () => {
    /* The complaint this replaced: a 120-unit box with a word adrift in the middle of it.
       The name, the gap and the chips should take up most of the height available to them,
       which is the box less its padding. */
    for (const stage of STAGES) {
      const { lines, size, tailH } = layout(stage);
      const content = lines.length * size * BOX.leading + BOX.blockGap + tailH;
      const usable = stage.h - 2 * BOX.pad;
      expect(
        content / usable,
        `"${stage.id}" fills only ${Math.round((content / usable) * 100)}% of its box`,
      ).toBeGreaterThan(0.4);
      /* ...and must not spill out of it. */
      expect(content, `"${stage.id}" overflows its box`).toBeLessThanOrEqual(usable);
    }
  });

  it('never breaks a word across lines', () => {
    for (const stage of STAGES) {
      const { lines } = layout(stage);
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
