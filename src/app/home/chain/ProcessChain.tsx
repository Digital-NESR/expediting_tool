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
import { TOOLS, type ToolDef, type ToolStatus } from '../tools';
import { CHIP_STATE_LABEL, chipStateOf, type ChipState } from './chipState';
import { MAX_SCALE, useChainCamera } from './useChainCamera';

const INK = '#1f2d2a';
const MUTED = '#94a3b8';
const GAP_STROKE = '#cbd5e1';

/* Edge captions are hidden until there is room for them: they float free of any box and at
   the overview they land on top of each other and on the lines they annotate. Tool names used
   to be gated the same way and are not any more -- now that they scale with their chip they
   are proportionally legible at every zoom, and a row of anonymous pills was its own kind of
   unreadable. */
const SHOW_EDGE_LABELS = 2.1;

/** How far in the pointer pulls the camera, and the range the wheel may set that to. */
const FOLLOW_SCALE = 2.6;
const FOLLOW_MIN = 1.3;

/**
 * Type that labels a REGION of the canvas, in rendered CSS pixels: [at the overview,
 * approached when fully zoomed].
 *
 * A lane name and an edge caption float free -- a lane band spans the whole canvas and a
 * caption sits on open line -- so nothing bounds them but the drawing, and they are sized for
 * the screen. `grow` interpolates on 1 - 1/scale, reaching the upper figure asymptotically,
 * which is what stops a heading becoming forty six pixels of shouting at 6x.
 *
 * The phase heading is NOT here: its band is a fixed 32-unit pill, so it is bounded and
 * belongs with the box type below. It was in this list and came out visibly smaller than the
 * stage names underneath it, which is backwards for a heading.
 */
const SIZES = {
  lane: [12.5, 22],
  edge: [9.5, 15],
} as const;

/**
 * Type INSIDE a stage box, in canvas units, which is to say a fixed fraction of the box.
 *
 * The opposite rule to SIZES above, and the distinction is the whole point. A stage box is
 * 120 canvas units tall whatever the zoom; sizing its contents in screen pixels meant that
 * going in made the box bigger and left the writing exactly where it was, so a stage ended up
 * as a large empty rectangle with a word adrift in the middle of it. Text bounded by a box
 * belongs to that box and should scale with it. Text labelling open canvas should not.
 *
 * The figures are chosen against the 120-unit box: a three-line name, a gap, and a chip come
 * to about 110 of it including padding, so a full stage is comfortably filled and a one-word
 * stage reads as generous padding rather than a hole.
 */
const BOX = {
  label: 18,
  /** Sized against PHASE_BAND.h, the 32-unit pill it sits in. */
  phase: 19,
  /** Line spacing, as a multiple of the label size. */
  leading: 1.12,
  chipH: 22,
  chipText: 13,
  chipGap: 5,
  gapNote: 14,
  /** Between the name and whatever follows it. */
  blockGap: 10,
  pad: 9,
} as const;

type SizeKey = keyof typeof SIZES;
export type Sizes = Record<SizeKey, number>;

const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

export interface ProcessChainProps {
  /** The home page's search box. Empty means no search is running. */
  query?: string;
  /** Opens a tool through the launcher's own access path. */
  onOpenTool: (tool: ToolDef, newTab: boolean) => void;
  /** Rendered inside the detail panel, so the panel shows the real card. */
  renderToolCard: (tool: ToolDef) => React.ReactNode;
  offChainToolIds: string[];
  /**
   * The launcher's own access lookup, so a chip can say what it is before it is clicked.
   * Same function the cards use -- see ./chipState for why it has to be the same one.
   */
  statusOf: (tool: ToolDef) => ToolStatus;
  isAdmin: boolean;
  /**
   * True while the session is still resolving. Until it lands, every per-user access status
   * reads 'new', so the chain would draw tools this person already has as locked. The grid
   * covers its cards for exactly this reason; the chain does the same rather than flashing a
   * wrong answer.
   */
  sessionLoading?: boolean;
}

