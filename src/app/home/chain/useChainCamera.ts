'use client';

/**
 * The camera over the process chain: a `viewBox` rect, eased between targets.
 *
 * THE VIEWBOX, NOT A CSS TRANSFORM. `transform: scale()` would be one line and would blur
 * every stroke and every label as it magnified them, and would leave the browser hit-testing
 * against pre-transform geometry. Moving the viewBox re-renders the SVG at the new scale, so
 * text stays sharp at 4x and a click still lands where it looks like it landed.
 *
 * Hand-rolled because there is nothing to reach for: the repo has no framer-motion, no
 * d3-zoom and no reactflow, and the `d3-*` packages on disk are recharts' transitive
 * dependencies rather than anything this app declares. A tween over one rectangle is forty
 * lines, so a dependency would cost more than it saved.
 *
 * The easing is `cubic-bezier(0.16, 1, 0.3, 1)` evaluated by hand, which is the curve already
 * used by the `cm-*` entrance animations in globals.css. Motion that matches the rest of the
 * app is worth more here than a curve chosen on its own merits.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHAIN_HEIGHT, CHAIN_WIDTH, type Rect } from '@/lib/home/process-chain';

/** How far in and out the camera may go, as a multiple of the fitted view. */
const MIN_SCALE = 0.95;
export const MAX_SCALE = 6;
const DEFAULT_MS = 620;

/**
 * How long the pursuit takes to cover about two thirds of the distance to its target.
 *
 * A tween cannot do this job: a tween is aimed once at a fixed destination, and the pointer
 * moves the destination every frame, so re-aiming one would either snap or spend its whole
 * duration being restarted. An exponential approach has no duration -- it closes the same
 * FRACTION of whatever gap is left each second -- so it absorbs a target that keeps moving,
 * arrives without overshoot, and decelerates on its own when the pointer stops.
 */
const PURSUE_TAU = 0.17;

const FULL: Rect = { x: 0, y: 0, w: CHAIN_WIDTH, h: CHAIN_HEIGHT };
const ASPECT = CHAIN_HEIGHT / CHAIN_WIDTH;

/** Where the camera is being pulled: a centre in canvas units, and how far in to be. */
export interface Pursuit {
  cx: number;
  cy: number;
  scale: number;
}

/**
 * `cubic-bezier(0.16, 1, 0.3, 1)` solved for y at a given x.
 *
 * Newton's method on the x polynomial, then the y polynomial at that t. Twelve iterations is
 * far more than this needs and still costs nothing once per frame.
 */
