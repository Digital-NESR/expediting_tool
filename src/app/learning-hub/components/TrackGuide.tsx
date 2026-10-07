'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Check, ChevronDown, Clock, Compass, PlayCircle } from 'lucide-react';
import {
  formatLearnerTime,
  levelInPath,
  type GuideLevel,
  type GuideRole,
  type TrackGuide,
} from '@/lib/learning-hub-guide';

/**
 * "Where to start", above the course list.
 *
 * The problem it solves is the first thirty seconds: three courses, eight releases, twenty-eight
 * hours, and nothing on the page saying which of it is yours. The programme's own answer is
 * role-shaped, so the control is a role. Picking one narrows the three level cards to the path that
 * role takes and names the exact releases inside each, which is the part a course list cannot show.
 *
 * It opens collapsed with the roles visible, because somebody who already knows where they are
 * going should see their courses, not a wall of guidance.
 */
export default function TrackGuide({
  guide,
  trackKey,
  courseIdByTitle,
  color,
}: {
  guide: TrackGuide;
  trackKey: string;
  /** Course title → id, so a level card can link to the real course. */
  courseIdByTitle: Record<string, number>;
  color: string;
}) {
  const [role, setRole] = useState<GuideRole | null>(null);
  const [open, setOpen] = useState(false);

  const levels = role
    ? guide.levels.filter((l) => levelInPath(role, l.key).included)
    : guide.levels;

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4" style={{ background: `${color}08` }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${color}18` }}
            >
              <Compass className="h-4 w-4" style={{ color }} />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">{guide.heading}</h2>
              <p className="text-xs text-slate-500">
                {guide.totals.videos} videos · {guide.totals.videoHours} h of video ·{' '}
                {guide.totals.learnerHours} h with the exercises
              </p>
            </div>
          </div>
          {role && (
            <button
              type="button"
              onClick={() => setRole(null)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50"
            >
              Clear role
            </button>
          )}
        </div>
        <p className="mt-2.5 max-w-3xl text-[13px] leading-relaxed text-slate-600">{guide.intro}</p>
      </div>

      {/* ── the control: pick a role ── */}
      <div className="border-b border-slate-100 px-5 py-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          I am a&hellip;
        </p>
        <div className="flex flex-wrap gap-1.5">
          {guide.roles.map((r) => {
            const active = role?.role === r.role;
            return (
              <button
                key={r.role}
                type="button"
                aria-pressed={active}
                onClick={() => setRole(active ? null : r)}
                className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                  active
                    ? 'border-transparent text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
                style={active ? { background: color } : undefined}
              >
                {r.role}
              </button>
            );
          })}
        </div>

        {role && (
          <div
            className="mt-3.5 rounded-xl border px-4 py-3"
            style={{ borderColor: `${color}40`, background: `${color}0a` }}
          >
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-bold text-slate-900">{role.role}</span>
              <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color }}>
                <Clock className="h-3.5 w-3.5" />
                {role.hours} h of learner time
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{role.why}</p>
          </div>
        )}
      </div>

      {/* ── the three levels, narrowed to the chosen path ── */}
      <div className="divide-y divide-slate-100">
        {levels.map((level) => (
          <LevelRow
            key={level.key}
            level={level}
            role={role}
            href={
              courseIdByTitle[level.courseTitle] != null
                ? `/learning-hub/${trackKey}/${courseIdByTitle[level.courseTitle]}`
                : null
            }
            color={color}
            showOutcomes={open}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 bg-slate-50/60 py-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100"
      >
        {open ? 'Hide what each level teaches' : 'Show what each level teaches'}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
    </section>
  );
}

function LevelRow({
  level,
  role,
  href,
  color,
  showOutcomes,
}: {
  level: GuideLevel;
  role: GuideRole | null;
  /** Null when no published course matches this level's title; the card then has no button. */
  href: string | null;
  color: string;
  showOutcomes: boolean;
}) {
  const path = role ? levelInPath(role, level.key) : null;
  /* With a role chosen, a level is either taken whole or taken as named releases. `releases: null`
     inside an included path means the whole level, which is why this is not just a list check. */
  const picked = path?.included ? path.releases : null;
  const partial = picked !== null && picked !== undefined;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900">{level.label}</h3>
            {role && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
                style={{ background: color }}
              >
                <Check className="h-3 w-3" />
                {partial ? `${picked.length} of ${level.releases.length} releases` : 'All of it'}
              </span>
            )}
            {level.prerequisite && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {level.prerequisite}
              </span>
            )}
          </div>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-600">
            {level.audience}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <span className="whitespace-nowrap text-xs text-slate-400">
            <PlayCircle className="mr-1 inline h-3.5 w-3.5" />
            {level.videos} · {formatLearnerTime(level.learnerMinutes)}
          </span>
          {href && (
            <Link
              href={href}
              className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: color }}
            >
              Open <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {level.releases.length > 0 && (
        <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {level.releases.map((r) => {
            /* Without a role every release is shown plainly. With one, the releases outside the
               path are dimmed rather than hidden, so the learner can see what they are skipping. */
            const inPath = !role || !partial || picked.includes(r.title);
            return (
              <li
                key={r.title}
                className={`rounded-lg border px-3 py-2 ${
                  inPath ? 'border-slate-200 bg-white' : 'border-slate-100 bg-slate-50/60 opacity-55'
                }`}
                style={inPath && role ? { borderColor: `${color}55` } : undefined}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[13px] font-semibold text-slate-800">{r.title}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">
                    {r.videos} · {formatLearnerTime(r.learnerMinutes)}
                  </span>
                </div>
                <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{r.audience}</p>
              </li>
            );
          })}
        </ul>
      )}

      {level.note && (
        <p className="mt-2.5 border-l-2 pl-2.5 text-[12.5px] italic leading-relaxed text-slate-500"
           style={{ borderColor: `${color}55` }}>
          {level.note}
        </p>
      )}

      {showOutcomes && (
        <div className="mt-3 rounded-xl bg-slate-50 px-4 py-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            After this you can
          </p>
          <ul className="space-y-1">
            {level.outcomes.map((o) => (
              <li key={o} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color }} />
                <span>{o}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
