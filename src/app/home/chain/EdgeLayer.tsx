'use client';

/**
 * Every connector on the chain, drawn under the nodes so a line never crosses a label.
 *
 * Which lane's dash crawls at rest comes off the lane itself. This file used to ask
 * `edge.laneId === 'demand-to-pay'` -- a fact about the supply chain living in a component
 * that has no business knowing what a supply chain is.
 */

import { EDGES, LANE_BY_ID, edgePath } from '@/lib/home/process-chain';
import EdgeLabel from './EdgeLabel';
import type { Sizes } from './chainTheme';

export default function EdgeLayer({
  litStageIds,
  focusedLaneId,
  showLabels,
  u,
  size,
}: {
  /** Stages the hover, selection or search has lit. Null when nothing is lit. */
  litStageIds: Set<string> | null;
  focusedLaneId: string | null;
  showLabels: boolean;
  u: (cssPx: number) => number;
  size: Sizes;
}) {
  return (
    <>
      {EDGES.map((edge) => {
        const lane = LANE_BY_ID[edge.laneId];
        const dim = litStageIds ? !(litStageIds.has(edge.from) && litStageIds.has(edge.to)) : false;
        /* A dash crawls the backbone at rest, and a focused lane's own connectors take it
           over. Enough to say which way the work flows and which lane you are in; not so
           much that a diagram you are reading keeps tugging at the eye. The class is inert
           under prefers-reduced-motion. */
        const flowing = dim
          ? false
          : focusedLaneId
            ? focusedLaneId === edge.laneId
            : (lane.restFlow ?? false);
        return (
          <g key={`${edge.from}-${edge.to}`} opacity={dim ? 0.18 : 1}>
            <path
              d={edgePath(edge)}
              fill="none"
              stroke={lane.colour}
              strokeWidth={edge.dash === 'solid' ? 2.5 : 1.75}
              strokeDasharray={
                edge.dash === 'dashed' ? '9 7' : edge.dash === 'dotted' ? '2 7' : undefined
              }
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {flowing && (
              <path
                className={`chain-flow${lane.flow === 'reverse' ? ' chain-flow-reverse' : ''}`}
                d={edgePath(edge)}
                fill="none"
                stroke={lane.colour}
                strokeWidth={4}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                style={{ pointerEvents: 'none' }}
              />
            )}
            {showLabels && edge.label && <EdgeLabel edge={edge} u={u} size={size} />}
          </g>
        );
      })}
    </>
  );
}
