'use client';

/* One box on the chain, and the mark that says whether you can open what is inside it. */

import { LANES, SYSTEM_LABEL, fitLabel, type Stage } from '@/lib/home/process-chain';
import { CHIP_STATE_LABEL, type ChipState } from './chipState';
import { BOX, GAP_STROKE, INK, MUTED, SYSTEM_INK, TOOL_BY_ID, tailMetrics } from './chainTheme';

/**
 * The mark on a chip that is not simply open.
 *
 * Drawn by hand rather than taken from lucide, because a lucide icon is a React component
 * rendering its own <svg> with Tailwind sizing, and inside this canvas it would need
 * wrapping and rescaling at every zoom. These are four paths in canvas units, which the
 * surrounding BOX arithmetic already governs.
 */
export function ChipGlyph({
  state,
  x,
  y,
  size,
  colour,
}: {
  state: Exclude<ChipState, 'open'>;
  x: number;
  y: number;
  size: number;
  colour: string;
}) {
  const r = size / 2;
  const common = {
    stroke: colour,
    strokeWidth: 1.6,
    fill: 'none' as const,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  };
  return (
    <g style={{ pointerEvents: 'none' }} aria-hidden>
      {state === 'pending' ? (
        /* A clock: asked for, not yet answered. */
        <>
          <circle cx={x} cy={y} r={r} {...common} />
          <path d={`M${x} ${y - r * 0.5} L${x} ${y} L${x + r * 0.45} ${y + r * 0.3}`} {...common} />
        </>
      ) : state === 'coming-soon' ? (
        /* A hollow ring: the place is marked out, nothing is in it yet. */
        <circle cx={x} cy={y} r={r * 0.78} {...common} strokeDasharray="2.2 2" />
      ) : state === 'denied' ? (
        /* A struck circle, matching the card grid's red X for a refused request. */
        <>
          <circle cx={x} cy={y} r={r} {...common} />
          <path d={`M${x - r * 0.5} ${y + r * 0.5} L${x + r * 0.5} ${y - r * 0.5}`} {...common} />
        </>
      ) : (
        /* A padlock: a separate portal, or access not yet asked for. */
        <>
          <rect
            x={x - r * 0.8}
            y={y - r * 0.1}
            width={r * 1.6}
            height={r * 1.15}
            rx={r * 0.25}
            {...common}
          />
          <path
            d={`M${x - r * 0.42} ${y - r * 0.1} V${y - r * 0.62} a${r * 0.42} ${r * 0.42} 0 0 1 ${r * 0.84} 0 V${y - r * 0.1}`}
            {...common}
          />
        </>
      )}
    </g>
  );
}

/**
 * One stage: its name, and the tools that serve it.
 *
 * A stage with no tools is drawn hollow and dashed, with the words said out loud. That is the
 * finding this view exists to surface, and a reader should not have to notice an absence.
 */
