'use client';

/* ─── The process chain ──────────────────────────────────────────
   The home page's second view: every tool placed on the supply chain it serves, and every
   stage that has no tool at all drawn as a hole.

   One inline <svg> driven by a viewBox camera (see ./useChainCamera). Text is damped against
   the zoom rather than scaled with it or pinned against it (see TYPE), and what changes most
   as you go in is how MUCH is drawn -- tool names, then edge captions. That is what makes it
   read as a map rather than as a picture being magnified.

   It does not know how to open a tool. `onOpenTool` comes from ToolLauncher, which owns the
   access-request modal, the pending modal and the admin-preview gate; duplicating any of that
   here would be a second, quietly different answer to "may this person open this". */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Layers, X } from 'lucide-react';
import {
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  EDGES,
  LANES,
  PHASES,
  STAGES,
  boundsOf,
  coverage,
  edgeMidpoint,
  edgePath,
  fitLabel,
  stagesForTool,
  type LaneId,
  type Stage,
} from '@/lib/home/process-chain';
import { TOOLS, type ToolDef } from '../tools';
import { useChainCamera } from './useChainCamera';

const INK = '#1f2d2a';
const MUTED = '#94a3b8';
const GAP_STROKE = '#cbd5e1';

/** Past these zoom levels, more of the diagram is worth drawing. */
const SHOW_TOOL_NAMES = 1.6;
const SHOW_EDGE_LABELS = 2.2;

/**
 * Base type sizes, in canvas units, damped against the zoom.
 *
 * Two wrong answers either side of this one. Dividing by the zoom held every label at a
 * constant size on screen -- the arithmetic was right and the result unusable, because a
 * canvas unit is about half a screen pixel at the fitted view, so it pinned everything at
 * seven pixels and zooming in moved the diagram without ever making a word of it readable.
 * Not scaling at all put the labels straight back in proportion, which reads well on a stage
 * and turns a phase heading into forty-six pixels of shouting once you are inside it.
 *
 * Dividing by the SQUARE ROOT of the zoom lands between them: rendered size grows as
 * sqrt(zoom), so text is legible at the overview, comfortably bigger at 3x, and never absurd
 * at 6x. Zooming visibly enlarges, which is the thing that was actually broken.
 */
const TYPE = {
  lane: 24,
  phase: 27,
  stage: 16,
  stageLine: 18,
  gapNote: 13,
  chip: 15,
  edge: 15,
} as const;

const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export interface ProcessChainProps {
  /** Opens a tool through the launcher's own access path. */
  onOpenTool: (tool: ToolDef, newTab: boolean) => void;
  /** Rendered inside the detail panel, so the panel shows the real card. */
  renderToolCard: (tool: ToolDef) => React.ReactNode;
  offChainToolIds: string[];
}

