'use client';

import { Fragment, useState, type ReactNode } from 'react';
import {
  GraduationCap,
  Users,
  CheckCircle2,
  BookOpen,
  PlayCircle,
  Trophy,
  Medal,
  User,
  UsersRound,
  Eye,
  ClipboardCheck,
  TrendingDown,
  Flame,
  ChevronRight,
  Info,
} from 'lucide-react';
import type {
  LearningHubAnalytics,
  LhCourseAnalytics,
  LhLearnerRow,
  LhTrackAnalytics,
  LhWeekPoint,
} from '@/types/learning-hub';

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

      {/* Views arrived in their own migration. Until it has run, every funnel's first step is 0,
          which is indistinguishable from "nobody opened anything" — so say which it is. */}
      {!data.viewTracking && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            View tracking isn&apos;t recording yet (migration <code>002_lesson_views</code> hasn&apos;t
            run against this database). Everything below is accurate except the &ldquo;viewed&rdquo;
            figures, which stay at zero.
          </span>
        </div>
      )}

      {tab === 'overview' && <Overview data={data} onOpenTrack={(k) => setTab(`track:${k}`)} />}
      {data.tracks.map((t) =>
        tab === `track:${t.key}` ? <TrackPanel key={t.key} track={t} /> : null,
      )}
      {tab === 'redbull' && <RedBullPanel stats={data.redBull} />}
    </div>
  );
}

/* ─── shared bits ─────────────────────────────────────────────── */

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub?: string;
}) {
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
      <div
        className="h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: color }}
      />
    </div>
  );
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

function Dash() {
  return <span className="text-slate-300">—</span>;
}

/** A score with its own colour, so a weak quiz reads as weak without reading the number. */
function Score({ value }: { value: number | null }) {
  if (value == null) return <Dash />;
  const tone = value >= 80 ? 'text-emerald-600' : value >= 60 ? 'text-amber-600' : 'text-red-600';
  return <span className={`font-semibold ${tone}`}>{value}%</span>;
}

function shortDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
  });
}

/* ─── Overview ────────────────────────────────────────────────── */

/**
 * Twelve weeks of starts and completions.
 *
 * Deliberately two bars per week rather than a line: the interesting reading is the gap between
 * what people opened and what they finished, and two lines at this size cross each other into mush.
 */
function ActivityStrip({ weeks }: { weeks: LhWeekPoint[] }) {
  if (weeks.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-400 shadow-sm">
        No activity in the last twelve weeks.
      </div>
    );
  }
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.started, w.completed)));
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="mb-3 flex items-center gap-4 text-[11px] font-semibold text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-slate-300" /> Lessons started
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: GREEN }} /> Lessons completed
        </span>
        <span className="ml-auto font-normal text-slate-400">peak {peak}/week</span>
      </div>
      <div className="flex h-24 items-end gap-2">
        {weeks.map((w) => (
          <div key={w.week} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-20 w-full items-end justify-center gap-0.5">
              <div
                className="w-1/2 rounded-t bg-slate-200"
                style={{ height: `${(w.started / peak) * 100}%` }}
                title={`${w.started} started`}
              />
              <div
                className="w-1/2 rounded-t"
                style={{ height: `${(w.completed / peak) * 100}%`, background: GREEN }}
                title={`${w.completed} completed`}
              />
            </div>
            <span className="text-[9px] text-slate-400">{w.week.slice(5).replace('-', '/')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Overview({
  data,
  onOpenTrack,
}: {
  data: LearningHubAnalytics;
  onOpenTrack: (key: string) => void;
}) {
  const o = data.overview;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          icon={<Eye className="h-3.5 w-3.5" />}
          label="Opened a lesson"
          value={o.viewers}
        />
        <StatTile
          icon={<Users className="h-3.5 w-3.5" />}
          label="Finished one"
          value={o.learners}
        />
        <StatTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Lessons done"
          value={o.lessonCompletions}
        />
        <StatTile
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Courses completed"
          value={o.courseCompletions}
        />
        <StatTile
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          label="Quiz takers"
          value={o.quizTakers}
          sub={`of ${o.quizCount} quizzes`}
        />
        <StatTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Quiz pass rate"
          value={o.quizPassRate == null ? '—' : `${o.quizPassRate}%`}
        />
      </div>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Last 12 weeks</h3>
        <ActivityStrip weeks={data.weekly} />
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">By module</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Module</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Opened</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Learners</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Courses</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Lessons</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Lessons done</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Quiz avg</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Courses completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tracks.map((t) => (
                  <tr
                    key={t.key}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => onOpenTrack(t.key)}
                  >
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold text-slate-900">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: t.color || GREEN }}
                        />
                        {t.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.viewers}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.learners}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.courses.length}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.lessonCount}</td>
                    <td className="px-4 py-3 text-right text-slate-700">{t.lessonCompletions}</td>
                    <td className="px-4 py-3 text-right">
                      <Score value={t.avgBestPct} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: GREEN }}>
                      {t.completedLearners}
                    </td>
                  </tr>
                ))}
                {data.tracks.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                      No modules yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Click a module for its lessons, quizzes and learners. &ldquo;Opened&rdquo; = people who
          started a lesson; &ldquo;Learners&rdquo; = people who finished at least one.
        </p>
      </section>
    </div>
  );
}

