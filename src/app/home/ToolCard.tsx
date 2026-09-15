'use client';

/* ─── Tool card ──────────────────────────────────────────────────
   One component for every card on the launcher; what differs between
   them is data (see `tools.tsx`).

   Markup shape — the card used to be a <button> that CONTAINED an <a>
   (help) and a role="button" <div> (logo). Nesting interactive elements
   is invalid HTML: the inner controls were unreachable by keyboard and
   only "worked" because of stopPropagation on mouse clicks.

   Now the container is a plain <div> and the three controls are siblings
   layered on top of it:

     <div class="group relative …">          ← non-interactive container
       <button|a class="absolute inset-0">   ← card action (opens a new tab)
       <button|a class="relative z-10">      ← logo (opens in the SAME tab)
       …title / description / footer…
       <a class="absolute top-3 right-3 z-20">?</a>   ← help & training
     </div>

   Tab order inside a card is: card action → logo → help link. */

import type { CSSProperties } from 'react';
import { HelpCircle } from 'lucide-react';
import type { ToolDef, ToolStatus } from './tools';

export type ProcureGuardAccessType = 'requester' | 'approver' | 'viewer' | 'admin';

const DENIED_STATUSES: ToolStatus[] = ['denied', 'revoked', 'rejected'];

/* ─── Badges ─────────────────────────────────────────────────── */

function TickBadge({ label }: { label: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ border: '1px solid #bbf7d0' }}
    >
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
      </svg>
      {label}
    </span>
  );
}

/** Access-request status badge (PO Expediting, TI-TE, SourceGuide). */
export function AccessBadge({ status, isAdmin }: { status: ToolStatus; isAdmin: boolean }) {
  if (isAdmin) return <TickBadge label="Full Access" />;
  if (status === 'approved') return <TickBadge label="Access Granted" />;
  if (status === 'pending') {
    return (
      <span
        className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ border: '1px solid #fde68a' }}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Pending Approval
      </span>
    );
  }
  if (DENIED_STATUSES.includes(status)) {
    return (
      <span
        className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 px-2 py-0.5 rounded-full text-[11px] font-semibold"
        style={{ border: '1px solid #fecaca' }}
      >
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        Access Denied
      </span>
    );
  }
  // 'new' → no badge
  return null;
}

function ProcureGuardBadge({ accessType }: { accessType: ProcureGuardAccessType }) {
  const label =
    accessType === 'admin'
      ? 'Admin Access'
      : accessType === 'approver'
        ? 'Approver Access'
        : accessType === 'viewer'
          ? 'Viewer Access'
          : 'Requester Access';
  return <TickBadge label={label} />;
}

function LockBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-gray-50 text-gray-400 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-gray-200">
      <svg
        className="w-3 h-3"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
        />
      </svg>
      {label}
    </span>
  );
}

/* ─── Card ───────────────────────────────────────────────────── */

interface Action {
  label: string;
  className: string;
  style?: CSSProperties;
}

const CARD_BASE =
  'group relative flex w-full flex-col gap-4 rounded-xl border border-gray-200 bg-white p-8 text-left transition-all duration-200';
const LINK_CLASS = 'text-sm font-semibold group-hover:underline';

