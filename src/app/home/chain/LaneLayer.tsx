'use client';

/**
 * The lane bands behind everything, and the phase pills that sit inside the spine's.
 *
 * Both take their colour from the lane they belong to. The phase pills used to be painted
 * `#307c4c` by hand, which happens to be the spine's colour and would be wrong the moment a
 * second process map, or a second grouped lane, existed.
 *
 * A band is a plain rect with one solid cap along its top edge, the gesture `StatCard` in
 * `catalog-manager` already uses: enough colour to tell four processes apart at a glance,
 * not so much that it competes with the stages sitting on it.
 */

import { LANES, LANE_BY_ID, PHASES, PHASE_BAND, STAGE_BY_ID } from '@/lib/home/process-chain';
import { BOX, type Sizes } from './chainTheme';

/** The cap along a band's top edge, in canvas units. */
const CAP_H = 5;

export function LaneBands({ u, size }: { u: (cssPx: number) => number; size: Sizes }) {
  return (
    <>
      {LANES.map((lane) => (
        <g key={lane.id}>
          <rect
            x={lane.box.x}
            y={lane.box.y}
            width={lane.box.w}
            height={lane.box.h}
            rx={18}
            fill={`url(#lane-wash-${lane.id})`}
            stroke={lane.colour}
            strokeOpacity={0.22}
            vectorEffect="non-scaling-stroke"
          />
          {/* The cap. Clipped to the band so it follows the rounded corners. */}
          <clipPath id={`lane-cap-${lane.id}`}>
            <rect x={lane.box.x} y={lane.box.y} width={lane.box.w} height={lane.box.h} rx={18} />
          </clipPath>
          <rect
            x={lane.box.x}
            y={lane.box.y}
            width={lane.box.w}
            height={CAP_H}
            fill={lane.colour}
            clipPath={`url(#lane-cap-${lane.id})`}
            style={{ pointerEvents: 'none' }}
          />
          <text
            x={lane.box.x + 14}
            /* A fixed baseline inside the lane's header strip. Deriving it from the font
               size moved the label as you zoomed, which is how it ended up on top of the
               first stage in the lane. */
            y={lane.box.y + 28}
            fontSize={u(size.lane)}
            fontWeight={700}
            letterSpacing={u(0.9)}
            fill={lane.colour}
            style={{ textTransform: 'uppercase' }}
          >
            {lane.label}
          </text>
        </g>
      ))}
    </>
  );
}

/*
 * The bands carried a coverage count for a while -- "Procure · 2/3". Two things were wrong
 * with it. The reader has to guess what the fraction counts, which is a sign the label is
 * doing the work the designer should have; and now that every stage has either a tool or a
 * system behind it, every band reads n/n and the figure says nothing at all. The coverage
 * figure lives in the line above the canvas, once, where there is room to say what it means.
 */
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
