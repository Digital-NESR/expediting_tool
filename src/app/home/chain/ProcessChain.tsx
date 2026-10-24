'use client';

/* ─── The process chain ──────────────────────────────────────────
   The home page's second view: every tool placed on the supply chain it serves, and every
   stage that has no tool at all drawn as a hole.

   One inline <svg> driven by a viewBox camera (see ./useChainCamera).

   TYPE IS SIZED IN REAL PIXELS, which took three goes to get right. An SVG font-size is in
   canvas units, and how big a canvas unit lands on screen depends on both the zoom and how
   wide the element happens to be -- so every rule of the form "font-size 16" is really a
   guess about the reader's monitor. Sizing by a fixed number of units made the overview
   nine-pixel type; dividing by the zoom pinned everything at seven pixels forever. So the
   element is measured, and sizes are written as the CSS pixels they should RENDER at, with
   `u()` converting. `grow()` then says what those pixels should be at the overview and what
   they may reach when fully zoomed in, and the curve between is gentle enough that going in
   six-fold does not produce headlines.

   It does not know how to open a tool. `onOpenTool` comes from ToolLauncher, which owns the
   access-request modal, the pending modal and the admin-preview gate; duplicating any of that
   here would be a second, quietly different answer to "may this person open this". */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2, Layers, X, MousePointer2 } from 'lucide-react';
