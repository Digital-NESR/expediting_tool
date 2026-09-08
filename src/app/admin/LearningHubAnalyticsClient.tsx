'use client';

import { useState, type ReactNode } from 'react';
import { GraduationCap, Users, CheckCircle2, BookOpen, PlayCircle, Trophy, Medal, User, UsersRound } from 'lucide-react';
import type { LearningHubAnalytics, LhTrackAnalytics } from '@/app/actions/learning-hub';

const GREEN = '#307c4c';

type Tab = { id: string; label: string };

export default function LearningHubAnalyticsClient({ data }: { data: LearningHubAnalytics }) {
  const tabs: Tab[] = [
    { id: 'overview', label: 'Overview' },
    ...data.tracks.map((t) => ({ id: `track:${t.key}`, label: t.name })),
    { id: 'redbull', label: 'Red Bull Game' },
  ];
  const [tab, setTab] = useState<string>('overview');

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <GraduationCap className="h-5 w-5" style={{ color: GREEN }} />
        <h2 className="text-lg font-bold text-slate-900">Learning Hub Analytics</h2>
      </div>

      {/* Tab bar */}
      <div className="mb-6 flex flex-wrap gap-1 border-b border-slate-200">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#307c4c] text-[#307c4c]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <Overview data={data} onOpenTrack={(k) => setTab(`track:${k}`)} />}
      {data.tracks.map((t) => (tab === `track:${t.key}` ? <TrackPanel key={t.key} track={t} /> : null))}
      {tab === 'redbull' && <RedBullPanel stats={data.redBull} />}
    </div>
  );
}

/* ─── shared bits ─────────────────────────────────────────────── */

function StatTile({ icon, label, value, sub }: { icon: ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold text-slate-900">
        {value}
        {sub && <span className="ml-1 text-xs font-normal text-slate-400">{sub}</span>}
      </div>
    </div>
  );
}

function Bar({ pct, color = GREEN }: { pct: number; color?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }} />
    </div>
  );
}

/* ─── Overview ────────────────────────────────────────────────── */

function Overview({ data, onOpenTrack }: { data: LearningHubAnalytics; onOpenTrack: (key: string) => void }) {
  const o = data.overview;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={<Users className="h-3.5 w-3.5" />} label="Learners" value={o.learners} />
        <StatTile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Lessons done" value={o.lessonCompletions} />
        <StatTile icon={<Trophy className="h-3.5 w-3.5" />} label="Courses completed" value={o.courseCompletions} />
        <StatTile icon={<GraduationCap className="h-3.5 w-3.5" />} label="Modules" value={o.trackCount} />
        <StatTile icon={<BookOpen className="h-3.5 w-3.5" />} label="Courses" value={o.courseCount} />
        <StatTile icon={<PlayCircle className="h-3.5 w-3.5" />} label="Lessons" value={o.lessonCount} />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">By module</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Module</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Learners</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Courses</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Lessons</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Lessons done</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Courses completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tracks.map((t) => (
                  <tr key={t.key} className="cursor-pointer hover:bg-slate-50" onClick={() => onOpenTrack(t.key)}>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: t.color || GREEN }} />
                        {t.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.learners}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.courses.length}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.lessonCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.lessonCompletions}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: GREEN }}>{t.completedLearners}</td>
                  </tr>
                ))}
                {data.tracks.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No modules yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">Click a module to see its courses. &ldquo;Learners&rdquo; = people with at least one lesson completed.</p>
      </section>
    </div>
  );
}

/* ─── Per-module (track) ──────────────────────────────────────── */

function TrackPanel({ track }: { track: LhTrackAnalytics }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon={<Users className="h-3.5 w-3.5" />} label="Learners" value={track.learners} />
        <StatTile icon={<BookOpen className="h-3.5 w-3.5" />} label="Courses" value={track.courses.length} />
        <StatTile icon={<PlayCircle className="h-3.5 w-3.5" />} label="Lessons" value={track.lessonCount} />
        <StatTile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Lessons done" value={track.lessonCompletions} />
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Course</th>
                <th className="px-4 py-2.5 text-right font-semibold">Lessons</th>
                <th className="px-4 py-2.5 text-right font-semibold">Learners</th>
                <th className="px-4 py-2.5 text-right font-semibold">Completed</th>
                <th className="px-4 py-2.5 font-semibold">Completion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {track.courses.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-slate-900">{c.title}</span>
                    {c.status !== 'published' && (
                      <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">{c.status}</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.lessonCount}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.learners}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{c.completedLearners}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1"><Bar pct={c.completionPct} color={track.color || GREEN} /></div>
                      <span className="w-9 text-right text-xs font-semibold text-slate-600">{c.completionPct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              {track.courses.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No courses in this module.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-slate-400">&ldquo;Completed&rdquo; = learners who finished every lesson in the course. Completion % is of learners who started it.</p>
    </div>
  );
}

/* ─── Red Bull game ───────────────────────────────────────────── */

function runLabel(e: { role: string | null; pattern: string | null; weeks: number | null }) {
  const parts = [e.role, e.pattern ? `${e.pattern} demand` : null, e.weeks ? `${e.weeks} wks` : null].filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
}

function RedBullPanel({ stats }: { stats: LearningHubAnalytics['redBull'] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={<PlayCircle className="h-3.5 w-3.5" />} label="Total plays" value={stats.totalPlays} />
        <StatTile icon={<Users className="h-3.5 w-3.5" />} label="Players" value={stats.uniquePlayers} />
        <StatTile icon={<Trophy className="h-3.5 w-3.5" />} label="Best score" value={stats.bestScore ?? '—'} sub={stats.bestScore == null ? undefined : '/ 100'} />
        <StatTile icon={<CheckCircle2 className="h-3.5 w-3.5" />} label="Average" value={stats.avgScore ?? '—'} sub={stats.avgScore == null ? undefined : '/ 100'} />
        <StatTile icon={<User className="h-3.5 w-3.5" />} label="Solo runs" value={stats.soloPlays} />
        <StatTile icon={<UsersRound className="h-3.5 w-3.5" />} label="Team runs" value={stats.teamPlays} />
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Trophy className="h-4 w-4" style={{ color: GREEN }} /> Leaderboard
        </h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {stats.top.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No games recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="w-14 px-4 py-2.5 font-semibold">Rank</th>
                    <th className="px-4 py-2.5 font-semibold">Player</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Score</th>
                    <th className="px-4 py-2.5 font-semibold">Grade</th>
                    <th className="px-4 py-2.5 font-semibold">Best run</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stats.top.map((e) => (
                    <tr key={`${e.rank}-${e.player_name}`}>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 font-bold text-slate-700">
                          {e.rank <= 3 ? <Medal className="h-4 w-4" style={{ color: ['#C9A227', '#9AA0A6', '#B08D57'][e.rank - 1] }} /> : null}
                          {e.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{e.player_name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-base font-bold" style={{ color: GREEN }}>{e.score}</span>
                        <span className="text-xs text-slate-400"> / 100</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">{e.grade || '-'}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{runLabel(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
