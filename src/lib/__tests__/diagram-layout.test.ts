import { describe, expect, it } from 'vitest';
import { DiagramError, layoutProcess } from '@/lib/diagram/layout';
import type { LaneSpec, ProcessSpec, StageSpec } from '@/lib/diagram/types';

/**
 * The layout engine, tested against toy specs rather than against the supply chain.
 *
 * Deliberately: a test that only ever runs the real diagram tells you the real diagram
 * still looks the same, which is what the parity test in home-process-chain.test.ts is
 * for. These say the ENGINE is right -- that a row packs at its gutter, that an anchor
 * points where it says, that the canvas is measured and not guessed -- so that the day
 * somebody writes a second process map they are building on something that has been
 * checked rather than on something that happened to work once.
 */

const lane = (over: Partial<LaneSpec> & Pick<LaneSpec, 'id' | 'layout'>): LaneSpec => ({
  label: over.id,
  colour: '#000',
  tint: '#fff',
  flow: 'forward',
  anchorX: { at: 'canvas-centre' },
  anchorY: { at: 'top', offset: 0 },
  nodeW: 100,
  nodeH: 50,
  gutterX: 10,
  gutterY: 20,
  pad: { x: 5, top: 5, bottom: 5 },
  ...over,
});

const stage = (id: string, laneId: string, w?: number): StageSpec => ({
  id,
  laneId,
  label: id,
  ...(w === undefined ? {} : { w }),
});

const spec = (over: Partial<ProcessSpec>): ProcessSpec => ({
  width: 1000,
  marginBottom: 10,
  channelGap: 8,
  groupBand: { h: 20, gap: 10, inset: 2 },
  laneLabelH: 15,
  lanes: [],
  stages: [],
  edges: [],
  ...over,
});

describe('packing a lane', () => {
  it('lays a row out left to right at its gutter', () => {
    const out = layoutProcess(
      spec({
        lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['a', 'b', 'c'] } })],
        stages: [stage('a', 'r'), stage('b', 'r'), stage('c', 'r')],
      }),
    );
    const xs = ['a', 'b', 'c'].map((id) => out.stageById[id].x);
    expect(xs[1] - xs[0]).toBe(110);
    expect(xs[2] - xs[1]).toBe(110);
    expect(new Set(['a', 'b', 'c'].map((id) => out.stageById[id].y)).size).toBe(1);
  });

  it('lays a column out top to bottom at its gutter', () => {
    const out = layoutProcess(
      spec({
        lanes: [lane({ id: 'c', layout: { kind: 'column', stageIds: ['a', 'b'] } })],
        stages: [stage('a', 'c'), stage('b', 'c')],
      }),
    );
    expect(out.stageById.b.y - out.stageById.a.y).toBe(70);
    expect(out.stageById.a.x).toBe(out.stageById.b.x);
  });

  it('lays a grid out in rows, leaving null cells empty', () => {
    const out = layoutProcess(
      spec({
        lanes: [
          lane({
            id: 'g',
            layout: {
              kind: 'grid',
              rows: [
                ['a', 'b'],
                [null, 'c'],
              ],
            },
          }),
        ],
        stages: [stage('a', 'g'), stage('b', 'g'), stage('c', 'g')],
      }),
    );
    expect(out.stageById.c.x).toBe(out.stageById.b.x);
    expect(out.stageById.c.y - out.stageById.a.y).toBe(70);
  });

  it('widens a column to its widest box', () => {
    /* Inventory's first box is wider than the rest; the row after it must not overlap. */
    const out = layoutProcess(
      spec({
        lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['wide', 'b'] } })],
        stages: [stage('wide', 'r', 180), stage('b', 'r')],
      }),
    );
    expect(out.stageById.b.x - out.stageById.wide.x).toBe(190);
  });
});

