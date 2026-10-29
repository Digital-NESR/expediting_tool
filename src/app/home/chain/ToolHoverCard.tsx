'use client';

/**
 * What a tool is, raised over the canvas when you point at it.
 *
 * The chain could already tell you where a tool sits and whether you could open it, but not
 * what it was -- for that you had to click, and clicking opens it. So the registry's own
 * `subtitle` and `description` went unread on the one surface whose job is showing people
 * tools they have not met. This is that, plus the thing a diagram should say out loud rather
 * than leave you to trace with a finger: which stages of the process the tool is used in.
 *
 * HTML rather than SVG, deliberately. It wants the house glass treatment, real text wrapping
 * and a badge component the card grid already owns, and all three are free here and painful
 * inside a viewBox. It also means the four `next/image` tool marks work: half the marks in
 * ToolMarks.tsx are raster or fixed-colour artwork that could not be inlined into the canvas.
 */

import { AccessBadge } from '../ToolCard';
import { maturityOf, type ToolDef, type ToolStatus } from '../tools';
import { CHIP_STATE_LABEL, type ChipState } from './chipState';

/** Where the card is anchored, in pixels relative to the canvas container. */
export interface HoverAnchor {
  /** Centre of the chip. */
  x: number;
  /** Top of the chip. */
  top: number;
  /** Bottom of the chip. */
  bottom: number;
}

const CARD_W = 268;
/** Air between the chip and the card. */
const OFFSET = 10;

export default function ToolHoverCard({
  tool,
  state,
  status,
  isAdmin,
  stageLabels,
  anchor,
  bounds,
}: {
  tool: ToolDef;
  state: ChipState;
  status: ToolStatus;
  isAdmin: boolean;
  /** The stages this tool serves, in chain order. */
  stageLabels: string[];
  anchor: HoverAnchor;
  /** The container, so the card can be kept inside it. */
  bounds: { width: number; height: number };
}) {
  /* Above the chip by default, below it when there is no room above. Clamped horizontally
     so a tool at either end of the spine does not push the card off the canvas. */
  const flip = anchor.top < 150;
  const left = Math.min(Math.max(8, anchor.x - CARD_W / 2), Math.max(8, bounds.width - CARD_W - 8));

  const maturity = maturityOf(tool);

  return (
    <div
      role="tooltip"
      style={{
        left,
        width: CARD_W,
        ...(flip
          ? { top: anchor.bottom + OFFSET }
          : { bottom: bounds.height - anchor.top + OFFSET }),
      }}
      className="cm-scale-in pointer-events-none absolute z-20 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_40px_rgb(0,0,0,0.08)] backdrop-blur-md"
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tool.logoClass}`}
          style={tool.logoStyle}
        >
          {tool.icon}
        </span>
        <div className="min-w-0">
          <p className="text-[13px] font-bold leading-tight tracking-tight text-slate-900">
            {tool.name}
          </p>
          {tool.subtitle && (
            <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{tool.subtitle}</p>
          )}
        </div>
      </div>

      <p className="mt-2 text-[11px] leading-relaxed text-slate-600">{tool.description}</p>

      {stageLabels.length > 0 && (
        <div className="mt-2.5 border-t border-slate-100 pt-2">
          <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
            {stageLabels.length === 1 ? 'Used during' : 'Used across'}
          </p>
          <p className="mt-0.5 text-[11px] font-semibold leading-snug text-slate-700">
            {stageLabels.join(' · ')}
          </p>
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
        {/* The grid's own badge, so the two surfaces word this identically -- except where
            it has nothing to say. AccessBadge renders null for a request nobody has made
            yet, which on a card is fine because the action label underneath reads "Request
            Access", and here would leave the footer empty at exactly the moment it most
            needs to tell you the thing is shut. The chip's own state stands in. */}
        {tool.access.kind === 'status' && (isAdmin || status !== 'new') ? (
          <AccessBadge status={status} isAdmin={isAdmin} />
        ) : (
          <span className="text-[11px] font-semibold text-slate-500">
            {CHIP_STATE_LABEL[state]}
          </span>
        )}
        {maturity !== 'live' && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
            {maturity === 'beta' ? 'Beta' : 'Coming soon'}
          </span>
        )}
      </div>
    </div>
  );
}