export default function ProcessChain({
  onOpenTool,
  renderToolCard,
  offChainToolIds,
}: ProcessChainProps) {
  const camera = useChainCamera();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [focus, setFocus] = useState<{ kind: 'lane' | 'phase'; id: string } | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [hoverTool, setHoverTool] = useState<string | null>(null);

  const { total, covered, gaps } = useMemo(() => coverage(), []);

  /* Damped against the zoom; see TYPE. Everything drawn in canvas units that should read as
     type -- sizes, line spacing, chip heights -- goes through this, so one rule governs all of
     it rather than each call site picking its own. */
  const t = (base: number) => base / Math.sqrt(camera.scale);
  const showToolNames = camera.scale >= SHOW_TOOL_NAMES;
  const showEdgeLabels = camera.scale >= SHOW_EDGE_LABELS;

  /**
   * Clicking a tool opens it, the same as clicking its card in the grid.
   *
   * It stays selected as well, so the panel beside the canvas keeps showing what you just
   * opened and every other stage it sits on -- the chain is a map of the estate, and picking a
   * place on a map should take you there, not merely describe it.
   *
   * `onOpenTool` is the launcher's own handler: it owns the access-request modal, the pending
   * modal and the admin-preview gate, so a tool you may not open still behaves here exactly as
   * it does in the grid.
   */
  const openTool = useCallback(
    (id: string, newTab: boolean) => {
      const tool = TOOL_BY_ID[id];
      if (!tool) return;
      setSelectedTool(id);
      onOpenTool(tool, newTab);
    },
    [onOpenTool],
  );

  /** The stages lit up right now: everything the hovered or selected tool touches. */
  const litStageIds = useMemo(() => {
    const id = hoverTool ?? selectedTool;
    return id ? new Set(stagesForTool(id).map((s) => s.id)) : null;
  }, [hoverTool, selectedTool]);

  /** Canvas coordinates for a pointer event, so zoom can hold a point under the cursor. */
  const toCanvas = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return { x: CHAIN_WIDTH / 2, y: CHAIN_HEIGHT / 2 };
      const r = svg.getBoundingClientRect();
      return {
        x: camera.view.x + ((clientX - r.left) / r.width) * camera.view.w,
        y: camera.view.y + ((clientY - r.top) / r.height) * camera.view.h,
      };
    },
    [camera.view],
  );

  /* Wheel-to-zoom is registered by hand, non-passive, because React's onWheel is passive and
     cannot preventDefault -- without that the page scrolls behind the diagram at the same
     time, which is the single worst thing a zoomable canvas can do on a scrolling page. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.zoomAt(toCanvas(e.clientX, e.clientY), e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [camera, toCanvas]);

  /** Drag to pan. Pointer events so a trackpad, a mouse and a pen all behave the same. */
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag.current) return;
    const svg = svgRef.current;
    if (!svg) return;
    const r = svg.getBoundingClientRect();
    camera.panBy(
      -((e.clientX - drag.current.x) / r.width) * camera.view.w,
      -((e.clientY - drag.current.y) / r.height) * camera.view.h,
    );
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const endDrag = () => {
    drag.current = null;
  };

  const focusPhase = (id: string) => {
    const phase = PHASES.find((p) => p.id === id);
    if (!phase) return;
    setFocus({ kind: 'phase', id });
    camera.flyTo(boundsOf(phase.stageIds));
  };

  const focusLane = (id: LaneId) => {
    const lane = LANES.find((l) => l.id === id);
    if (!lane) return;
    setFocus({ kind: 'lane', id });
    camera.flyTo(lane.box);
  };

  /** Escape backs out one level at a time rather than jumping straight to the top. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedTool) setSelectedTool(null);
      else if (focus) {
        setFocus(null);
        camera.fit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [camera, focus, selectedTool]);

  const selected = selectedTool ? TOOL_BY_ID[selectedTool] : null;
  const focusLabel =
    focus?.kind === 'phase'
      ? PHASES.find((p) => p.id === focus.id)?.label
      : focus?.kind === 'lane'
        ? LANES.find((l) => l.id === focus.id)?.label
        : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Breadcrumb, lane filters and Fit ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setFocus(null);
            setSelectedTool(null);
            camera.fit();
          }}
          className="text-xs font-semibold text-slate-500 transition-colors hover:text-[#307c4c]"
        >
          The whole chain
        </button>
        {focusLabel && (
          <>
            <span className="text-xs text-slate-300">/</span>
            <span className="text-xs font-bold text-[#307c4c]">{focusLabel}</span>
          </>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {LANES.map((lane) => (
            <button
              key={lane.id}
              type="button"
              onClick={() => focusLane(lane.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                focus?.kind === 'lane' && focus.id === lane.id
                  ? 'border-transparent text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
              }`}
              style={
                focus?.kind === 'lane' && focus.id === lane.id
                  ? { background: lane.colour }
                  : undefined
              }
            >
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: lane.colour }}
              />
              {lane.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setFocus(null);
              camera.fit();
            }}
            disabled={camera.isFitted}
            title="Fit the whole chain"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:opacity-40"
          >
            <Maximize2 className="h-3 w-3" />
            Fit
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-4 xl:flex-row">
        {/* ── The canvas ── */}
        <div className="relative flex-1 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <svg
            ref={svgRef}
            viewBox={`${camera.view.x} ${camera.view.y} ${camera.view.w} ${camera.view.h}`}
            className="h-[560px] w-full cursor-grab touch-none select-none active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            /* `group`, not `img`: an image hides its subtree from assistive technology,
               which would make every focusable stage and tool below unreachable. */
            role="group"
            aria-label="The NESR supply chain, with each tool placed on the stage it serves"
          >
            <title>Supply chain process cycles and the systems behind them</title>

            {/* Lane bands, behind everything. */}
            {LANES.map((lane) => (
              <g key={lane.id}>
                <rect
                  x={lane.box.x}
                  y={lane.box.y}
                  width={lane.box.w}
                  height={lane.box.h}
                  rx={18}
                  fill={lane.tint}
                  stroke={lane.colour}
                  strokeOpacity={0.22}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={lane.box.x + 14}
                  /* A fixed baseline inside the lane's header strip. Deriving it from the
                     damped font size moved the label as you zoomed, which is how it ended up
                     on top of the first stage in the lane. */
                  y={lane.box.y + 26}
                  fontSize={t(TYPE.lane)}
                  fontWeight={700}
                  letterSpacing={t(1.6)}
                  fill={lane.colour}
                  style={{ textTransform: 'uppercase' }}
                >
                  {lane.label}
                </text>
              </g>
            ))}

            {/* Edges under the nodes, so a line never crosses a label. */}
            {EDGES.map((edge) => {
              const lane = LANES.find((l) => l.id === edge.laneId)!;
              const dim = litStageIds
                ? !(litStageIds.has(edge.from) && litStageIds.has(edge.to))
                : false;
              /* A dash crawls the backbone at rest, and a focused lane's own connectors take
                 it over. Enough to say which way the work flows and which lane you are in;
                 not so much that a diagram you are reading keeps tugging at the eye. The
                 class is inert under prefers-reduced-motion. */
              const flowing = dim
                ? false
                : focus?.kind === 'lane'
                  ? focus.id === edge.laneId
                  : edge.laneId === 'demand-to-pay';
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
                      className="chain-flow"
                      d={edgePath(edge)}
                      fill="none"
                      stroke={lane.colour}
                      strokeWidth={4}
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      style={{ pointerEvents: 'none' }}
                    />
                  )}
                  {showEdgeLabels && edge.label && <EdgeLabel edge={edge} t={t} />}
                </g>
              );
            })}

            {/* Phase bands above the spine. */}
            {PHASES.map((phase) => {
              const active = focus?.kind === 'phase' && focus.id === phase.id;
              return (
                <g
                  key={phase.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    focusPhase(phase.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ' ') return;
                    e.preventDefault();
                    focusPhase(phase.id);
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`Zoom to the ${phase.label} phase`}
                  className="chain-hit cursor-pointer"
                >
                  <rect
                    x={phase.x}
                    y={396}
                    width={phase.w}
                    height={30}
                    rx={15}
                    fill="#307c4c"
                    fillOpacity={active ? 1 : 0.12}
                    stroke="#307c4c"
                    strokeOpacity={active ? 1 : 0.35}
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={phase.x + phase.w / 2}
                    y={416}
                    fontSize={t(TYPE.phase)}
                    fontWeight={700}
                    textAnchor="middle"
                    fill={active ? '#ffffff' : '#1f5733'}
                    style={{ pointerEvents: 'none' }}
                  >
                    {phase.label}
                  </text>
                </g>
              );
            })}

            {/* Stages. */}
            {STAGES.map((stage) => (
              <StageNode
                key={stage.id}
                stage={stage}
                t={t}
                showToolNames={showToolNames}
                dimmed={litStageIds ? !litStageIds.has(stage.id) : false}
                selectedTool={selectedTool}
                onPickTool={openTool}
                onHoverTool={setHoverTool}
                onPickStage={() => camera.flyTo(boundsOf([stage.id], 140))}
              />
            ))}
          </svg>

          <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">
              {covered} of {total} stages have a system.
            </span>{' '}
            {gaps} do not — drawn hollow. Click a tool to open it, a stage, phase or lane to fly to
            it. Scroll to zoom, drag to pan.
          </p>
        </div>

        {/* ── Detail panel ── */}
        <aside className="w-full shrink-0 xl:w-72">
          {selected ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  On the chain
                </p>
                <button
                  type="button"
                  onClick={() => setSelectedTool(null)}
                  aria-label="Close"
                  className="rounded-md p-0.5 text-slate-400 transition-colors hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              {renderToolCard(selected)}
              <div className="mt-3 border-t border-slate-100 pt-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Stages it serves
                </p>
                <ul className="mt-1.5 space-y-1">
                  {stagesForTool(selected.id).map((stage) => (
                    <li key={stage.id}>
                      <button
                        type="button"
                        onClick={() => camera.flyTo(boundsOf([stage.id], 140))}
                        className="text-left text-xs text-slate-600 transition-colors hover:text-[#307c4c]"
                      >
                        {stage.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
              <Layers className="h-4 w-4 text-slate-300" />
              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                Hover a tool to light it up everywhere it appears on the chain. Click to open it —
                it stays here, with every stage it covers.
              </p>
            </div>
          )}

          {/* ── The off-chain rail ── */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
              Across the chain
            </p>
            <p className="mt-1 text-[11px] leading-snug text-slate-500">
              These serve every stage or none, so they sit beside the chain rather than on it.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {offChainToolIds.map((id) => {
                const tool = TOOL_BY_ID[id];
                if (!tool) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={(e) => onOpenTool(tool, e.metaKey || e.ctrlKey)}
                    className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:border-[#307c4c]/40 hover:text-[#307c4c]"
                  >
                    {tool.name}
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A caption sitting on an edge, at its midpoint. */
function EdgeLabel({ edge, t }: { edge: (typeof EDGES)[number]; t: (b: number) => number }) {
  const mid = edgeMidpoint(edge);
  const width = (edge.label?.length ?? 0) * t(TYPE.edge * 0.56) + t(14);
  return (
    <g style={{ pointerEvents: 'none' }}>
      <rect
        x={mid.x - width / 2}
        y={mid.y - t(TYPE.edge)}
        width={width}
        height={t(TYPE.edge * 2)}
        rx={t(TYPE.edge)}
        fill="#ffffff"
        fillOpacity={0.92}
      />
      <text
        x={mid.x}
        y={mid.y + t(TYPE.edge * 0.36)}
        fontSize={t(TYPE.edge)}
        textAnchor="middle"
        fill={MUTED}
        fontWeight={600}
      >
        {edge.label}
      </text>
    </g>
  );
}

/**
 * One stage: its name, and the tools that serve it.
 *
 * A stage with no tools is drawn hollow and dashed, with the words said out loud. That is the
 * finding this view exists to surface, and a reader should not have to notice an absence.
 */
function StageNode({
  stage,
  t,
  showToolNames,
  dimmed,
  selectedTool,
  onPickTool,
  onHoverTool,
  onPickStage,
}: {
  stage: Stage;
  t: (base: number) => number;
  showToolNames: boolean;
  dimmed: boolean;
  selectedTool: string | null;
  onPickTool: (id: string, newTab: boolean) => void;
  onHoverTool: (id: string | null) => void;
  onPickStage: () => void;
}) {
  const lane = LANES.find((l) => l.id === stage.laneId)!;
  const isGap = stage.toolIds.length === 0;

  const chipH = t(17);
  /* What the bottom of the box has already spoken for: the stacked tool chips, or the
     "no system yet" note where there are none. The label gets what is left. */
  const chipBand = isGap ? t(22) : stage.toolIds.length * (chipH + t(3)) + t(6);
  const maxLines = Math.max(1, Math.floor((stage.h - 10 - chipBand) / (t(TYPE.stage) * 1.12)));
  const { lines, size } = fitLabel(stage.label, stage.w, t(TYPE.stage), maxLines);
  const lineH = size * 1.12;

  return (
    <g
      opacity={dimmed ? 0.25 : 1}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        onPickStage();
      }}
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
          y={stage.y + 8 + size + i * lineH}
          fontSize={size}
          fontWeight={700}
          textAnchor="middle"
          fill={isGap ? MUTED : INK}
          style={{ pointerEvents: 'none' }}
        >
          {line}
        </text>
      ))}

      {isGap ? (
        <text
          x={stage.x + stage.w / 2}
          y={stage.y + stage.h - 12}
          fontSize={t(TYPE.gapNote)}
          textAnchor="middle"
          fill={GAP_STROKE}
          fontWeight={600}
          style={{ pointerEvents: 'none', textTransform: 'uppercase' }}
        >
          No system yet
        </text>
      ) : (
        stage.toolIds.map((id, i) => {
          const tool = TOOL_BY_ID[id];
          if (!tool) return null;
          const y = stage.y + stage.h - 8 - (stage.toolIds.length - i) * (chipH + t(3));
          const label = typeof tool.name === 'string' ? tool.name : id;
          /* A dot until the names are legible, then the name. Drawing both at every zoom means
             either a smear at the overview or a row of anonymous pills close up. */
          const w = showToolNames
            ? Math.min(stage.w - 14, label.length * t(TYPE.chip * 0.58) + t(14))
            : t(34);
          return (
            <g
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                onPickTool(id, e.metaKey || e.ctrlKey);
              }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                /* Without this the stage underneath also takes the key and flies the camera
                   at the same moment the tool opens. */
                e.stopPropagation();
                e.preventDefault();
                onPickTool(id, e.metaKey || e.ctrlKey);
              }}
              onMouseEnter={() => onHoverTool(id)}
              onMouseLeave={() => onHoverTool(null)}
              /* Focus lights the tool up everywhere it appears, exactly as hovering does --
                 the cross-lane highlight is most of the point of the chip, and a keyboard
                 reader should not have to do without it. */
              onFocus={() => onHoverTool(id)}
              onBlur={() => onHoverTool(null)}
              tabIndex={0}
              role="button"
              aria-label={`Open ${label}`}
              className="chain-hit"
            >
              <rect
                x={stage.x + stage.w / 2 - w / 2}
                y={y}
                width={w}
                height={chipH}
                rx={chipH / 2}
                fill={selectedTool === id ? lane.colour : `${lane.colour}22`}
                stroke={lane.colour}
                strokeOpacity={0.5}
                vectorEffect="non-scaling-stroke"
              />
              {showToolNames && (
                <text
                  x={stage.x + stage.w / 2}
                  y={y + chipH - t(5)}
                  fontSize={t(TYPE.chip)}
                  fontWeight={700}
                  textAnchor="middle"
                  fill={selectedTool === id ? '#ffffff' : lane.colour}
                  style={{ pointerEvents: 'none' }}
                >
                  {label}
                </text>
              )}
            </g>
          );
        })
      )}
    </g>
  );
}
