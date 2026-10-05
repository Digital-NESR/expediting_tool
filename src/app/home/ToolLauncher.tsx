'use client';

/* ─── Tool launcher ──────────────────────────────────────────────
   The interactive half of the home page: the greeting, the search box,
   the two card grids and the access-request modals. Everything else on
   the page (background, header chrome, SCAI panel) is server-rendered
   and passed in as `scaiPanel`. */

import { useOptimistic, useState, useTransition, type ReactNode } from 'react';
import dynamic from 'next/dynamic';
import { useSession } from 'next-auth/react';
import { Search, Star } from 'lucide-react';
import { TOOLS, type ModalTool, type ToolDef, type ToolStatus } from './tools';
import { ToolCard, type ProcureGuardAccessType } from './ToolCard';
import { toggleFavourite } from '@/app/actions/home-favourites';

/* The modals are only ever needed after a click, so they are code-split
   out of the initial page bundle. */
const AccessRequestModal = dynamic(
  () => import('./access-modals').then((m) => m.AccessRequestModal),
  { ssr: false },
);
const PendingModal = dynamic(() => import('./access-modals').then((m) => m.PendingModal), {
  ssr: false,
});

/* The pending panel carries no per-tool copy, so only the request modal needs
   to know which tool it is for. */
type ModalState = { kind: 'request'; tool: ModalTool } | { kind: 'pending' } | null;

/* Both grids are captioned "alphabetical", and until this sorted them they were only alphabetical
   for as long as everybody remembered to insert new cards in the right place. Two had already been
   appended to the end of the list instead. Sorting here means the caption stays true on its own. */
function byName(tools: ToolDef[], group: ToolDef['group']): ToolDef[] {
  return tools.filter((t) => t.group === group).sort((a, b) => a.name.localeCompare(b.name));
}