function ease(x: number): number {
  const cx = 3 * 0.16;
  const bx = 3 * (0.3 - 0.16) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * 1;
  const by = 3 * (1 - 1) - cy;
  const ay = 1 - cy - by;

  let t = x;
  for (let i = 0; i < 12; i += 1) {
    const fx = ((ax * t + bx) * t + cx) * t - x;
    const dfx = (3 * ax * t + 2 * bx) * t + cx;
    if (Math.abs(fx) < 1e-6 || dfx === 0) break;
    t -= fx / dfx;
  }
  return ((ay * t + by) * t + cy) * t;
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Keep the view inside the canvas, and inside the zoom limits.
 *
 * Applied to every rect the camera is ever given, including the end of a tween, so there is no
 * route to a view of empty space off the side of the diagram.
 */
function constrain(rect: Rect): Rect {
  const minW = CHAIN_WIDTH / MAX_SCALE;
  const maxW = CHAIN_WIDTH / MIN_SCALE;
  const aspect = CHAIN_HEIGHT / CHAIN_WIDTH;

  const w = clamp(rect.w, minW, maxW);
  const h = w * aspect;
  // Half a screen of overscroll either side, so a stage at the edge can still be centred.
  const x = clamp(rect.x, -w / 2, CHAIN_WIDTH - w / 2);
  const y = clamp(rect.y, -h / 2, CHAIN_HEIGHT - h / 2);
  return { x, y, w, h };
}

/**
 * Widen a target rect to the canvas aspect before constraining it.
 *
 * A phase band is wide and short; fitting it literally would squash the diagram. Taking
 * whichever dimension needs more room keeps the drawing's proportions and guarantees the
 * target is fully inside the frame.
 */
export function toViewBox(target: Rect): Rect {
  const aspect = CHAIN_HEIGHT / CHAIN_WIDTH;
  const w = Math.max(target.w, target.h / aspect);
  const h = w * aspect;
  return constrain({
    x: target.x - (w - target.w) / 2,
    y: target.y - (h - target.h) / 2,
    w,
    h,
  });
}

export interface ChainCamera {
  view: Rect;
  /** How far in we are, 1 at the fitted view. Drives which labels are drawn. */
  scale: number;
  isFitted: boolean;
  flyTo: (target: Rect, ms?: number) => void;
  fit: (ms?: number) => void;
  /** Zoom about a point given in CANVAS coordinates, so the point stays put. */
  zoomAt: (point: { x: number; y: number }, factor: number) => void;
  panBy: (dx: number, dy: number) => void;
  /**
   * Chase a target continuously until it is cleared with `null`.
   *
   * Call it as often as the pointer moves; it re-aims rather than restarting. Any fly-to in
   * flight is cancelled, because two things writing the view fight and the newer one is the
   * one the reader is causing.
   */
  pursue: (target: Pursuit | null) => void;
}

export function useChainCamera(): ChainCamera {
  const [view, setView] = useState<Rect>(FULL);
  const frame = useRef<number | null>(null);
  const chase = useRef<Pursuit | null>(null);
  const chaseFrame = useRef<number | null>(null);
  const chaseAt = useRef(0);
  /* Frames in a row the pursuit has not moved the view. The loop retires after enough of
     them, so a pointer resting on the canvas is not re-rendering it sixty times a second. */
  const chaseIdle = useRef(0);
  /* Read once rather than per call: the preference does not change mid-session in practice,
     and `DecisionDialog` reads it the same way. There is no shared hook for this yet. */
  const reduceMotion = useRef(false);

  useEffect(() => {
    reduceMotion.current =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      if (chaseFrame.current !== null) cancelAnimationFrame(chaseFrame.current);
    };
  }, []);

  /** Cancels a fly-to only. The pursuit has its own loop and its own reason to stop. */
  const stopTween = useCallback(() => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
  }, []);

  /* Everything the reader drives directly -- a click, a wheel, a drag -- ends the pursuit as
     well as any tween. Otherwise the pointer drags the camera straight back off the thing
     they just asked to look at. */
  const stop = useCallback(() => {
    stopTween();
    chase.current = null;
  }, [stopTween]);

  const pursue = useCallback(
    (target: Pursuit | null) => {
      chase.current = target;
      if (!target || chaseFrame.current !== null) return;

      stopTween();
      chaseAt.current = performance.now();
      chaseIdle.current = 0;

      const step = (now: number) => {
        const to = chase.current;
        if (!to) {
          chaseFrame.current = null;
          return;
        }
        /* Clamped, so a tab returning to the foreground after a long pause does not apply one
           enormous timestep and teleport the camera. */
        const dt = Math.min(0.064, (now - chaseAt.current) / 1000);
        chaseAt.current = now;
        const k = reduceMotion.current ? 1 : 1 - Math.exp(-dt / PURSUE_TAU);

        setView((current) => {
          const w = lerp(current.w, CHAIN_WIDTH / to.scale, k);
          const next = constrain({
            x: lerp(current.x + current.w / 2, to.cx, k) - w / 2,
            y: lerp(current.y + current.h / 2, to.cy, k) - (w * ASPECT) / 2,
            w,
            h: w * ASPECT,
          });
          /* Returning the same object lets React bail out of the render entirely, which is
             what makes a resting pointer free rather than merely cheap. */
          const settled =
            Math.abs(next.x - current.x) < 0.05 &&
            Math.abs(next.y - current.y) < 0.05 &&
            Math.abs(next.w - current.w) < 0.05;
          chaseIdle.current = settled ? chaseIdle.current + 1 : 0;
          return settled ? current : next;
        });

        if (chaseIdle.current > 20) {
          chaseFrame.current = null;
          return;
        }
        chaseFrame.current = requestAnimationFrame(step);
      };
      chaseFrame.current = requestAnimationFrame(step);
    },
    [stopTween],
  );

  const flyTo = useCallback(
    (target: Rect, ms = DEFAULT_MS) => {
      stop();
      const to = toViewBox(target);
      if (reduceMotion.current || ms <= 0) {
        setView(to);
        return;
      }
      /* The tween reads `from` once and interpolates against it, rather than stepping from
         whatever is on screen each frame. Stepping would make an interrupted fly decelerate
         into the wrong place. */
      let from: Rect | null = null;
      const started = performance.now();

      const step = (now: number) => {
        setView((current) => {
          if (!from) from = current;
          const t = clamp((now - started) / ms, 0, 1);
          const e = ease(t);
          return {
            x: lerp(from.x, to.x, e),
            y: lerp(from.y, to.y, e),
            w: lerp(from.w, to.w, e),
            h: lerp(from.h, to.h, e),
          };
        });
        if (now - started < ms) frame.current = requestAnimationFrame(step);
        else frame.current = null;
      };
      frame.current = requestAnimationFrame(step);
    },
    [stop],
  );

  const fit = useCallback((ms = DEFAULT_MS) => flyTo(FULL, ms), [flyTo]);

  /* Pan and zoom are direct, never tweened. They follow a wheel or a drag, which is already a
     stream of small continuous changes -- easing on top of that is what makes a canvas feel
     like it is swimming away from the pointer. */
  const zoomAt = useCallback(
    (point: { x: number; y: number }, factor: number) => {
      stop();
      setView((current) => {
        const w = current.w / factor;
        const next = constrain({
          // Hold `point` at the same fraction across the frame as it was before.
          x: point.x - ((point.x - current.x) / current.w) * w,
          y: point.y - ((point.y - current.y) / current.h) * (w * (CHAIN_HEIGHT / CHAIN_WIDTH)),
          w,
          h: w * (CHAIN_HEIGHT / CHAIN_WIDTH),
        });
        return next;
      });
    },
    [stop],
  );

  const panBy = useCallback(
    (dx: number, dy: number) => {
      stop();
      setView((current) => constrain({ ...current, x: current.x + dx, y: current.y + dy }));
    },
    [stop],
  );

  const scale = CHAIN_WIDTH / view.w;
  /* A tolerance rather than equality: a tween lands within a fraction of a pixel of FULL and
     the Fit button should not stay lit because of it. */
  const isFitted = Math.abs(view.w - CHAIN_WIDTH) < 2 && Math.abs(view.x) < 2;

  return useMemo(
    () => ({ view, scale, isFitted, flyTo, fit, zoomAt, panBy, pursue }),
    [view, scale, isFitted, flyTo, fit, zoomAt, panBy, pursue],
  );
}
