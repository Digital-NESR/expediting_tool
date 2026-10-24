/**
 * Turn a process spec into absolute coordinates.
 *
 * Pure, deterministic, and deliberately not a layout algorithm: it does not decide where
 * anything goes, it works out what the spec already said. The slide this reproduces has a
 * geometry somebody chose, and a graph library would spend its time fighting that choice.
 *
 * The order matters and is the whole design. X is resolved independently of Y, which is
 * what lets a lane in the top band anchor itself to a stage in the middle one; bands are
 * then stacked; and only once everything is placed is the canvas measured around it. A
 * canvas you declare is a canvas that is wrong the first time anything moves.
 */

import type {
  EdgeSpec,
  LaidOutEdge,
  LaidOutGroup,
  LaidOutLane,
  LaidOutProcess,
  LaidOutStage,
  LaneSpec,
  Point,
  ProcessSpec,
  Rect,
  StageSpec,
} from './types';

/** Thrown with a message that names the thing at fault, rather than letting NaN spread. */
export class DiagramError extends Error {}

const fail = (message: string): never => {
  throw new DiagramError(message);
};

/** Rows of ids, whatever the lane called its arrangement. */
function rowsOf(lane: LaneSpec): (string | null)[][] {
  switch (lane.layout.kind) {
    case 'row':
      return [lane.layout.stageIds];
    case 'column':
      return lane.layout.stageIds.map((id) => [id]);
    case 'grid':
      return lane.layout.rows;
  }
}

/** Every id a lane places, in order. */
const placedBy = (lane: LaneSpec): string[] =>
  rowsOf(lane)
    .flat()
    .filter((id): id is string => id !== null);

/**
 * Pack one lane's boxes at the origin.
 *
 * Column widths are the widest box in that column and row heights the lane's node height,
 * so a grid stays a grid when one of its boxes is wider than the rest.
 */
function packLane(
  lane: LaneSpec,
  widthOf: (id: string) => number,
): { local: Record<string, Rect>; w: number; h: number } {
  const rows = rowsOf(lane);
  const colW: number[] = [];
  for (const row of rows) {
    row.forEach((id, c) => {
      colW[c] = Math.max(colW[c] ?? 0, id ? widthOf(id) : lane.nodeW);
    });
  }

  const local: Record<string, Rect> = {};
  let h = 0;
  rows.forEach((row, r) => {
    const y = r * (lane.nodeH + lane.gutterY);
    let x = 0;
    row.forEach((id, c) => {
      if (id) local[id] = { x, y, w: widthOf(id), h: lane.nodeH };
      x += colW[c] + lane.gutterX;
    });
    h = y + lane.nodeH;
  });

  const w = colW.reduce((a, b) => a + b, 0) + Math.max(0, colW.length - 1) * lane.gutterX;
  return { local, w, h };
}