import {
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  EDGES,
  LANES,
  PHASES,
  PHASE_BAND,
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
import { MAX_SCALE, useChainCamera } from './useChainCamera';

const INK = '#1f2d2a';
const MUTED = '#94a3b8';
const GAP_STROKE = '#cbd5e1';

/** Past these zoom levels, more of the diagram is worth drawing. */
const SHOW_TOOL_NAMES = 1.5;
const SHOW_EDGE_LABELS = 2.1;

/** How far in the pointer pulls the camera, and the range the wheel may set that to. */
const FOLLOW_SCALE = 2.6;
const FOLLOW_MIN = 1.3;

/**
 * Rendered type sizes in CSS pixels: [at the fitted overview, approached when fully zoomed].
 *
 * The pair rather than a single number because the two views want different things. The
 * overview is a map and its labels should be small and dense; once you are inside a phase
 * there is room to breathe and the names should be comfortable to read. `grow` interpolates
 * on 1 - 1/scale, which reaches the upper figure asymptotically -- so 6x is only a little
 * larger than 3x, and no amount of zooming produces the forty-six-pixel phase heading that
 * scaling type with the diagram did.
 */
const SIZES = {
  lane: [12.5, 19],
  phase: [14, 21],
  stage: [11.5, 16.5],
  gapNote: [8.5, 11],
  chip: [9.5, 13],
  chipH: [13, 17.5],
  edge: [9.5, 12.5],
} as const;

type SizeKey = keyof typeof SIZES;
export type Sizes = Record<SizeKey, number>;

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

  /* Follow mode: the camera goes where the pointer goes. It is the default because it is the
     fastest way to read a diagram too wide to show at a legible size all at once -- you move
     across it and it comes to you, instead of a scroll-zoom-drag negotiation at every step.
     Anything that asks for a particular place (a stage, a phase, a lane, a drag) switches it
     off, because following would immediately pull the camera back off the chosen thing. */
  const [follow, setFollow] = useState(true);
  const [followScale, setFollowScale] = useState(FOLLOW_SCALE);

  /* The element's real width in CSS pixels, so type can be sized in pixels rather than in
     canvas units that mean something different on every screen. */
  const [svgW, setSvgW] = useState(1200);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    /* No initial read here: observe() delivers a first callback of its own, so measuring
       synchronously would only set the same value a frame earlier and cascade a render. */
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width > 0) setSvgW(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { total, covered, gaps } = useMemo(() => coverage(), []);

  /** CSS pixels to canvas units, at whatever the camera and the element are doing right now. */
  const u = useCallback((cssPx: number) => (cssPx * camera.view.w) / svgW, [camera.view.w, svgW]);

  const size = useMemo(() => {
    const t = 1 - 1 / camera.scale;
    const out = {} as Sizes;
    for (const key of Object.keys(SIZES) as SizeKey[]) {
      const [lo, hi] = SIZES[key];
      out[key] = lo + (hi - lo) * t;
    }
    return out;
  }, [camera.scale]);

  const showToolNames = camera.scale >= SHOW_TOOL_NAMES;
  const showEdgeLabels = camera.scale >= SHOW_EDGE_LABELS;

  /**
   * Clicking a tool opens it, the same as clicking its card in the grid.
   *
   * It stays selected as well, so the panel below the canvas keeps showing what you just
   * opened and every other stage it sits on -- the chain is a map of the estate, and picking a
   * place on a map should take you there, not merely describe it.
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

  /** Stop following and go somewhere specific. Every "take me there" goes through this. */
  const goTo = useCallback(
    (rect: Parameters<typeof camera.flyTo>[0]) => {
      setFollow(false);
      camera.flyTo(rect);
    },
    [camera],
  );

  /**
   * Point the camera at wherever the pointer is.
   *
   * The pointer's position across the element maps proportionally onto the content: hard left
   * shows the left edge, hard right the right edge. Deliberately NOT "centre the canvas point
   * under the cursor", which sounds more direct and is a feedback loop -- moving the view
   * moves what is under the cursor, so the camera creeps while the hand holds still, and the
   * far edges become unreachable because the cursor runs out of screen before the content
   * runs out of diagram.
   */
  const aimAt = useCallback(
    (clientX: number, clientY: number) => {
      const svg = svgRef.current;
      if (!svg) return;
      const r = svg.getBoundingClientRect();
      const w = CHAIN_WIDTH / followScale;
      const h = CHAIN_HEIGHT / followScale;
      const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
      camera.pursue({
        cx: w / 2 + fx * (CHAIN_WIDTH - w),
        cy: h / 2 + fy * (CHAIN_HEIGHT - h),
        scale: followScale,
      });
    },
    [camera, followScale],
  );

  /* Wheel-to-zoom is registered by hand, non-passive, because React's onWheel is passive and
     cannot preventDefault -- without that the page scrolls behind the diagram at the same
     time, which is the single worst thing a zoomable canvas can do on a scrolling page.
     Following turns the wheel into a magnification control instead of a camera move: the
     pointer already says where to look, so all the wheel has left to say is how close. */
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      if (follow) {
        setFollowScale((s) => Math.min(MAX_SCALE, Math.max(FOLLOW_MIN, s * factor)));
        return;
      }
      camera.zoomAt(toCanvas(e.clientX, e.clientY), factor);
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [camera, toCanvas, follow]);

  /** Drag to pan, when not following. Pointer events so trackpad, mouse and pen all agree. */
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || follow) return;
    drag.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (follow) {
      aimAt(e.clientX, e.clientY);
      return;
    }
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

  /* Leaving the canvas while following eases back out to the whole chain, so the view always
     has a resting state to return to rather than being left wherever the hand last was. */
  const onPointerLeave = () => {
    drag.current = null;
    if (!follow) return;
    camera.pursue(null);
    camera.fit();
  };

  const focusPhase = (id: string) => {
    const phase = PHASES.find((p) => p.id === id);
    if (!phase) return;
    setFocus({ kind: 'phase', id });
    goTo(boundsOf(phase.stageIds));
  };

  const focusLane = (id: LaneId) => {
    const lane = LANES.find((l) => l.id === id);
    if (!lane) return;
    setFocus({ kind: 'lane', id });
    goTo(lane.box);
  };

  const resetView = useCallback(() => {
    setFocus(null);
    camera.pursue(null);
    camera.fit();
  }, [camera]);

  /** Escape backs out one level at a time rather than jumping straight to the top. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selectedTool) setSelectedTool(null);
      else if (focus) resetView();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focus, selectedTool, resetView]);

  const selected = selectedTool ? TOOL_BY_ID[selectedTool] : null;
  const focusLabel =
    focus?.kind === 'phase'
      ? PHASES.find((p) => p.id === focus.id)?.label
      : focus?.kind === 'lane'
        ? LANES.find((l) => l.id === focus.id)?.label
        : null;

  return (
    <div className="flex flex-col gap-4">
      {/* ── Breadcrumb, lane filters, follow and Fit ── */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setSelectedTool(null);
            resetView();
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
              setFollow((on) => !on);
              setFocus(null);
              if (follow) camera.pursue(null);
            }}
            aria-pressed={follow}
            title={
              follow
                ? 'The camera is following your pointer. Scroll to change how close.'
                : 'Let the camera follow your pointer again'
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              follow
                ? 'border-transparent bg-[#307c4c] text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`}
          >
            <MousePointer2 className="h-3 w-3" />
            Follow
          </button>

          <button
            type="button"
            onClick={resetView}
            disabled={camera.isFitted}
            title="Fit the whole chain"
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:opacity-40"
          >
            <Maximize2 className="h-3 w-3" />
            Fit
          </button>
        </div>
      </div>

      {/* ── The canvas, full width: every pixel of width is a pixel of legibility ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <svg
          ref={svgRef}
          viewBox={`${camera.view.x} ${camera.view.y} ${camera.view.w} ${camera.view.h}`}
          /* Locked to the canvas aspect rather than given a fixed height, so the drawing
             fills the element instead of being letterboxed inside it. The cap is because the
             canvas is a tall 1.67:1 -- three bands stacked -- and an uncapped full-width
             element pushes its own caption, and the panel under it, off the screen. */
          style={{ aspectRatio: `${CHAIN_WIDTH} / ${CHAIN_HEIGHT}`, maxHeight: '68vh' }}
          className={`mx-auto block w-full touch-none select-none ${
            follow ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing'
          }`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={onPointerLeave}
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
                /* A fixed baseline inside the lane's header strip. Deriving it from the font
                   size moved the label as you zoomed, which is how it ended up on top of the
                   first stage in the lane. */
                y={lane.box.y + 26}
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
                {showEdgeLabels && edge.label && <EdgeLabel edge={edge} u={u} size={size} />}
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
                  y={PHASE_BAND.y}
                  width={phase.w}
                  height={PHASE_BAND.h}
                  rx={PHASE_BAND.h / 2}
                  fill="#307c4c"
                  fillOpacity={active ? 1 : 0.12}
                  stroke="#307c4c"
                  strokeOpacity={active ? 1 : 0.35}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={phase.x + phase.w / 2}
                  y={PHASE_BAND.y + PHASE_BAND.h / 2 + u(size.phase) * 0.35}
                  fontSize={u(size.phase)}
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
              u={u}
              size={size}
              showToolNames={showToolNames}
              dimmed={litStageIds ? !litStageIds.has(stage.id) : false}
              selectedTool={selectedTool}
              onPickTool={openTool}
              onHoverTool={setHoverTool}
              onPickStage={() => goTo(boundsOf([stage.id], 150))}
            />
          ))}
        </svg>

        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          <span className="font-semibold text-slate-700">
            {covered} of {total} stages have a system.
          </span>{' '}
          {gaps} do not — drawn hollow.{' '}
          {follow
            ? 'The camera is following your pointer; scroll to change how close. Click a tool to open it, or a stage, phase or lane to pin the view there.'
            : 'Drag to pan, scroll to zoom, click a tool to open it. Turn Follow back on to let the pointer drive.'}
        </p>
      </div>

      {/* ── What is selected, and what sits beside the chain rather than on it ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
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
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              {renderToolCard(selected)}
              <div className="sm:border-l sm:border-slate-100 sm:pl-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  Stages it serves
                </p>
                <ul className="mt-1.5 space-y-1">
                  {stagesForTool(selected.id).map((stage) => (
                    <li key={stage.id}>
                      <button
                        type="button"
                        onClick={() => goTo(boundsOf([stage.id], 150))}
                        className="text-left text-xs text-slate-600 transition-colors hover:text-[#307c4c]"
                      >
                        {stage.label}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
            <Layers className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
            <p className="text-xs leading-relaxed text-slate-500">
              Move the pointer across the chain and the camera follows it. Hover a tool to light it
              up everywhere it appears; click to open it, and it stays here with every stage it
              covers.
            </p>
          </div>
        )}

        {/* ── The off-chain rail ── */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
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
      </div>
    </div>
  );
}

