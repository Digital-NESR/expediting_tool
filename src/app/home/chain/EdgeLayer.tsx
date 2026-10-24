'use client';

/**
 * The routes, and the interchanges where one meets another.
 *
 * These are the lines a reader follows, so they are drawn like lines on a route map and
 * not like arrows between boxes: one weight per kind, lane colour, round joins, and thick
 * enough to be visible in the gap between two stations. That last part is why the gutter
 * between stages is 36 units rather than 12 -- a connector runs centre to centre, so the
 * only piece of it anybody ever sees is the piece crossing the gap, and at the old gutter
 * a route was a series of stubs.
 *
 * Stroke width is in canvas units and deliberately NOT `non-scaling-stroke`. A route is a
 * drawn object and belongs to the drawing: zooming in should enlarge it along with the
 * boxes it connects. A box's one-pixel border is a different thing and still does not
 * scale.
 *
 * Which lane's dash crawls at rest comes off the lane itself. This file used to ask
 * `edge.laneId === 'demand-to-pay'` -- a fact about the supply chain living in a component
 * that has no business knowing what a supply chain is.
 */

import { EDGES, JUNCTIONS, LANE_BY_ID, edgePath } from '@/lib/home/process-chain';
import EdgeLabel from './EdgeLabel';
import type { Sizes } from './chainTheme';

/** Canvas units. A main line, and the lighter weight for the two informational ties. */
const ROUTE_W = { solid: 8, dashed: 5.5, dotted: 5.5 } as const;
const ROUTE_DASH = { solid: undefined, dashed: '18 13', dotted: '0.1 15' } as const;

/**
 * The captions, drawn LAST so that nothing covers them.
 *
 * They used to live inside the edge layer, which is painted under the nodes so a line
 * never crosses a label -- with the result that the labels themselves went under the
 * boxes. "Tracking & update variations" was half-hidden behind Freight Procurement. A
 * caption is text ABOUT the drawing rather than part of it, so it belongs on top of it.
 */
export function EdgeLabels({ u, size }: { u: (cssPx: number) => number; size: Sizes }) {
  return (
    <>
      {EDGES.filter((e) => e.label).map((edge) => (
        <EdgeLabel key={`${edge.from}-${edge.to}`} edge={edge} u={u} size={size} />
      ))}
    </>
  );
}

/**
 * The ring where a route crosses the edge of a station.
 *
 * The one mark this drawing was missing. Every line runs centre to centre, so both of its
 * ends are hidden under a box: you could see that Logistics went somewhere and not that it
 * leaves the chain at Supplier Acknowledgement and rejoins it at Delivery. Those two points
 * are what a reader is looking for, and a map that does not mark them is a map you have to
 * reason about instead of read.
 *
 * Drawn AFTER the stages, on purpose: a ring half-covered by the box it sits on is a ring
 * nobody notices. White fill so it reads as an opening rather than a dot, and the arriving
 * route's own colour so the eye can tell at a glance which line joins here.
 */
export function Junctions({
  litStageIds,
  onPickStage,
}: {
  litStageIds: Set<string> | null;
  onPickStage: (stageId: string) => void;
}) {
  return (
    <>
      {JUNCTIONS.map((j) => {
        const lane = LANE_BY_ID[j.laneId];
        const dim = litStageIds ? !litStageIds.has(j.stageId) : false;
        return (
          <circle
            key={j.id}
            cx={j.x}
            cy={j.y}
            r={9}
            fill="#ffffff"
            stroke={lane.colour}
            strokeWidth={3.5}
            opacity={dim ? 0.18 : 1}
            className="cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              onPickStage(j.stageId);
            }}
          >
            <title>{`${lane.label} joins the chain here`}</title>
          </circle>
        );
      })}
    </>
  );
}

export default function EdgeLayer({
  litStageIds,
  focusedLaneId,
  arriving,
}: {
  /** Stages the hover, selection or search has lit. Null when nothing is lit. */
  litStageIds: Set<string> | null;
  focusedLaneId: string | null;
  /** True for the one-off reveal, when the connectors draw themselves rather than appear. */
  arriving: boolean;
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
        const width = ROUTE_W[edge.dash];
        return (
          <g key={`${edge.from}-${edge.to}`} opacity={dim ? 0.18 : 1}>
            <path
              d={edgePath(edge)}
              fill="none"
              stroke={lane.colour}
              strokeWidth={width}
              className={arriving ? 'chain-arrive-edges' : undefined}
              /* One unit means the whole line, so every connector draws in the same time
                 however long it is. Ignored once the reveal has run. */
              pathLength={arriving ? 1 : undefined}
              strokeDasharray={arriving ? undefined : ROUTE_DASH[edge.dash]}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {flowing && (
              /* White rather than the lane's own colour, now that the line underneath is
                 wide enough to carry it: a pale segment travelling a coloured route reads
                 as something moving ALONG the line. The same dash in the same colour just
                 made the line look thicker in one place. */
              <path
                className={`chain-flow${lane.flow === 'reverse' ? ' chain-flow-reverse' : ''}`}
                d={edgePath(edge)}
                fill="none"
                stroke="#ffffff"
                strokeWidth={Math.max(2, width - 3)}
                strokeLinecap="round"
                style={{ pointerEvents: 'none' }}
              />
            )}
          </g>
        );
      })}
    </>
  );
}