export function ToolCard({
  tool,
  status,
  isAdmin,
  procureGuardAccessType,
  onOpen,
}: {
  tool: ToolDef;
  /** Access-request status; only meaningful for `access.kind === 'status'` cards. */
  status: ToolStatus;
  isAdmin: boolean;
  procureGuardAccessType: ProcureGuardAccessType;
  /** newTab=true → card body, newTab=false → logo tile. */
  onOpen: (newTab: boolean) => void;
}) {
  const canOpen =
    tool.access.kind === 'status'
      ? isAdmin || status === 'approved'
      : tool.access.kind === 'adminPreview'
        ? isAdmin
        : true;

  // Greyed preview cards go inert when the viewer cannot open them; every
  // other card stays clickable (it opens the access-request modal instead).
  const interactive = tool.access.kind === 'adminPreview' ? isAdmin : true;

  const openLabel = tool.openLabel ?? 'Open →';
  let action: Action | null = null;
  if (canOpen) {
    action = { label: openLabel, className: LINK_CLASS, style: { color: tool.accent } };
  } else if (tool.access.kind === 'status') {
    if (status === 'new') {
      action = { label: 'Request Access →', className: LINK_CLASS, style: { color: tool.accent } };
    } else if (DENIED_STATUSES.includes(status)) {
      action = {
        label: 'Reapply for access →',
        className: 'text-xs font-semibold text-red-600 group-hover:underline',
      };
    }
  }

  const toneClass =
    tool.tone === 'live'
      ? `cursor-pointer ${tool.hoverClass}`
      : interactive
        ? `opacity-75 cursor-pointer ${tool.hoverClass}`
        : 'opacity-50 cursor-default select-none';

  const logoClass = `relative z-10 flex h-12 w-12 cursor-pointer items-center justify-center rounded-xl ${tool.logoClass}`;
  // A pending card shows no action text, so its name alone is the label.
  const cardLabel = action ? `${tool.name} — ${action.label.replace(' →', '')}` : tool.name;

  return (
    <div className={`${CARD_BASE} ${toneClass}`}>
      {/* Card action — a stretched, transparent control covering the whole card.
          It sits behind the logo (z-10) and the help link (z-20). */}
      {interactive &&
        (tool.external ? (
          <a
            href={tool.route}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={cardLabel}
            className="absolute inset-0 z-0 rounded-xl"
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpen(true)}
            aria-label={cardLabel}
            className="absolute inset-0 z-0 cursor-pointer rounded-xl"
          />
        ))}

      {/* Logo tile — opens the tool in the CURRENT tab (the card opens a new one). */}
      {interactive ? (
        tool.external ? (
          <a
            href={tool.route}
            title="Open in this tab"
            className={logoClass}
            style={tool.logoStyle}
          >
            {tool.icon}
          </a>
        ) : (
          <button
            type="button"
            title="Open in this tab"
            aria-label={`Open ${tool.name} in this tab`}
            onClick={() => onOpen(false)}
            className={logoClass}
            style={tool.logoStyle}
          >
            {tool.icon}
          </button>
        )
      ) : (
        <div
          className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-xl ${tool.logoClass}`}
          style={tool.logoStyle}
        >
          {tool.icon}
        </div>
      )}

      <div className="relative z-10 flex-1 pointer-events-none">
        {tool.pill ? (
          <div className="flex flex-wrap items-center gap-2">
            <h3
              className={
                tool.tone === 'live'
                  ? 'text-[18px] font-semibold text-slate-900'
                  : 'text-[18px] font-semibold text-gray-500'
              }
            >
              {tool.name}
            </h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
              {tool.pill}
            </span>
          </div>
        ) : (
          <h3
            className={
              tool.tone === 'live'
                ? 'text-[18px] font-semibold text-slate-900'
                : 'text-[18px] font-semibold text-gray-500'
            }
          >
            {tool.name}
          </h3>
        )}
        {tool.subtitle && (
          <p className="mt-0.5 text-[13px] font-medium text-slate-400">{tool.subtitle}</p>
        )}
        <p className="mt-2 text-sm leading-relaxed text-gray-500">{tool.description}</p>
      </div>

      <div className="relative z-10 mt-auto flex items-center justify-between pointer-events-none">
        {tool.badge.kind === 'status' ? (
          <AccessBadge status={status} isAdmin={isAdmin} />
        ) : tool.badge.kind === 'procureGuard' ? (
          <ProcureGuardBadge accessType={procureGuardAccessType} />
        ) : tool.badge.kind === 'success' ? (
          <TickBadge label={tool.badge.label} />
        ) : tool.badge.kind === 'lock' ? (
          <LockBadge label={tool.badge.label} />
        ) : (
          <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-400">
            {canOpen ? 'Admin Preview' : 'Coming Soon'}
          </span>
        )}
        {action && (
          <span className={action.className} style={action.style}>
            {action.label}
          </span>
        )}
      </div>

      {tool.helpHref && (
        <a
          href={tool.helpHref}
          title="View Help & Training"
          className="absolute top-3 right-3 z-20 rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <HelpCircle className="w-4 h-4" />
        </a>
      )}
    </div>
  );
}