export default function ProcessChain({
  query = '',
  onOpenTool,
  renderToolCard,
  offChainToolIds,
  statusOf,
  isAdmin,
  sessionLoading = false,
}: ProcessChainProps) {
  const camera = useChainCamera();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pickedFocus, setFocus] = useState<{ kind: 'lane' | 'phase'; id: string } | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  const [hoverTool, setHoverTool] = useState<string | null>(null);

  /* Follow mode: the camera goes where the pointer goes. It is the default because it is the
     fastest way to read a diagram too wide to show at a legible size all at once -- you move
     across it and it comes to you, instead of a scroll-zoom-drag negotiation at every step.
     Anything that asks for a particular place (a stage, a phase, a lane, a drag) switches it
     off, because following would immediately pull the camera back off the chosen thing. */
  const [followPref, setFollow] = useState(true);
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

  /*
   * The search, matched the same way the card grid matches it -- against `keywords`, so a
   * tool answers to the same words in both views and nobody has to learn two vocabularies.
   */
  const q = query.trim().toLowerCase();
  const matchedToolIds = useMemo(
    () =>
      q
        ? new Set(TOOLS.filter((t) => t.keywords.toLowerCase().includes(q)).map((t) => t.id))
        : null,
    [q],
  );

  const matchedStageIds = useMemo(() => {
    if (!matchedToolIds) return null;
    const ids = new Set<string>();
    for (const id of matchedToolIds) for (const stage of stagesForTool(id)) ids.add(stage.id);
    return ids;
  }, [matchedToolIds]);

  /*
   * A search that found something on the chain takes the camera over for as long as it runs.
   * Both of these are DERIVED rather than pushed into state by an effect: following and the
   * breadcrumb are a function of "is a search pinning the view", and computing that beats
   * keeping a second copy of it in sync.
   */
  const searchPinned = !!q && (matchedStageIds?.size ?? 0) > 0;
  const follow = followPref && !searchPinned;
  const focus = searchPinned ? null : pickedFocus;

  /**
   * The stages lit up right now.
   *
   * Pointing at something beats searching for it: a hover is the more recent and more
   * specific statement of what the reader wants to see, so it takes over the highlight while
   * it lasts and the search comes back when the pointer moves off.
   */
  const chipStates = useMemo(() => {
    const out = new Map<string, ChipState>();
    for (const tool of TOOLS) out.set(tool.id, chipStateOf(tool, statusOf(tool), isAdmin));
    return out;
  }, [statusOf, isAdmin]);

  const litStageIds = useMemo(() => {
    const id = hoverTool ?? selectedTool;
    if (id) return new Set(stagesForTool(id).map((s) => s.id));
    return matchedStageIds && matchedStageIds.size ? matchedStageIds : null;
  }, [hoverTool, selectedTool, matchedStageIds]);

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

  /*
   * A search moves the camera to what it found, and clearing it gives the whole chain back.
   *
   * Following is switched off for the duration: the pointer would drag the view straight off
   * the match, and having just been shown where something is, being shown somewhere else is
   * worse than not being shown at all. The ref is so this fires on a CHANGE of query rather
   * than on every render that happens to have one.
   */
  const flownFor = useRef<string>('');
  useEffect(() => {
    if (flownFor.current === q) return;
    flownFor.current = q;
    camera.pursue(null);
    if (!q) {
      camera.fit();
      return;
    }
    const ids = [...(matchedStageIds ?? [])];
    /* A query that only matches an off-chain tool has nowhere to fly to; the rail marks it. */
    if (ids.length) camera.flyTo(boundsOf(ids, 90));
  }, [q, matchedStageIds, camera]);

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
            disabled={searchPinned}
            aria-pressed={follow}
            title={
              searchPinned
                ? 'A search is holding the view. Clear it to let the pointer drive again.'
                : follow
                  ? 'The camera is following your pointer. Scroll to change how close.'
                  : 'Let the camera follow your pointer again'
            }
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
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
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {/* Until the session resolves, every per-user access status reads 'new' and the chain
            would draw tools this person already has as locked, then silently correct itself.
            The card grid covers itself for the same reason. A wrong answer that looks
            confident is worse than a moment of honest waiting. */}
        {sessionLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
            <p className="text-xs font-medium text-slate-500">Checking what you have access to…</p>
          </div>
        )}
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
                  x={phase.x + PHASE_BAND.inset}
                  y={PHASE_BAND.y}
                  width={phase.w - 2 * PHASE_BAND.inset}
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
                  y={PHASE_BAND.y + PHASE_BAND.h / 2 + BOX.phase * 0.35}
                  fontSize={BOX.phase}
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
              dimmed={litStageIds ? !litStageIds.has(stage.id) : false}
              matchedToolIds={matchedToolIds}
              chipStates={chipStates}
              showGapNote={isAdmin}
              selectedTool={selectedTool}
              onPickTool={openTool}
              onHoverTool={setHoverTool}
              onPickStage={() => goTo(boundsOf([stage.id], 150))}
            />
          ))}
        </svg>

        <p className="border-t border-slate-100 px-4 py-2 text-[11px] text-slate-500">
          {matchedToolIds ? (
            matchedToolIds.size === 0 ? (
              <span className="font-semibold text-slate-700">
                Nothing on the chain matches “{query.trim()}”.
              </span>
            ) : (
              <>
                <span className="font-semibold text-[#307c4c]">
                  {matchedToolIds.size === 1
                    ? '1 tool matches'
                    : `${matchedToolIds.size} tools match`}{' '}
                  “{query.trim()}”
                </span>{' '}
                {matchedStageIds?.size
                  ? `— lit across ${matchedStageIds.size} stage${
                      matchedStageIds.size === 1 ? '' : 's'
                    }. Clear the search to get the whole chain back.`
                  : matchedToolIds.size === 1
                    ? '— it serves the whole chain rather than one stage, so it is on the rail below.'
                    : '— they serve the whole chain rather than one stage, so they are on the rail below.'}
              </>
            )
          ) : (
            <>
              {/* The gap count is an administrator's finding. On the page the whole company
                  lands on it reads as a deficiency report, so everyone else gets the same
                  diagram -- every stage drawn, uncovered ones hollow -- without the tally. */}
              <span className="font-semibold text-slate-700">
                {isAdmin
                  ? `${covered} of ${total} stages have a system.`
                  : `${TOOLS.length} systems across ${total} stages of the supply chain.`}
              </span>{' '}
              {isAdmin && <>{gaps} do not — drawn hollow. </>}
              {follow
                ? 'The camera is following your pointer; scroll to change how close. Click a tool to open it, or a stage, phase or lane to pin the view there.'
                : 'Drag to pan, scroll to zoom, click a tool to open it. Turn Follow back on to let the pointer drive.'}
            </>
          )}
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
              const hit = matchedToolIds?.has(id) ?? false;
              const missed = matchedToolIds != null && !hit;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={(e) => onOpenTool(tool, e.metaKey || e.ctrlKey)}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                    hit
                      ? 'border-[#307c4c] bg-[#307c4c]/10 text-[#307c4c]'
                      : missed
                        ? 'border-slate-200 bg-white text-slate-300'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-[#307c4c]/40 hover:text-[#307c4c]'
                  }`}
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
 * The mark on a chip that is not simply open.
 *
 * Drawn by hand rather than taken from lucide, because a lucide icon is a React component
 * rendering its own <svg> with Tailwind sizing, and inside this canvas it would need
 * wrapping and rescaling at every zoom. These are four paths in canvas units, which the
 * surrounding BOX arithmetic already governs.
 */
function ChipGlyph({
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
function StageNode({
  stage,
  dimmed,
  matchedToolIds,
  chipStates,
  showGapNote,
  selectedTool,
  onPickTool,
  onHoverTool,
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
  onPickTool: (id: string, newTab: boolean) => void;
  onHoverTool: (id: string | null) => void;
  onPickStage: () => void;
}) {
  const lane = LANES.find((l) => l.id === stage.laneId)!;
  const isGap = stage.toolIds.length === 0;

  /*
   * The contents are laid out as one centred block, not pinned to the box's two ends. Name at
   * the top and chips at the floor was the obvious arrangement and it left the empty room
   * collecting in the middle, where it reads as a fault rather than as spacing.
   *
   * Everything here is in canvas units -- see BOX -- so it is a constant fraction of the box
   * at every zoom.
   */
  /* What follows the name: the stacked tool chips, or the "no system yet" note. */
  const tailH = isGap
    ? BOX.gapNote * 1.3
    : stage.toolIds.length * BOX.chipH + (stage.toolIds.length - 1) * BOX.chipGap;

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
            const y = tailTop + i * (BOX.chipH + BOX.chipGap);
            const label = typeof tool.name === 'string' ? tool.name : id;
            const state = chipStates.get(id) ?? 'open';
            const glyph = state === 'open' ? null : state;
            /* The glyph eats into the pill, so a chip that carries one is drawn wider rather
             than letting the mark crowd the name. */
            const w = Math.min(
              stage.w - 12,
              label.length * BOX.chipText * 0.58 + 14 + (glyph ? BOX.chipText + 4 : 0),
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
                aria-label={
                  state === 'open' ? `Open ${label}` : `${label}. ${CHIP_STATE_LABEL[state]}.`
                }
                className="chain-hit"
              >
                <rect
                  x={left}
                  y={y}
                  width={w}
                  height={BOX.chipH}
                  rx={BOX.chipH / 2}
                  fill={selectedTool === id ? lane.colour : muted ? '#ffffff' : `${lane.colour}22`}
                  stroke={muted ? GAP_STROKE : lane.colour}
                  strokeOpacity={muted ? 1 : 0.5}
                  strokeDasharray={muted ? '4 3' : undefined}
                  vectorEffect="non-scaling-stroke"
                />
                {glyph && (
                  <ChipGlyph
                    state={glyph}
                    x={left + BOX.chipText * 0.75 + 4}
                    y={y + BOX.chipH / 2}
                    size={BOX.chipText * 0.92}
                    colour={selectedTool === id ? '#ffffff' : muted ? GAP_STROKE : lane.colour}
                  />
                )}
                <text
                  x={stage.x + stage.w / 2 + (glyph ? (BOX.chipText + 4) / 2 : 0)}
                  y={y + BOX.chipH / 2 + BOX.chipText * 0.35}
                  fontSize={BOX.chipText}
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
    </g>
  );
}