/** A caption sitting on an edge, at its midpoint. */
function EdgeLabel({
  edge,
  u,
  size,
}: {
  edge: (typeof EDGES)[number];
  u: (cssPx: number) => number;
  size: Sizes;
}) {
  const mid = edgeMidpoint(edge);
  const em = u(size.edge);
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

/**
 * One stage: its name, and the tools that serve it.
 *
 * A stage with no tools is drawn hollow and dashed, with the words said out loud. That is the
 * finding this view exists to surface, and a reader should not have to notice an absence.
 */
function StageNode({
  stage,
  u,
  size,
  showToolNames,
  dimmed,
  selectedTool,
  onPickTool,
  onHoverTool,
  onPickStage,
}: {
  stage: Stage;
  u: (cssPx: number) => number;
  size: Sizes;
  showToolNames: boolean;
  dimmed: boolean;
  selectedTool: string | null;
  onPickTool: (id: string, newTab: boolean) => void;
  onHoverTool: (id: string | null) => void;
  onPickStage: () => void;
}) {
  const lane = LANES.find((l) => l.id === stage.laneId)!;
  const isGap = stage.toolIds.length === 0;

  const chipH = u(size.chipH);
  const gap = u(2.5);
  /* What the bottom of the box has already spoken for: the stacked tool chips, or the
     "no system yet" note where there are none. The label gets what is left. */
  const chipBand = isGap ? u(16) : stage.toolIds.length * (chipH + gap) + u(5);
  const base = u(size.stage);
  const maxLines = Math.max(1, Math.floor((stage.h - 10 - chipBand) / (base * 1.12)));
  const { lines, size: fontSize } = fitLabel(stage.label, stage.w, base, maxLines);
  const lineH = fontSize * 1.12;

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
          y={stage.y + 9 + fontSize + i * lineH}
          fontSize={fontSize}
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
          y={stage.y + stage.h - 11}
          fontSize={u(size.gapNote)}
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
          const y = stage.y + stage.h - 7 - (stage.toolIds.length - i) * (chipH + gap);
          const label = typeof tool.name === 'string' ? tool.name : id;
          /* A dot until the names are legible, then the name. Drawing both at every zoom means
             either a smear at the overview or a row of anonymous pills close up. */
          const w = showToolNames
            ? Math.min(stage.w - 12, label.length * u(size.chip) * 0.58 + u(12))
            : u(26);
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
                  y={y + chipH / 2 + u(size.chip) * 0.35}
                  fontSize={u(size.chip)}
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