describe('anchoring', () => {
  const base = (anchorX: LaneSpec['anchorX']) =>
    spec({
      lanes: [
        lane({ id: 'spine', layout: { kind: 'row', stageIds: ['s0', 's1', 's2'] } }),
        lane({
          id: 'hang',
          layout: { kind: 'row', stageIds: ['h'] },
          anchorX,
          anchorY: { at: 'below', laneId: 'spine', gap: 30 },
        }),
      ],
      stages: [
        stage('s0', 'spine'),
        stage('s1', 'spine'),
        stage('s2', 'spine'),
        stage('h', 'hang'),
      ],
    });

  it('puts a stage-left anchor flush with that stage', () => {
    const out = layoutProcess(base({ at: 'stage-left', stageId: 's1' }));
    expect(out.stageById.h.x).toBe(out.stageById.s1.x);
  });

  it('centres a stage-centre anchor on that stage', () => {
    const out = layoutProcess(base({ at: 'stage-centre', stageId: 's2' }));
    const s2 = out.stageById.s2;
    const h = out.stageById.h;
    expect(h.x + h.w / 2).toBe(s2.x + s2.w / 2);
  });

  it('centres a canvas-centre anchor on the canvas', () => {
    const out = layoutProcess(base({ at: 'canvas-centre' }));
    const h = out.stageById.h;
    expect(h.x + h.w / 2).toBe(500);
  });

  it('stacks a below-anchor under the band it names', () => {
    const out = layoutProcess(base({ at: 'canvas-centre' }));
    const spine = out.laneById.spine.box;
    expect(out.laneById.hang.box.y).toBe(spine.y + spine.h + 30);
  });

  it('resolves X across bands, so a lane may anchor downwards', () => {
    /* Source to Catalog is in the top band and anchors to a stage in the middle one. */
    const out = layoutProcess(
      spec({
        lanes: [
          lane({
            id: 'top',
            layout: { kind: 'row', stageIds: ['t'] },
            anchorX: { at: 'stage-centre', stageId: 's1' },
          }),
          lane({
            id: 'spine',
            layout: { kind: 'row', stageIds: ['s0', 's1'] },
            anchorY: { at: 'below', laneId: 'top', gap: 10 },
          }),
        ],
        stages: [stage('t', 'top'), stage('s0', 'spine'), stage('s1', 'spine')],
      }),
    );
    expect(out.stageById.t.x + 50).toBe(out.stageById.s1.x + 50);
  });

  it('names the lanes when anchors form a cycle, rather than producing NaN', () => {
    expect(() =>
      layoutProcess(
        spec({
          lanes: [
            lane({
              id: 'a',
              layout: { kind: 'row', stageIds: ['sa'] },
              anchorX: { at: 'stage-left', stageId: 'sb' },
            }),
            lane({
              id: 'b',
              layout: { kind: 'row', stageIds: ['sb'] },
              anchorX: { at: 'stage-left', stageId: 'sa' },
            }),
          ],
          stages: [stage('sa', 'a'), stage('sb', 'b')],
        }),
      ),
    ).toThrow(/cycle: a, b/);
  });
});

describe('routing', () => {
  const twoLanes = (route: 'direct' | 'h-then-v' | 'v-then-h' | 'channel-bottom') =>
    layoutProcess(
      spec({
        lanes: [
          lane({ id: 'top', layout: { kind: 'row', stageIds: ['a'] } }),
          lane({
            id: 'bot',
            layout: { kind: 'row', stageIds: ['b'] },
            anchorX: { at: 'stage-left', stageId: 'a' },
            anchorY: { at: 'below', laneId: 'top', gap: 40 },
          }),
        ],
        stages: [stage('a', 'top'), stage('b', 'bot')],
        edges: [{ from: 'a', to: 'b', laneId: 'top', dash: 'solid', route }],
      }),
    );

  it('draws a direct edge centre to centre', () => {
    expect(twoLanes('direct').edges[0].points).toHaveLength(2);
  });

  it('corners an h-then-v edge at the target x and the source y', () => {
    const out = twoLanes('h-then-v');
    const [a, corner, b] = out.edges[0].points;
    expect(corner).toEqual({ x: b.x, y: a.y });
  });

  it('corners a v-then-h edge the other way round', () => {
    const out = twoLanes('v-then-h');
    const [a, corner, b] = out.edges[0].points;
    expect(corner).toEqual({ x: a.x, y: b.y });
  });

  it('runs a channel edge clear of every band', () => {
    const out = twoLanes('channel-bottom');
    const pts = out.edges[0].points;
    expect(pts).toHaveLength(4);
    const y = pts[1].y;
    expect(pts[2].y).toBe(y);
    for (const l of out.lanes) {
      expect(y, `channel crosses lane "${l.id}"`).toBeGreaterThanOrEqual(l.box.y + l.box.h);
    }
  });
});

