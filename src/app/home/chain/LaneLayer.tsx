'use client';

/**
 * The phase pills over the spine.
 *
 * This file used to draw the lane bands as well: a tinted, rounded rect per lane with a
 * solid colour cap along its top and the lane's name in it. That is the swimlane idiom,
 * and it was doing the opposite of what this view is for. A band says "these things are
 * in the same container"; it draws a boundary and leaves the connections between
 * containers as an afterthought. A route map says "these things are on the same line",
 * which is the same information carried by the thing a reader actually follows -- so the
 * junctions, which are the whole point of drawing a supply chain rather than listing it,
 * stop being incidental and become the structure.
 *
 * So the colour moved from the band to the line. `EdgeLayer` draws the routes, and the
 * lane names live on the filter pills above the canvas and in the key below it, where a
 * metro map puts them too.
 *
 * The pills take their colour from the lane they belong to. They used to be painted
 * `#307c4c` by hand, which happens to be the spine's colour and would be wrong the moment
 * a second grouped lane existed.
 */

import { LANE_BY_ID, PHASES, PHASE_BAND, STAGE_BY_ID } from '@/lib/home/process-chain';
import { BOX } from './chainTheme';

export function PhaseBands({
  focusedPhaseId,
  onPick,
}: {
  focusedPhaseId: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <>
      {PHASES.map((phase) => {
        const active = focusedPhaseId === phase.id;
        /* A phase belongs to whichever lane its stages are on. Reading it rather than
           hardcoding the spine's green is what lets a second grouped lane exist. */
        const lane = LANE_BY_ID[STAGE_BY_ID[phase.stageIds[0]].laneId];

        return (
          <g
            key={phase.id}
            onClick={(e) => {
              e.stopPropagation();
              onPick(phase.id);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              onPick(phase.id);
            }}
            tabIndex={0}
            role="button"
            aria-label={`Zoom to the ${phase.label} phase`}
            className="chain-hit cursor-pointer"
          >
            <rect
              x={phase.x + PHASE_BAND.inset}
              y={PHASE_BAND.y}
              width={phase.w - 2 * PHASE_BAND.inset}
              height={PHASE_BAND.h}
              rx={PHASE_BAND.h / 2}
              fill={lane.colour}
              fillOpacity={active ? 1 : 0.12}
              stroke={lane.colour}
              strokeOpacity={active ? 1 : 0.35}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={phase.x + phase.w / 2}
              y={PHASE_BAND.y + PHASE_BAND.h / 2 + BOX.phase * 0.35}
              fontSize={BOX.phase}
              fontWeight={700}
              textAnchor="middle"
              fill={active ? '#ffffff' : lane.colour}
              style={{ pointerEvents: 'none' }}
            >
              {phase.label}
            </text>
          </g>
        );
      })}
    </>
  );
}