export default function StageNode({
  stage,
  dimmed,
  matchedToolIds,
  chipStates,
  showGapNote,
  selectedTool,
  onPickTool,
  onHoverTool,
  onOverStage,
  onPickStage,
}: {
  stage: Stage;
  dimmed: boolean;
  /** The search's hits, or null when nothing is being searched for. */
  matchedToolIds: Set<string> | null;
  chipStates: Map<string, ChipState>;
  /**
   * Whether an uncovered stage says so in words.
   *
   * Everyone sees the stage drawn hollow -- hiding it would make the diagram misrepresent
   * the process. Only an administrator gets "NO SYSTEM YET" spelled out, because on the page
   * the whole company lands on that reads as a deficiency report rather than as a fact about
   * where the systems are.
   */
  showGapNote: boolean;
  selectedTool: string | null;
  /**
   * Opens the tool, always in a new tab.
   *
   * The chain is a place people come back to -- it is the whole estate on one screen -- and
   * navigating away from it to open one thing means finding your way back to the diagram
   * every time.
   */
  onPickTool: (id: string, newTab: boolean) => void;
  /**
   * Hovering reports WHERE the chip is as well as which tool it holds, in canvas units, so
   * the shell can put a card beside it. The shell owns the conversion to pixels because it
   * is the one that knows the camera and the element's size.
   */
  onHoverTool: (id: string | null, at?: { x: number; top: number; bottom: number }) => void;
  /**
   * Called as the pointer crosses the box. The shell stops the camera chasing while it is
   * true: following is for crossing open canvas, and once somebody has reached a stage the
   * last thing they want is the thing they are reaching for sliding away from them.
   */
  onOverStage: (over: boolean) => void;
  onPickStage: () => void;
}) {
  const lane = LANES.find((l) => l.id === stage.laneId)!;
  const systems = stage.systems ?? [];
  /*
   * A hole is a stage with nothing at all on it.
   *
   * Before SAP and Ariba were drawn, "no tool of ours" and "nothing happens here" were the
   * same picture, and those are very different claims. A stage running on SAP is a place we
   * have not built anything, which is worth knowing and is not a gap.
   */
  const isGap = stage.toolIds.length === 0 && systems.length === 0;
  const tailCount = stage.toolIds.length + systems.length;

  /*
   * The contents are laid out as one centred block, not pinned to the box's two ends. Name at
   * the top and chips at the floor was the obvious arrangement and it left the empty room
   * collecting in the middle, where it reads as a fault rather than as spacing.
   *
   * Everything here is in canvas units -- see BOX -- so it is a constant fraction of the box
   * at every zoom.
   */
  /* What follows the name: the stacked tool chips, or the "no system yet" note. */
  const { chipH, chipText, chipGap } = tailMetrics(tailCount);
  const tailH = isGap ? BOX.gapNote * 1.3 : tailCount * chipH + (tailCount - 1) * chipGap;

  const room = stage.h - 2 * BOX.pad - BOX.blockGap - tailH;
  const maxLines = Math.max(1, Math.floor(room / (BOX.label * BOX.leading)));
  const { lines, size: fontSize } = fitLabel(stage.label, stage.w, BOX.label, maxLines);
  const lineH = fontSize * BOX.leading;

  const labelH = lines.length * lineH;
  const top = stage.y + (stage.h - (labelH + BOX.blockGap + tailH)) / 2;
  const tailTop = top + labelH + BOX.blockGap;

  return (
    <g
      opacity={dimmed ? 0.25 : 1}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPickStage();
      }}
      onMouseEnter={() => onOverStage(true)}
      onMouseLeave={() => onOverStage(false)}
      tabIndex={0}
      role="button"
      aria-label={
        isGap
          ? `${stage.label}. No system yet.`
          : `${stage.label}. Zoom in. ${stage.toolIds.length} tool${
              stage.toolIds.length === 1 ? '' : 's'
            }.`
      }
      className="chain-hit cursor-pointer"
    >
      <rect
        x={stage.x}
        y={stage.y}
        width={stage.w}
        height={stage.h}
        rx={10}
        fill="#ffffff"
        /* A stage sits ON its lane rather than in it. The shadow is the cheapest thing
           that says so, and an uncovered stage does not get one -- there is nothing there
           to lift. */
        filter={isGap ? undefined : 'url(#chain-lift)'}
        stroke={isGap ? GAP_STROKE : lane.colour}
        strokeWidth={isGap ? 1.5 : 2}
        strokeDasharray={isGap ? '6 5' : undefined}
        vectorEffect="non-scaling-stroke"
        onClick={(e) => {
          e.stopPropagation();
          onPickStage();
        }}
      />
      {!isGap && (
        <rect
          x={stage.x}
          y={stage.y}
          width={4}
          height={stage.h}
          rx={2}
          fill={lane.colour}
          style={{ pointerEvents: 'none' }}
        />
      )}

      {lines.map((line, i) => (
        <text
          key={i}
          x={stage.x + stage.w / 2}
          y={top + fontSize + i * lineH}
          fontSize={fontSize}
          fontWeight={700}
          textAnchor="middle"
          fill={isGap ? MUTED : INK}
          style={{ pointerEvents: 'none' }}
        >
          {line}
        </text>
      ))}

      {isGap
        ? showGapNote && (
            <text
              x={stage.x + stage.w / 2}
              y={tailTop + BOX.gapNote}
              fontSize={BOX.gapNote}
              textAnchor="middle"
              fill={GAP_STROKE}
              fontWeight={600}
              style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
            >
              No system yet
            </text>
          )
        : stage.toolIds.map((id, i) => {
            const tool = TOOL_BY_ID[id];
            if (!tool) return null;
            const y = tailTop + i * (chipH + chipGap);
            const label = typeof tool.name === 'string' ? tool.name : id;
            const state = chipStates.get(id) ?? 'open';
            const glyph = state === 'open' ? null : state;
            /* The glyph eats into the pill, so a chip that carries one is drawn wider rather
             than letting the mark crowd the name. */
            const w = Math.min(
              stage.w - 12,
              label.length * chipText * 0.58 + 14 + (glyph ? chipText + 4 : 0),
            );
            const left = stage.x + stage.w / 2 - w / 2;
            const muted = state === 'coming-soon';
            return (
              <g
                key={id}
                /* A stage can hold a tool the search did not ask for; it stays drawn, because
                 the point of the chain is what sits where, but it steps back. */
                opacity={matchedToolIds && !matchedToolIds.has(id) ? 0.3 : 1}
                onClick={(e) => {
                  e.stopPropagation();
                  onPickTool(id, true);
                }}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  /* Without this the stage underneath also takes the key and flies the camera
                   at the same moment the tool opens. */
                  e.stopPropagation();
                  e.preventDefault();
                  onPickTool(id, true);
                }}
                onMouseEnter={() =>
                  onHoverTool(id, {
                    x: stage.x + stage.w / 2,
                    top: y,
                    bottom: y + BOX.chipH,
                  })
                }
                onMouseLeave={() => onHoverTool(null)}
                /* Focus lights the tool up everywhere it appears, exactly as hovering does --
                 the cross-lane highlight is most of the point of the chip, and a keyboard
                 reader should not have to do without it. */
                onFocus={() =>
                  onHoverTool(id, {
                    x: stage.x + stage.w / 2,
                    top: y,
                    bottom: y + BOX.chipH,
                  })
                }
                onBlur={() => onHoverTool(null)}
                tabIndex={0}
                role="button"
                aria-label={
                  state === 'open' ? `Open ${label}` : `${label}. ${CHIP_STATE_LABEL[state]}.`
                }
                className="chain-hit"
              >
                <rect
                  x={left}
                  y={y}
                  width={w}
                  height={chipH}
                  rx={chipH / 2}
                  fill={selectedTool === id ? lane.colour : muted ? '#ffffff' : `${lane.colour}22`}
                  stroke={muted ? GAP_STROKE : lane.colour}
                  strokeOpacity={muted ? 1 : 0.5}
                  strokeDasharray={muted ? '4 3' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {glyph && (
                  <ChipGlyph
                    state={glyph}
                    x={left + chipText * 0.75 + 4}
                    y={y + chipH / 2}
                    size={chipText * 0.92}
                    colour={selectedTool === id ? '#ffffff' : muted ? GAP_STROKE : lane.colour}
                  />
                )}
                <text
                  x={stage.x + stage.w / 2 + (glyph ? (chipText + 4) / 2 : 0)}
                  y={y + chipH / 2 + chipText * 0.35}
                  fontSize={chipText}
                  fontWeight={700}
                  textAnchor="middle"
                  fill={selectedTool === id ? '#ffffff' : muted ? MUTED : lane.colour}
                  style={{ pointerEvents: 'none' }}
                >
                  {label}
                </text>
              </g>
            );
          })}

      {/* The systems the stage runs on, below our own tools and deliberately quieter: they
          say what this step IS, and are not something this page can open. A square-ish pill
          rather than the chips' fully rounded one, so a system of record reads as a
          different kind of thing and not as another tool in another colour. */}
      {systems.map((sys, i) => {
        const y = tailTop + (stage.toolIds.length + i) * (chipH + chipGap);
        const label = SYSTEM_LABEL[sys];
        const w = label.length * chipText * 0.62 + 18;
        return (
          <g key={sys} style={{ pointerEvents: 'none' }}>
            <rect
              x={stage.x + stage.w / 2 - w / 2}
              y={y}
              width={w}
              height={chipH}
              rx={4}
              fill="#ffffff"
              stroke={SYSTEM_INK}
              strokeOpacity={0.45}
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={stage.x + stage.w / 2}
              y={y + chipH / 2 + chipText * 0.35}
              fontSize={chipText}
              fontWeight={700}
              textAnchor="middle"
              fill={SYSTEM_INK}
              letterSpacing={0.4}
            >
              {label}
            </text>
          </g>
        );
      })}
    </g>
  );
}