describe('the canvas is measured, not declared', () => {
  it('ends below the lowest thing drawn, by the stated margin', () => {
    const out = layoutProcess(
      spec({
        marginBottom: 25,
        lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['a'] } })],
        stages: [stage('a', 'r')],
      }),
    );
    expect(out.height).toBe(out.laneById.r.box.y + out.laneById.r.box.h + 25);
  });

  it('reports content as the rect the drawing occupies', () => {
    const out = layoutProcess(
      spec({
        lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['a', 'b'] } })],
        stages: [stage('a', 'r'), stage('b', 'r')],
      }),
    );
    expect(out.content).toEqual(out.laneById.r.box);
  });
});

describe('what the engine refuses', () => {
  it('a stage its lane does not place', () => {
    expect(() =>
      layoutProcess(
        spec({
          lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['a'] } })],
          stages: [stage('a', 'r'), stage('orphan', 'r')],
        }),
      ),
    ).toThrow(DiagramError);
  });

  it('a layout naming a stage that does not exist', () => {
    expect(() =>
      layoutProcess(
        spec({
          lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['ghost'] } })],
          stages: [],
        }),
      ),
    ).toThrow(/ghost/);
  });

  it('an edge to nowhere', () => {
    expect(() =>
      layoutProcess(
        spec({
          lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['a'] } })],
          stages: [stage('a', 'r')],
          edges: [{ from: 'a', to: 'nope', laneId: 'r', dash: 'solid' }],
        }),
      ),
    ).toThrow(/nope/);
  });
});

describe('adding a stage disturbs nothing else', () => {
  /* The promise the whole refactor is for, written as a test rather than a comment. */
  const build = (extra: boolean) =>
    layoutProcess(
      spec({
        lanes: [
          lane({ id: 'spine', layout: { kind: 'row', stageIds: ['s0', 's1'] } }),
          lane({
            id: 'inv',
            layout: { kind: 'row', stageIds: extra ? ['i0', 'i1'] : ['i0'] },
            anchorX: { at: 'stage-left', stageId: 's0' },
            anchorY: { at: 'below', laneId: 'spine', gap: 20 },
          }),
        ],
        stages: [
          stage('s0', 'spine'),
          stage('s1', 'spine'),
          stage('i0', 'inv'),
          ...(extra ? [stage('i1', 'inv')] : []),
        ],
      }),
    );

  it('leaves every other lane exactly where it was', () => {
    const before = build(false);
    const after = build(true);
    expect(after.laneById.spine.box).toEqual(before.laneById.spine.box);
    expect(after.stageById.s0).toEqual(before.stageById.s0);
    expect(after.stageById.s1).toEqual(before.stageById.s1);
    expect(after.stageById.i0.y).toBe(before.stageById.i0.y);
  });
});

describe('determinism', () => {
  it('lays the same spec out the same way twice', () => {
    const s = spec({
      lanes: [lane({ id: 'r', layout: { kind: 'row', stageIds: ['a', 'b'] } })],
      stages: [stage('a', 'r'), stage('b', 'r')],
    });
    expect(layoutProcess(s)).toEqual(layoutProcess(s));
  });
});