/* ─── Insights ────────────────────────────────────────────────── */

type Insight = { icon: ReactNode; label: string; headline: string; detail: string };

/**
 * The three or four things worth saying out loud about a module.
 *
 * Everything here is derived from figures already on the page — this is about which of them an
 * admin would otherwise have to go hunting for. A card is omitted rather than shown empty: a panel
 * of "no data yet" boxes is worse than a shorter panel.
 */
function insightsFor(track: LhTrackAnalytics): Insight[] {
  const lessons = track.courses.flatMap((c) => c.lessons);
  const quizzes = track.courses.flatMap((c) => c.quizzes);
  const out: Insight[] = [];

  const dropOff = lessons
    .filter((l) => l.viewers > 0)
    .map((l) => ({ l, lost: l.viewers - l.completions }))
    .sort((a, b) => b.lost - a.lost)[0];
  if (dropOff && dropOff.lost > 0) {
    out.push({
      icon: <TrendingDown className="h-4 w-4 text-red-500" />,
      label: 'Biggest drop-off',
      headline: dropOff.l.title,
      detail: `${dropOff.l.viewers} opened it, ${dropOff.l.completions} finished — ${dropOff.lost} walked away.`,
    });
  }

  const watched = [...lessons].sort((a, b) => b.viewers - a.viewers)[0];
  if (watched && watched.viewers > 0) {
    out.push({
      icon: <Eye className="h-4 w-4" style={{ color: GREEN }} />,
      label: 'Most watched',
      headline: watched.title,
      detail: `${watched.viewers} people opened it, ${pct(watched.completions, watched.viewers)}% went on to finish.`,
    });
  }

  const scored = quizzes.filter((q) => q.takers > 0 && q.avgBestPct != null);
  const hardest = [...scored].sort((a, b) => (a.avgBestPct ?? 0) - (b.avgBestPct ?? 0))[0];
  if (hardest) {
    out.push({
      icon: <Flame className="h-4 w-4 text-amber-500" />,
      label: 'Hardest quiz',
      headline: hardest.title,
      detail: `${hardest.avgBestPct}% average best score across ${hardest.takers} ${
        hardest.takers === 1 ? 'person' : 'people'
      }, ${hardest.passers} passed.`,
    });
  }

  const grind = [...quizzes]
    .filter((q) => q.avgAttempts != null && q.takers > 0)
    .sort((a, b) => (b.avgAttempts ?? 0) - (a.avgAttempts ?? 0))[0];
  if (grind && (grind.avgAttempts ?? 0) > 1) {
    out.push({
      icon: <ClipboardCheck className="h-4 w-4 text-slate-500" />,
      label: 'Most retaken',
      headline: grind.title,
      detail: `${grind.avgAttempts} attempts each on average.`,
    });
  }

  return out;
}

