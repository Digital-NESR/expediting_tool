'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Trophy, Loader2, Medal } from 'lucide-react';
import {
  submitRedBullScore,
  getRedBullLeaderboard,
  type RedBullLeaderboard,
} from '@/app/actions/learning-game';

const GREEN = '#307c4c';

type View = 'game' | 'leaderboard';

type GameMessage =
  | { type: 'rbg-score'; score: number; grade?: string; chainCost?: number; role?: string; pattern?: string; weeks?: number }
  | { type: 'rbg-nav'; to: 'leaderboard' }
  | { type: 'rbg-copied' };

function runLabel(e: { role: string | null; pattern: string | null; weeks: number | null }) {
  const parts = [e.role, e.pattern ? `${e.pattern} demand` : null, e.weeks ? `${e.weeks} wks` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : '—';
}

export default function RedBullGameClient({
  isAdmin,
  initialLeaderboard,
  initialCode,
}: {
  isAdmin: boolean;
  initialLeaderboard: RedBullLeaderboard;
  initialCode?: string;
}) {
  const [board, setBoard] = useState<RedBullLeaderboard>(initialLeaderboard);
  const [view, setView] = useState<View>('game');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ score: number; grade?: string } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const src = (() => {
    const p = new URLSearchParams();
    if (isAdmin) p.set('admin', '1');
    if (initialCode) p.set('code', initialCode);
    const qs = p.toString();
    return `/red-bull-game/index.html${qs ? `?${qs}` : ''}`;
  })();

  const refresh = useCallback(async () => {
    setBoard(await getRedBullLeaderboard());
  }, []);

  useEffect(() => {
    const onMessage = async (e: MessageEvent) => {
      // Only trust the same-origin game frame.
      if (e.origin !== window.location.origin) return;
      const data = e.data as GameMessage | undefined;
      if (!data || typeof data !== 'object') return;

      if (data.type === 'rbg-copied') {
        setLinkCopied(true);
        if (copyTimer.current) clearTimeout(copyTimer.current);
        copyTimer.current = setTimeout(() => setLinkCopied(false), 4000);
        return;
      }

      if (data.type === 'rbg-nav' && data.to === 'leaderboard') {
        await refresh();
        setView('leaderboard');
        return;
      }

      if (data.type === 'rbg-score' && typeof data.score === 'number') {
        setSaving(true);
        try {
          await submitRedBullScore({
            score: data.score,
            grade: data.grade ?? null,
            chainCost: data.chainCost ?? null,
            role: data.role ?? null,
            pattern: data.pattern ?? null,
            weeks: data.weeks ?? null,
          });
          await refresh();
          setView('leaderboard'); // finished a run → land on the board with the new score
          setToast({ score: data.score, grade: data.grade });
          if (toastTimer.current) clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 6000);
        } finally {
          setSaving(false);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, [refresh]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-slate-50 font-sans text-slate-900">
      {/* Top bar */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:px-6">
        <Link
          href="/learning-hub"
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Learning Hub
        </Link>
        <div className="h-5 w-px bg-slate-200" />
        <div className="flex min-w-0 items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/red-bull-can.png"
            alt=""
            className="h-7 w-auto shrink-0 object-contain"
            onError={(ev) => { ev.currentTarget.style.display = 'none'; }}
          />
          <span className="truncate text-sm font-semibold text-slate-900">Red Bull Distribution Game</span>
          <span className="hidden rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:inline">
            Simulator
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {saving && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving score…</span>
          )}
          {view === 'game' && (
            <button
              onClick={async () => { await refresh(); setView('leaderboard'); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Trophy className="h-4 w-4" style={{ color: GREEN }} />
              Leaderboard
            </button>
          )}
          {view === 'leaderboard' && (
            <button
              onClick={() => setView('game')}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white transition-colors"
              style={{ background: GREEN }}
            >
              <ArrowLeft className="h-4 w-4" />
              Back to game
            </button>
          )}
        </div>
      </header>

      {/* Game — always mounted; hidden (not unmounted) on the leaderboard page so play state survives */}
      <div className={view === 'game' ? 'w-full px-3 pt-3 md:px-6 md:pt-4' : 'hidden'}>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <iframe
            src={src}
            title="Red Bull Distribution Game"
            allow="clipboard-write"
            className="block h-[calc(100dvh-84px)] min-h-[620px] w-full border-0"
          />
        </div>
      </div>

      {/* Leaderboard page */}
      {view === 'leaderboard' && (
        <div className="mx-auto w-full max-w-[1100px] px-3 py-6 md:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-900">
              <Trophy className="h-5 w-5" style={{ color: GREEN }} />
              Leaderboard
            </h2>
            <YourBest me={board.me} />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {board.top.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-500">
                No scores yet. Finish a <span className="font-semibold text-slate-700">solo run</span> and your score lands here.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="w-16 px-4 py-2.5 font-semibold">Rank</th>
                      <th className="px-4 py-2.5 font-semibold">Player</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Score</th>
                      <th className="px-4 py-2.5 font-semibold">Grade</th>
                      <th className="px-4 py-2.5 font-semibold">Best run</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {board.top.map((e) => (
                      <tr key={`${e.rank}-${e.player_name}`} className={e.isMe ? 'bg-[#307c4c]/[0.06]' : undefined}>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                            {e.rank <= 3 ? <Medal className="h-4 w-4" style={{ color: ['#C9A227', '#9AA0A6', '#B08D57'][e.rank - 1] }} /> : null}
                            {e.rank}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-slate-900">{e.player_name}</span>
                          {e.isMe && <span className="ml-2 rounded-full bg-[#307c4c]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#307c4c]">You</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-base font-bold" style={{ color: GREEN }}>{e.score}</span>
                          <span className="text-xs text-slate-400"> / 100</span>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{e.grade || '—'}</td>
                        <td className="px-4 py-3 text-xs text-slate-500">{runLabel(e)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs text-slate-400">
            Score is your chain&apos;s cost measured against a perfectly-informed chain on the same demand (0–100, higher is better). One row per player, showing their best solo run.
          </p>

          <button
            onClick={() => setView('game')}
            className="mt-6 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to game
          </button>
        </div>
      )}

      {/* Invite-link copied toast */}
      {linkCopied && (
        <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white shadow-lg">
          Invite link copied — share it so people join this game
        </div>
      )}

      {/* Save toast */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: `${GREEN}15` }}>
            <Trophy className="h-5 w-5" style={{ color: GREEN }} />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Score saved: {toast.score} / 100{toast.grade ? ` · ${toast.grade}` : ''}</p>
            <p className="text-xs text-slate-500">You&apos;re on the leaderboard.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function YourBest({ me }: { me: RedBullLeaderboard['me'] }) {
  if (me.best == null) {
    return <span className="text-xs text-slate-400">You haven&apos;t posted a score yet.</span>;
  }
  return (
    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm">
      <div>
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Your best</span>
        <div className="font-bold" style={{ color: GREEN }}>{me.best} <span className="text-xs font-normal text-slate-400">/ 100</span></div>
      </div>
      {me.rank != null && (
        <div className="border-l border-slate-200 pl-4">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rank</span>
          <div className="font-bold text-slate-700">#{me.rank}</div>
        </div>
      )}
      <div className="border-l border-slate-200 pl-4">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Plays</span>
        <div className="font-bold text-slate-700">{me.plays}</div>
      </div>
    </div>
  );
}
