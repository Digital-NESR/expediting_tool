'use client';

/*
 * The caption the slide puts beside a line -- beside it, not on it, and not on a station.
 *
 * It used to be centred on the line's midpoint with an opaque white plate behind it, which
 * is a real map convention and was fine while the line was two pixels wide. At route weight
 * it went wrong twice over. The plate swallowed the line: between Freight Procurement and
 * Tracking the caption is wider than the whole gap between the two boxes, so the only
 * visible piece of that connection was erased by the words explaining it. And on a hop
 * inside one lane the caption is three or four times the width of the gutter it sits in, so
 * the overspill landed squarely on the names either side -- "Approval Workflow · Contracts
 * Repository" written across the word "Contract".
 *
 * So it steps perpendicular, and how far depends on what is in the way:
 *
 *  - across a clear band between two rows, far enough to clear the line and no further,
 *    because that is where the eye already is;
 *  - on a hop between two neighbouring stations, far enough to clear the STATIONS, into
 *    whichever band has room for it.
 *
 * The plate stays either way: a caption crossing a line it does not belong to is the other
 * way to make this unreadable.
 */

import { edgeMidpoint, EDGES, STAGE_BY_ID } from '@/lib/home/process-chain';
import { MUTED, SCREEN_TYPE_CAP, type Sizes } from './chainTheme';

/** Half the widest route, plus air. */
const CLEAR = 7;

/** A caption sitting beside an edge, at its midpoint. */
export default function EdgeLabel({
  edge,
  u,
  size,
}: {
  edge: (typeof EDGES)[number];
  u: (cssPx: number) => number;
  size: Sizes;
}) {
  const mid = edgeMidpoint(edge);
  const em = Math.min(u(size.edge), SCREEN_TYPE_CAP.edge);
  const width = (edge.label?.length ?? 0) * em * 0.56 + em;
  const height = em * 1.7;

  const from = STAGE_BY_ID[edge.from];
  const to = STAGE_BY_ID[edge.to];
  /* A hop between neighbours on one line: the gutter is 36 units and no caption fits in
     it, so the caption has to leave the row rather than overhang the boxes either side. */
  const inRow = from.laneId === to.laneId && mid.horizontal;
  const step = (inRow ? from.h / 2 : 0) + CLEAR + height / 2;

  let x = mid.x;
  let y = mid.y;
  if (!mid.horizontal) {
    x = mid.x + width / 2 + CLEAR + 4;
  } else if (inRow && from.y - step - height / 2 < 0) {
    /* Source to Catalog is the top row: there is no canvas above it, so its captions go
       into the band below, between it and the spine. */
    y = mid.y + step;
  } else {
    y = mid.y - step;
  }

  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={height / 2}
        fill="#ffffff"
        fillOpacity={0.92}
      />
      <text x={x} y={y + em * 0.36} fontSize={em} textAnchor="middle" fill={MUTED} fontWeight={600}>
        {edge.label}
      </text>
    </g>
  );
}