function InsightCards({ items }: { items: Insight[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((i) => (
        <div key={i.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {i.icon}
            {i.label}
          </div>
          <p className="mt-1.5 text-sm font-bold leading-snug text-slate-900">{i.headline}</p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{i.detail}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Course drill-down ───────────────────────────────────────── */

function CourseDetail({ course, color }: { course: LhCourseAnalytics; color: string }) {
  return (
    <div className="space-y-4 bg-slate-50/70 px-4 py-4">
      <div>
        <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Lesson funnel
        </h4>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                <th className="px-3 py-2 font-semibold">Lesson</th>
                <th className="px-3 py-2 text-right font-semibold">Opened</th>
                <th className="px-3 py-2 text-right font-semibold">Finished</th>
                <th className="px-3 py-2 font-semibold">Stuck through</th>
                <th className="px-3 py-2 text-right font-semibold">Quiz</th>
                <th className="px-3 py-2 text-right font-semibold">Avg score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {course.lessons.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 text-slate-800">
                      {l.hasVideo && <PlayCircle className="h-3.5 w-3.5 shrink-0 text-slate-400" />}
                      {l.title}
                    </span>
                    <span className="block text-[10px] text-slate-400">{l.moduleTitle}</span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-700">{l.viewers}</td>
                  <td className="px-3 py-2 text-right text-slate-700">{l.completions}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-24">
                        <Bar pct={pct(l.completions, l.viewers)} color={color} />
                      </div>
                      <span className="w-9 text-right text-[11px] font-semibold text-slate-500">
                        {l.viewers > 0 ? `${pct(l.completions, l.viewers)}%` : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-600">
                    {l.quizTakers > 0 ? (
                      <>
                        {l.quizPassers}/{l.quizTakers} passed
                      </>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Score value={l.avgBestPct} />
                  </td>
                </tr>
              ))}
              {course.lessons.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-slate-400">
                    This course has no lessons yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {course.quizzes.length > 0 && (
        <div>
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Quizzes
          </h4>
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-semibold">Quiz</th>
                  <th className="px-3 py-2 text-right font-semibold">Questions</th>
                  <th className="px-3 py-2 text-right font-semibold">Took it</th>
                  <th className="px-3 py-2 text-right font-semibold">Passed</th>
                  <th className="px-3 py-2 text-right font-semibold">Avg best</th>
                  <th className="px-3 py-2 text-right font-semibold">Avg tries</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {course.quizzes.map((q) => (
                  <tr key={q.id}>
                    <td className="px-3 py-2 text-slate-800">
                      {q.title}
                      <span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400">
                        {q.scope}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">{q.questionCount}</td>
                    <td className="px-3 py-2 text-right text-slate-700">{q.takers}</td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {q.takers > 0 ? `${q.passers} (${pct(q.passers, q.takers)}%)` : <Dash />}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Score value={q.avgBestPct} />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {q.avgAttempts ?? <Dash />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Learner journey ─────────────────────────────────────────── */

const STAGE_TONE: Record<LhLearnerRow['stage'], string> = {
  'Not started': 'bg-slate-100 text-slate-500',
  Browsing: 'bg-sky-50 text-sky-700',
  'In progress': 'bg-amber-50 text-amber-700',
  'Nearly there': 'bg-indigo-50 text-indigo-700',
  Completed: 'bg-emerald-50 text-emerald-700',
};

function LearnerTable({ track }: { track: LhTrackAnalytics }) {
  const [all, setAll] = useState(false);
  const rows = all ? track.learnerRows : track.learnerRows.slice(0, 15);
  const color = track.color || GREEN;

  if (track.learnerRows.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500 shadow-sm">
        Nobody has opened this module yet.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="px-4 py-2.5 font-semibold">Learner</th>
                <th className="px-4 py-2.5 font-semibold">Stage</th>
                <th className="px-4 py-2.5 font-semibold">Progress</th>
                {track.courses.map((c) => (
                  <th key={c.id} className="px-3 py-2.5 text-right font-semibold">
                    {c.title}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-semibold">Quizzes</th>
                <th className="px-4 py-2.5 text-right font-semibold">Avg score</th>
                <th className="px-4 py-2.5 text-right font-semibold">Last seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.email}>
                  <td className="px-4 py-3 font-medium text-slate-800">{r.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STAGE_TONE[r.stage]}`}
                    >
                      {r.stage}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-20">
                        <Bar pct={pct(r.lessonsCompleted, r.lessonCount)} color={color} />
                      </div>
                      <span className="whitespace-nowrap text-[11px] text-slate-500">
                        {r.lessonsCompleted}/{r.lessonCount}
                      </span>
                    </div>
                  </td>
                  {r.courses.map((c) => (
                    <td key={c.id} className="px-3 py-3 text-right text-slate-600">
                      {c.done > 0 || c.total > 0 ? (
                        <span className={c.total > 0 && c.done >= c.total ? 'font-bold' : ''}>
                          {c.done}/{c.total}
                        </span>
                      ) : (
                        <Dash />
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right text-slate-600">
                    {r.quizzesTaken > 0 ? (
                      <>
                        {r.quizzesPassed}/{r.quizzesTaken}
                      </>
                    ) : (
                      <Dash />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Score value={r.avgBestPct} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right text-xs text-slate-500">
                    {shortDate(r.lastActiveAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {track.learnerRows.length > 15 && (
        <button
          onClick={() => setAll((v) => !v)}
          className="mt-2 text-xs font-semibold text-slate-500 hover:text-slate-800"
        >
          {all ? 'Show top 15' : `Show all ${track.learnerRows.length} learners`}
        </button>
      )}
    </>
  );
}

/* ─── Per-module (track) ──────────────────────────────────────── */

function TrackPanel({ track }: { track: LhTrackAnalytics }) {
  const [open, setOpen] = useState<number | null>(null);
  const color = track.color || GREEN;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile icon={<Eye className="h-3.5 w-3.5" />} label="Opened" value={track.viewers} />
        <StatTile
          icon={<Users className="h-3.5 w-3.5" />}
          label="Learners"
          value={track.learners}
        />
        <StatTile
          icon={<BookOpen className="h-3.5 w-3.5" />}
          label="Courses"
          value={track.courses.length}
        />
        <StatTile
          icon={<PlayCircle className="h-3.5 w-3.5" />}
          label="Lessons"
          value={track.lessonCount}
        />
        <StatTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Lessons done"
          value={track.lessonCompletions}
        />
        <StatTile
          icon={<ClipboardCheck className="h-3.5 w-3.5" />}
          label="Quiz avg"
          value={track.avgBestPct == null ? '—' : `${track.avgBestPct}%`}
          sub={track.quizTakers > 0 ? `${track.quizTakers} sat` : undefined}
        />
      </div>

      <InsightCards items={insightsFor(track)} />

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Courses</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-2.5 font-semibold">Course</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Lessons</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Opened</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Learners</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Completed</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Quiz avg</th>
                  <th className="px-4 py-2.5 font-semibold">Completion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {track.courses.map((c) => (
                  /* The row and its drill-down are siblings in one <tbody>, so they share a keyed
                     Fragment rather than nesting a table inside a cell. */
                  <Fragment key={c.id}>
                    <tr
                      className="cursor-pointer hover:bg-slate-50"
                      onClick={() => setOpen(open === c.id ? null : c.id)}
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5">
                          <ChevronRight
                            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open === c.id ? 'rotate-90' : ''}`}
                          />
                          <span className="font-semibold text-slate-900">{c.title}</span>
                        </span>
                        {c.status !== 'published' && (
                          <span className="ml-2 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {c.status}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.lessonCount}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.viewers}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.learners}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{c.completedLearners}</td>
                      <td className="px-4 py-3 text-right">
                        <Score value={c.avgBestPct} />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <Bar pct={c.completionPct} color={color} />
                          </div>
                          <span className="w-9 text-right text-xs font-semibold text-slate-600">
                            {c.completionPct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                    {open === c.id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <CourseDetail course={c} color={color} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {track.courses.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                      No courses in this module.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Click a course for its lesson funnel and quiz scores. &ldquo;Completed&rdquo; = learners
          who finished every lesson; completion % is of learners who started it.
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Learner journey</h3>
        <LearnerTable track={track} />
        <p className="mt-2 text-xs text-slate-400">
          One row per person who has opened anything in this module, furthest along first.
          &ldquo;Browsing&rdquo; means they have opened lessons but finished none.
        </p>
      </section>
    </div>
  );
}

/* ─── Red Bull game ───────────────────────────────────────────── */

function runLabel(e: { role: string | null; pattern: string | null; weeks: number | null }) {
  const parts = [
    e.role,
    e.pattern ? `${e.pattern} demand` : null,
    e.weeks ? `${e.weeks} wks` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : '-';
}

function RedBullPanel({ stats }: { stats: LearningHubAnalytics['redBull'] }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile
          icon={<PlayCircle className="h-3.5 w-3.5" />}
          label="Total plays"
          value={stats.totalPlays}
        />
        <StatTile
          icon={<Users className="h-3.5 w-3.5" />}
          label="Players"
          value={stats.uniquePlayers}
        />
        <StatTile
          icon={<Trophy className="h-3.5 w-3.5" />}
          label="Best score"
          value={stats.bestScore ?? '—'}
          sub={stats.bestScore == null ? undefined : '/ 100'}
        />
        <StatTile
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label="Average"
          value={stats.avgScore ?? '—'}
          sub={stats.avgScore == null ? undefined : '/ 100'}
        />
        <StatTile
          icon={<User className="h-3.5 w-3.5" />}
          label="Solo runs"
          value={stats.soloPlays}
        />
        <StatTile
          icon={<UsersRound className="h-3.5 w-3.5" />}
          label="Team runs"
          value={stats.teamPlays}
        />
      </div>

      <section>
        <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <Trophy className="h-4 w-4" style={{ color: GREEN }} /> Leaderboard
        </h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {stats.top.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">
              No games recorded yet.
            </div>
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
                          {e.rank <= 3 ? (
                            <Medal
                              className="h-4 w-4"
                              style={{ color: ['#C9A227', '#9AA0A6', '#B08D57'][e.rank - 1] }}
                            />
                          ) : null}
                          {e.rank}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{e.player_name}</td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-base font-bold" style={{ color: GREEN }}>
                          {e.score}
                        </span>
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