export default function ToolLauncher({
  scaiPanel,
  initialFavourites,
}: {
  scaiPanel: ReactNode;
  /** Pinned tool ids, newest first, read on the server so the section renders filled. */
  initialFavourites: string[];
}) {
  const { data: session, status: sessionStatus, update } = useSession();

  const [modal, setModal] = useState<ModalState>(null);

  /* Pinning is one row in one table, so the star moves immediately and the write catches up.
     `useOptimistic` rather than plain state because the action returns the truth: if the write
     failed, or lost a race with another tab, React drops back to `favourites` and the star
     returns to where it really is rather than lying until the next reload. */
  const [favourites, setFavourites] = useState<string[]>(initialFavourites);
  const [shownFavourites, showFavourite] = useOptimistic(
    favourites,
    (current: string[], toolId: string) =>
      current.includes(toolId) ? current.filter((id) => id !== toolId) : [toolId, ...current],
  );
  const [, startFavouriteTransition] = useTransition();

  function onToggleFavourite(toolId: string) {
    const pinned = !favourites.includes(toolId);
    startFavouriteTransition(async () => {
      showFavourite(toolId);
      const result = await toggleFavourite(toolId, pinned);
      if (!result.success) return;
      setFavourites((current) =>
        result.pinned
          ? current.includes(toolId)
            ? current
            : [toolId, ...current]
          : current.filter((id) => id !== toolId),
      );
    });
  }
  const [appSearch, setAppSearch] = useState('');

  const rawName = session?.user?.name ?? '';
  const firstName = rawName.split(' ')[0] || 'there';
  const userEmail = session?.user?.email ?? '';
  /* Shown in the header and sent with every access request — one value, not two. */
  const displayName = session?.user?.name || userEmail;

  const isAdmin = session?.user?.isAdmin ?? false;
  const procureGuardAccessType: ProcureGuardAccessType =
    session?.user?.toolAccess?.procure_guard?.accessType ?? 'requester';

  function statusOf(tool: ToolDef): ToolStatus {
    if (tool.access.kind !== 'status') return 'new';
    return session?.user?.toolAccess?.[tool.access.tool]?.status ?? 'new';
  }

  function openTool(url: string, newTab: boolean) {
    // Clicking a card opens the tool in a new browser tab; clicking the
    // tool's logo (newTab=false) opens it in the current tab instead.
    if (newTab) window.open(url, '_blank', 'noopener,noreferrer');
    else window.location.href = url;
  }

  function handleOpen(tool: ToolDef, newTab: boolean) {
    switch (tool.access.kind) {
      case 'always':
        openTool(tool.route, newTab);
        return;
      case 'adminPreview':
        // Admin-preview cards are inert for everyone else, so this is the only gate.
        if (isAdmin) openTool(tool.route, newTab);
        return;
      case 'status': {
        const status = statusOf(tool);
        if (isAdmin || status === 'approved') {
          openTool(tool.route, newTab);
          return;
        }
        if (status === 'pending') {
          setModal({ kind: 'pending' });
          return;
        }
        // Nobody with a usable status is left: send them to request access,
        // on the tool's own page where it has one.
        if (tool.access.requestPage !== undefined) {
          openTool(tool.access.requestPage, newTab);
          return;
        }
        setModal({ kind: 'request', tool: tool.access.tool });
      }
    }
  }

  async function handleRefreshStatus() {
    await update();
  }

  async function handleAccessSubmitted() {
    await update();
    setModal(null);
  }

  const q = appSearch.toLowerCase();
  /* A `searchOnly` tool is not in the grid until somebody looks for it: Spend Taxonomy lives in
     the sidebar, and a search for "commodity" that answered "no applications match" would be
     telling them something untrue. */
  const visible = TOOLS.filter((t) => (q ? t.keywords.toLowerCase().includes(q) : !t.searchOnly));

  const renderCard = (tool: ToolDef) => (
    <ToolCard
      key={tool.id}
      tool={tool}
      status={statusOf(tool)}
      isAdmin={isAdmin}
      procureGuardAccessType={procureGuardAccessType}
      onOpen={(newTab) => handleOpen(tool, newTab)}
      isFavourite={shownFavourites.includes(tool.id)}
      onToggleFavourite={() => onToggleFavourite(tool.id)}
    />
  );

  /* In the order they were pinned, not alphabetically: the section is short, and somebody who
     just pinned something should find it where they expect rather than hunt for it. A pin for a
     card the search has filtered out is left out too, so the section tracks the search like the
     grids below it do. */
  const favouriteCards = shownFavourites
    .map((id) => visible.find((t) => t.id === id))
    .filter((t): t is ToolDef => Boolean(t));

  return (
    <>
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Welcome, {firstName}</h1>
        <p className="text-slate-500 mt-1 text-base">Select a tool to get started.</p>
        <p className="text-xs text-slate-400 mt-1.5">
          {new Date().toLocaleDateString('en-GB', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>

        {/* Search bar */}
        <div className="relative mt-5 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search applications..."
            value={appSearch}
            onChange={(e) => setAppSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 text-sm bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20 focus:border-[#307c4c] transition-colors placeholder-slate-400 shadow-sm"
          />
          {appSearch && (
            <button
              onClick={() => setAppSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-300 transition-colors"
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
            </button>
          )}
        </div>
      </div>

      {/* Flex row: tool cards (flex-1, 3-col grid) + SCAI panel (fixed width) */}
      <div className="flex gap-6 items-stretch">
        {/* ── Tool cards ── */}
        <div className="relative flex-1 flex flex-col gap-6">
          {/* While the session (and per-tool access) is still loading, cover the cards so nobody
              mis-clicks "Request Access" before their real access has resolved. */}
          {sessionStatus === 'loading' && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-2xl bg-white/70 backdrop-blur-sm">
              <div className="flex items-center gap-2.5 text-sm font-medium text-slate-500">
                <svg
                  className="h-5 w-5 animate-spin text-[#307c4c]"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Checking your access...
              </div>
            </div>
          )}

          {/* ── Favourites — in the order they were pinned ── */}
          {favouriteCards.length > 0 && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Star className="h-4 w-4 text-amber-500" fill="currentColor" />
                <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500">
                  Favourites
                </h2>
              </div>
              <div className="grid grid-cols-3 gap-6 content-start">
                {favouriteCards.map(renderCard)}
              </div>
              {/* The same cards stay in the lists below, so the grids keep their full set and a
                  reader is never left wondering where a tool went when they pinned it. */}
              <hr className="mt-6 border-slate-200" />
            </div>
          )}

          {/* ── Available (launched) — alphabetical ── */}
          <div className="grid grid-cols-3 gap-6 content-start">
            {byName(visible, 'online').map(renderCard)}
          </div>

          {/* ── Coming Soon / under development — alphabetical ── */}
          <div className="grid grid-cols-3 gap-6 content-start">
            {byName(visible, 'development').map(renderCard)}
          </div>

          {q && visible.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-sm text-slate-400">
                No applications match &ldquo;{appSearch}&rdquo;
              </p>
            </div>
          )}
        </div>

        {/* ── SCAI Panel (server-rendered) ── */}
        {scaiPanel}
      </div>

      {/* ── Modals ── */}
      {modal?.kind === 'request' && (
        <AccessRequestModal
          tool={modal.tool}
          identity={{
            userEmail,
            displayName,
            jobTitle: session?.user?.jobTitle,
            department: session?.user?.department,
          }}
          onClose={() => setModal(null)}
          onSubmitted={handleAccessSubmitted}
        />
      )}
      {modal?.kind === 'pending' && (
        <PendingModal onClose={() => setModal(null)} onRefresh={handleRefreshStatus} />
      )}
    </>
  );
}
