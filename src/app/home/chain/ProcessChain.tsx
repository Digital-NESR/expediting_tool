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
import { Maximize2, Layers, X, MousePointer2, Star } from 'lucide-react';
import {
  CHAIN_HEIGHT,
  CHAIN_WIDTH,
  LANES,
  PHASES,
  STAGES,
  boundsOf,
  coverage,
  stagesForTool,
  type LaneId,
} from '@/lib/home/process-chain';
import { TOOLS, type ToolDef, type ToolStatus } from '../tools';
import { chipStateOf, type ChipState } from './chipState';
import {
  FOLLOW_MIN,
  FOLLOW_SCALE,
  SHOW_EDGE_LABELS,
  SIZES,
  TOOL_BY_ID,
  type SizeKey,
  type Sizes,
} from './chainTheme';
import EdgeLayer from './EdgeLayer';
import { LaneBands, PhaseBands } from './LaneLayer';
import ChainLegend from './ChainLegend';
import StageNode from './StageNode';
import ToolHoverCard, { type HoverAnchor } from './ToolHoverCard';
import { MAX_SCALE, useChainCamera } from './useChainCamera';

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
  /** Tool ids this person has pinned. Starred on the chain and listed above it. */
  favouriteIds?: string[];
  onToggleFavourite?: (toolId: string) => void;
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
  favouriteIds = [],
  onToggleFavourite,
  sessionLoading = false,
}: ProcessChainProps) {
  const camera = useChainCamera();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [pickedFocus, setFocus] = useState<{ kind: 'lane' | 'phase'; id: string } | null>(null);
  const [selectedTool, setSelectedTool] = useState<string | null>(null);
  /** The hovered chip and where it sits on the canvas, so a card can be put beside it. */
  const [hover, setHover] = useState<{
    id: string;
    at: { x: number; top: number; bottom: number };
  } | null>(null);
  /* Pointing at a pin lights the tool on the chain without raising a card over it: the
     pin is outside the canvas, so there is nothing for a card to be anchored to. */
  const [pinHover, setPinHover] = useState<string | null>(null);
  const hoverTool = hover?.id ?? pinHover;
  /** True while the pointer is inside a stage box, which holds the follow camera still. */
  const [overStage, setOverStage] = useState(false);

  /* Follow mode: the camera goes where the pointer goes. It is the default because it is the
     fastest way to read a diagram too wide to show at a legible size all at once -- you move
     across it and it comes to you, instead of a scroll-zoom-drag negotiation at every step.
     Anything that asks for a particular place (a stage, a phase, a lane, a drag) switches it
     off, because following would immediately pull the camera back off the chosen thing. */
  const [followPref, setFollow] = useState(true);
  const [followScale, setFollowScale] = useState(FOLLOW_SCALE);

  /* The element's real width in CSS pixels, so type can be sized in pixels rather than in
     canvas units that mean something different on every screen. */
  /**
   * Where the <svg> sits inside the card, in pixels, and how big the card is.
   *
   * The hover card is positioned against the CARD, and the drawing is not the whole of it:
   * once its height is capped the <svg> is narrower than its container and centred in it.
   * Measured by rect difference rather than `offsetLeft`, which SVG elements do not have.
   */
  const [svgBox, setSvgBox] = useState({
    left: 0,
    top: 0,
    width: 1200,
    height: 620,
    outerW: 1200,
    outerH: 620,
  });
  const svgW = svgBox.width;
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    /* No initial read here: observe() delivers a first callback of its own, so measuring
       synchronously would only set the same value a frame earlier and cascade a render. */
    const ro = new ResizeObserver(() => {
      const parent = el.parentElement;
      if (!parent) return;
      const svg = el.getBoundingClientRect();
      const outer = parent.getBoundingClientRect();
      if (svg.width <= 0) return;
      setSvgBox({
        left: svg.left - outer.left,
        top: svg.top - outer.top,
        width: svg.width,
        height: svg.height,
        outerW: outer.width,
        outerH: outer.height,
      });
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
  /**
   * The hovered chip's anchor, in container pixels.
   *
   * Recomputed each render from the canvas rect and the live camera rather than frozen at
   * hover time, so the card stays on its chip if anything moves the view underneath it.
   */
  const hoverAnchor: HoverAnchor | null = useMemo(() => {
    if (!hover) return null;
    const px = (cx: number, cy: number) => ({
      x: svgBox.left + ((cx - camera.view.x) / camera.view.w) * svgBox.width,
      y: svgBox.top + ((cy - camera.view.y) / camera.view.h) * svgBox.height,
    });
    const top = px(hover.at.x, hover.at.top);
    const bottom = px(hover.at.x, hover.at.bottom);
    return { x: top.x, top: top.y, bottom: bottom.y };
  }, [hover, camera.view, svgBox]);

  const favourites = useMemo(() => new Set(favouriteIds), [favouriteIds]);

  /*
   * The arrival, which runs exactly once.
   *
   * A timer rather than animation classes left on forever: a node that keeps its
   * `animation` would replay it on any re-render that remounts it, and the diagram
   * re-renders constantly as the camera moves. Switched off after the longest delay plus
   * the longest duration, after which no node carries an animation at all.
   */
  const [arriving, setArriving] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setArriving(false), 1400);
    return () => clearTimeout(t);
  }, []);

  /** Left to right along the canvas, so the chain assembles the way the work flows. */
  const arriveDelayOf = useCallback(
    (x: number) => (arriving ? 0.18 + (x / CHAIN_WIDTH) * 0.45 : null),
    [arriving],
  );

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
      /* Not while the pointer is on a stage, and not while a card is up. Following is for
         crossing open canvas; once somebody has arrived somewhere, a camera that keeps
         moving takes the thing they arrived at out from under them -- and it would slide a
         card out from under the eye of whoever is reading it. */
      if (!hover && !overStage) aimAt(e.clientX, e.clientY);
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

  const favouritePins = useMemo(
    () => favouriteIds.map((id) => TOOL_BY_ID[id]).filter(Boolean),
    [favouriteIds],
  );

  const selected = selectedTool ? TOOL_BY_ID[selectedTool] : null;
  const focusLabel =
    focus?.kind === 'phase'
      ? PHASES.find((p) => p.id === focus.id)?.label
      : focus?.kind === 'lane'
        ? LANES.find((l) => l.id === focus.id)?.label
        : null;

  return (
    <div className="flex flex-col gap-4">
      {/*
        The view's opening line, which is a finding rather than a title.
        What this page is for is "here is the estate and where it sits", and saying so in
        one sentence costs a line and saves the reader working it out from the drawing.
        An administrator gets the sharper version; see StageNode's gap note for why the
        shortfall is not everybody's business.
      */}
      <div>
        <h2 className="text-[15px] font-bold tracking-tight text-slate-900">
          {isAdmin
            ? `${covered} of ${total} stages of the supply chain have a system.`
            : `${TOOLS.length} of our tools across ${total} stages of the supply chain.`}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          {isAdmin
            ? `${gaps === 1 ? 'One does' : `${gaps} do`} not — drawn hollow. Point at anything to see what it is and where it is used.`
            : 'SAP and Ariba are marked where the process runs on them. Point at anything to see what it is and where it is used.'}
        </p>
      </div>

      {/*
        Pinned tools, straight across the top.

        Three kinds of visit arrive at a home page: open the thing I use daily, find what I
        use for X, and see what we have. The chain is built for the last two and was the
        worst of the three at the first -- you had to find your tool on a map to click it.
        Anybody who pins anything now has it one click away, above the diagram.
      */}
      {favouritePins.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Pinned
          </span>
          {favouritePins.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => onOpenTool(tool, true)}
              onMouseEnter={() => setPinHover(tool.id)}
              onMouseLeave={() => setPinHover(null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#307c4c]/40 hover:text-[#307c4c]"
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {tool.name}
            </button>
          ))}
        </div>
      )}

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

          {/* Paint shared by every node. A drop shadow in canvas units, so a box lifts off
              its lane by the same proportion at every zoom, and one shallow top-to-bottom
              wash per lane so a band reads as a surface rather than a flat fill. */}
          <defs>
            <filter id="chain-lift" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow
                dx="0"
                dy="2"
                stdDeviation="2.5"
                floodColor="#0f172a"
                floodOpacity="0.10"
              />
            </filter>
            {LANES.map((lane) => (
              <linearGradient key={lane.id} id={`lane-wash-${lane.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={lane.tint} />
                <stop offset="100%" stopColor="#ffffff" stopOpacity={0.6} />
              </linearGradient>
            ))}
          </defs>

          <g className={arriving ? 'chain-arrive-lanes' : undefined}>
            <LaneBands u={u} size={size} />
          </g>

          <EdgeLayer
            litStageIds={litStageIds}
            focusedLaneId={focus?.kind === 'lane' ? focus.id : null}
            showLabels={showEdgeLabels}
            arriving={arriving}
            u={u}
            size={size}
          />

          <PhaseBands
            focusedPhaseId={focus?.kind === 'phase' ? focus.id : null}
            onPick={focusPhase}
            showCounts={isAdmin}
          />

          {/* Stages. */}
          {STAGES.map((stage) => (
            <StageNode
              key={stage.id}
              stage={stage}
              dimmed={litStageIds ? !litStageIds.has(stage.id) : false}
              matchedToolIds={matchedToolIds}
              chipStates={chipStates}
              favourites={favourites}
              arriveDelay={arriveDelayOf(stage.x)}
              showGapNote={isAdmin}
              selectedTool={selectedTool}
              onPickTool={openTool}
              onOverStage={(over) => {
                setOverStage(over);
                if (over) camera.pursue(null);
              }}
              onHoverTool={(id, at) => {
                if (id && at) {
                  camera.pursue(null);
                  setHover({ id, at });
                } else {
                  setHover(null);
                }
              }}
              onPickStage={() => goTo(boundsOf([stage.id], 150))}
            />
          ))}
        </svg>

        {hover && hoverAnchor && TOOL_BY_ID[hover.id] && (
          <ToolHoverCard
            tool={TOOL_BY_ID[hover.id]}
            state={chipStates.get(hover.id) ?? 'open'}
            status={statusOf(TOOL_BY_ID[hover.id])}
            isAdmin={isAdmin}
            stageLabels={stagesForTool(hover.id).map((st) => st.label)}
            anchor={hoverAnchor}
            bounds={{ width: svgBox.outerW, height: svgBox.outerH }}
          />
        )}

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
              {/* What the figures are is said above the canvas now; this line is only ever
                  about how to drive it. */}
              {follow
                ? 'The camera is following your pointer; scroll to change how close. Click a tool to open it, or a stage, phase or lane to pin the view there.'
                : 'Drag to pan, scroll to zoom, click a tool to open it. Turn Follow back on to let the pointer drive.'}
            </>
          )}
        </p>

        <ChainLegend showGaps={isAdmin} />
      </div>

      {/* ── What is selected, and what sits beside the chain rather than on it ── */}
      <div
        className={`grid gap-4 ${
          offChainToolIds.length > 0 ? 'lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]' : ''
        }`}
      >
        {selected ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-start justify-between gap-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                On the chain
              </p>
              <div className="flex items-center gap-1">
                {/* Pinning lives here rather than on the hover card: the card is inert by
                    design, because moving the pointer onto it would mean leaving the chip
                    that raised it. */}
                {onToggleFavourite && (
                  <button
                    type="button"
                    onClick={() => onToggleFavourite(selected.id)}
                    aria-pressed={favourites.has(selected.id)}
                    aria-label={
                      favourites.has(selected.id)
                        ? `Unpin ${selected.name}`
                        : `Pin ${selected.name} to the top`
                    }
                    title={favourites.has(selected.id) ? 'Unpin' : 'Pin to the top'}
                    className="rounded-md p-0.5 transition-colors"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        favourites.has(selected.id)
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-slate-300 hover:text-slate-500'
                      }`}
                    />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTool(null)}
                  aria-label="Close"
                  className="rounded-md p-0.5 text-slate-400 transition-colors hover:text-slate-700"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
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

        {/* ── The off-chain rail ──
            Empty now that the "across the chain" lane exists, so it renders nothing. Kept
            because the next tool that fits nowhere on the drawing needs somewhere to go. */}
        {offChainToolIds.length > 0 && (
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
        )}
      </div>
    </div>
  );
}