export function layoutProcess(spec: ProcessSpec): LaidOutProcess {
  const laneById = new Map(spec.lanes.map((l) => [l.id, l]));
  const stageById = new Map(spec.stages.map((s) => [s.id, s]));
  const widthOf = (id: string) => {
    const stage = stageById.get(id) ?? fail(`lane layout names "${id}", which is not a stage`);
    const lane = laneById.get(stage.laneId) ?? fail(`"${id}" is on unknown lane "${stage.laneId}"`);
    return stage.w ?? lane.nodeW;
  };

  /* Every stage must be placed by its own lane exactly once. Without this a stage added to
     the list but not to a lane's layout simply never appears, silently. */
  for (const lane of spec.lanes) {
    const placed = placedBy(lane);
    if (new Set(placed).size !== placed.length) {
      fail(`lane "${lane.id}" places the same stage twice`);
    }
    for (const id of placed) {
      const stage = stageById.get(id) ?? fail(`lane "${lane.id}" places unknown stage "${id}"`);
      if (stage.laneId !== lane.id) {
        fail(`lane "${lane.id}" places "${id}", which belongs to "${stage.laneId}"`);
      }
    }
  }
  for (const stage of spec.stages) {
    const lane = laneById.get(stage.laneId) ?? fail(`"${stage.id}" is on unknown lane`);
    if (!placedBy(lane).includes(stage.id)) {
      fail(`"${stage.id}" is on lane "${lane.id}" but that lane's layout does not place it`);
    }
  }

  const packed = new Map(spec.lanes.map((l) => [l.id, packLane(l, widthOf)]));

  /* ── X, in dependency order ──
     A lane anchored to a stage needs that stage's lane resolved first. Resolving by
     repeated passes rather than a topological sort: there are a handful of lanes, and a
     pass that changes nothing means the rest are a cycle, which is the error we want. */
  const originX = new Map<string, number>();
  for (let pass = 0; pass <= spec.lanes.length; pass += 1) {
    let moved = false;
    for (const lane of spec.lanes) {
      if (originX.has(lane.id)) continue;
      const pack = packed.get(lane.id)!;
      const a = lane.anchorX;
      if (a.at === 'canvas-centre') {
        originX.set(lane.id, Math.round((spec.width - pack.w) / 2));
        moved = true;
        continue;
      }
      const target = stageById.get(a.stageId) ?? fail(`"${lane.id}" anchors to unknown stage`);
      const targetOrigin = originX.get(target.laneId);
      if (targetOrigin === undefined) continue;
      const targetPack = packed.get(target.laneId)!;
      const local = targetPack.local[target.id];
      const absX = targetOrigin + local.x;
      originX.set(
        lane.id,
        a.at === 'stage-left' ? absX : Math.round(absX + local.w / 2 - pack.w / 2),
      );
      moved = true;
    }
    if (originX.size === spec.lanes.length) break;
    if (!moved) {
      const stuck = spec.lanes.filter((l) => !originX.has(l.id)).map((l) => l.id);
      fail(`these lanes anchor to each other in a cycle: ${stuck.join(', ')}`);
    }
  }

  /* ── Y, band by band ── */
  const boxY = new Map<string, number>();
  const boxH = new Map<string, number>();
  for (let pass = 0; pass <= spec.lanes.length; pass += 1) {
    let moved = false;
    for (const lane of spec.lanes) {
      if (boxY.has(lane.id)) continue;
      const pack = packed.get(lane.id)!;
      const h = lane.pad.top + pack.h + lane.pad.bottom;
      const a = lane.anchorY;
      if (a.at === 'top') {
        boxY.set(lane.id, a.offset);
      } else {
        const aboveY = boxY.get(a.laneId);
        const aboveH = boxH.get(a.laneId);
        if (aboveY === undefined || aboveH === undefined) {
          if (!laneById.has(a.laneId)) fail(`"${lane.id}" sits below unknown lane "${a.laneId}"`);
          continue;
        }
        boxY.set(lane.id, aboveY + aboveH + a.gap);
      }
      boxH.set(lane.id, h);
      moved = true;
    }
    if (boxY.size === spec.lanes.length) break;
    if (!moved) {
      const stuck = spec.lanes.filter((l) => !boxY.has(l.id)).map((l) => l.id);
      fail(`these lanes sit below each other in a cycle: ${stuck.join(', ')}`);
    }
  }

  /* ── Absolute stages ── */
  const stages: LaidOutStage[] = spec.stages.map((s: StageSpec) => {
    const lane = laneById.get(s.laneId)!;
    const local = packed.get(lane.id)!.local[s.id];
    return {
      id: s.id,
      laneId: s.laneId,
      label: s.label,
      toolIds: s.toolIds ?? [],
      systems: s.systems ?? [],
      x: originX.get(lane.id)! + local.x,
      y: boxY.get(lane.id)! + lane.pad.top + local.y,
      w: local.w,
      h: local.h,
    };
  });
  const byId: Record<string, LaidOutStage> = Object.fromEntries(stages.map((s) => [s.id, s]));

  /* ── Bands around their own content ── */
  const lanes: LaidOutLane[] = spec.lanes.map((lane) => {
    const pack = packed.get(lane.id)!;
    const x0 = originX.get(lane.id)!;
    const box: Rect = lane.stretch
      ? { x: 40, y: boxY.get(lane.id)!, w: spec.width - 80, h: boxH.get(lane.id)! }
      : {
          x: x0 - lane.pad.x,
          y: boxY.get(lane.id)!,
          w: pack.w + 2 * lane.pad.x,
          h: boxH.get(lane.id)!,
        };
    return {
      id: lane.id,
      label: lane.label,
      colour: lane.colour,
      tint: lane.tint,
      flow: lane.flow,
      restFlow: lane.restFlow ?? false,
      aside: lane.aside ?? false,
      box,
      stageIds: placedBy(lane),
    };
  });
  const laneOut: Record<string, LaidOutLane> = Object.fromEntries(lanes.map((l) => [l.id, l]));

  /* ── Group pills ── */
  const grouped = spec.lanes.filter((l) => l.groups?.length);
  if (grouped.length > 1) fail('more than one lane carries groups; the band has one row');
  const groups: LaidOutGroup[] = (grouped[0]?.groups ?? []).map((g) => {
    const boxes = g.stageIds.map((id) => byId[id] ?? fail(`group "${g.id}" names unknown "${id}"`));
    const x = Math.min(...boxes.map((b) => b.x));
    return {
      id: g.id,
      label: g.label,
      laneId: grouped[0].id,
      stageIds: [...g.stageIds],
      x,
      w: Math.max(...boxes.map((b) => b.x + b.w)) - x,
    };
  });
  const groupBandY = grouped[0] ? laneOut[grouped[0].id].box.y + spec.laneLabelH : 0;

  /* ── Routing ──
     The channel sits clear of everything the process draws. Aside lanes are excluded
     because they hang below it, which is the only reason they are not in the way. */
  const processBottom = Math.max(...lanes.filter((l) => !l.aside).map((l) => l.box.y + l.box.h));
  const channelY = processBottom + spec.channelGap;
  const centre = (s: LaidOutStage): Point => ({ x: s.x + s.w / 2, y: s.y + s.h / 2 });

  const edges: LaidOutEdge[] = spec.edges.map((e: EdgeSpec) => {
    const from = byId[e.from] ?? fail(`edge from unknown stage "${e.from}"`);
    const to = byId[e.to] ?? fail(`edge to unknown stage "${e.to}"`);
    const a = centre(from);
    const b = centre(to);
    let points: Point[];
    switch (e.route ?? 'direct') {
      case 'direct':
        points = [a, b];
        break;
      case 'h-then-v':
        points = [a, { x: b.x, y: a.y }, b];
        break;
      case 'v-then-h':
        points = [a, { x: a.x, y: b.y }, b];
        break;
      case 'channel-bottom':
        points = [a, { x: a.x, y: channelY }, { x: b.x, y: channelY }, b];
        break;
    }
    return { ...e, points };
  });

  /* ── The canvas, measured around everything ── */
  const bottom = Math.max(
    ...lanes.map((l) => l.box.y + l.box.h),
    ...edges.flatMap((e) => e.points.map((p) => p.y)),
  );
  const height = Math.round(bottom + spec.marginBottom);

  const boxes: Rect[] = [...lanes.map((l) => l.box), ...stages];
  const cx = Math.min(...boxes.map((b) => b.x));
  const cy = Math.min(...boxes.map((b) => b.y));
  const content: Rect = {
    x: cx,
    y: cy,
    w: Math.max(...boxes.map((b) => b.x + b.w)) - cx,
    h: Math.max(...boxes.map((b) => b.y + b.h)) - cy,
  };

  return {
    width: spec.width,
    height,
    groupBandY,
    groupBand: spec.groupBand,
    lanes,
    stages,
    edges,
    groups,
    laneById: laneOut,
    stageById: byId,
    content,
  };
}
