'use client';

/* The caption the slide puts beside a cross-lane line, drawn on the line itself. */

import { edgeMidpoint, EDGES } from '@/lib/home/process-chain';
import { MUTED, SCREEN_TYPE_CAP, type Sizes } from './chainTheme';

/** A caption sitting on an edge, at its midpoint. */
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
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={mid.x - width / 2}
        y={mid.y - em}
        width={width}
        height={em * 2}
        rx={em}
        fill="#ffffff"
        fillOpacity={0.92}
      />
      <text
        x={mid.x}
        y={mid.y + em * 0.36}
        fontSize={em}
        textAnchor="middle"
        fill={MUTED}
        fontWeight={600}
      >
        {edge.label}
      </text>
    </g>
  );
}
