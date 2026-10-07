'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Compass, Loader2, PlayCircle, RotateCcw, X } from 'lucide-react';
import {
  formatLearnerTime,
  levelInPath,
  roleByKey,
  type GuideLevel,
  type GuideRole,
  type TrackGuide as Guide,
} from '@/lib/learning-hub-guide';
import { clearLearnerRole, setLearnerRole } from '@/app/actions/learning-hub-role';

/**
 * "Where do I start?" — a button, and the picker behind it.
 *
 * This was an always-open panel above the course list, which meant every learner read twenty-eight
 * hours of guidance before reaching the thing they came for, including the ones who already knew
 * where they were going. It is now a question you can ask.
 *
 * Asking it once is the point: the chosen role is stored, so the course list stays curated on every
 * later visit rather than resetting to an undifferentiated list of everything.
 */
export default function TrackGuide({
  guide,
  trackKey,
  roleKey,
  color,
}: {
  guide: Guide;
  trackKey: string;
  /** The learner's stored choice, or null if they have not made one. */
  roleKey: string | null;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const role = roleByKey(guide, roleKey);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {role ? (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${color}18` }}
            >
              <Compass className="h-4 w-4" style={{ color }} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-900">
                Your path: {role.role}
              </p>
              <p className="truncate text-xs text-slate-500">
                {role.why} · about {role.hours} h
              </p>
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
              style={{ background: `${color}18` }}
            >
              <Compass className="h-4 w-4" style={{ color }} />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Not sure where to start?</p>
              <p className="truncate text-xs text-slate-500">
                {guide.totals.videos} videos across {guide.levels.length} levels. Almost nobody
                takes all of it.
              </p>
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
          style={{ background: color }}
        >
          {role ? 'Change my role' : 'Find my path'}
        </button>
      </div>

      {open && (
        <GuideDialog
          guide={guide}
          trackKey={trackKey}
          role={role}
          color={color}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function GuideDialog({
  guide,
  trackKey,
  role: savedRole,
  color,
  onClose,
}: {
  guide: Guide;
  trackKey: string;
  role: GuideRole | null;
  color: string;
  onClose: () => void;
}) {
  /* The dialog previews a role before it is committed, so hovering down the list rearranges the
     levels without writing anything. `picked` is the preview; the save is explicit. */
  const [picked, setPicked] = useState<GuideRole | null>(savedRole);
  const [pending, start] = useTransition();
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);

  // Escape closes, and focus moves into the dialog so a keyboard user is not left on the page.
  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  function save() {
    start(async () => {
      if (picked) await setLearnerRole(trackKey, picked.key);
      else await clearLearnerRole(trackKey);
      router.refresh();
      onClose();
    });
  }

  const levels = picked ? guide.levels.filter((l) => levelInPath(picked, l.key).included) : guide.levels;
  const skipped = picked ? guide.levels.filter((l) => !levelInPath(picked, l.key).included) : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Find my path"
        tabIndex={-1}
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl outline-none sm:rounded-2xl"
      >
        {/* ── header ── */}
        <div className="flex items-start justify-between gap-4 px-5 py-4" style={{ background: `${color}0d` }}>
          <div>
            <h2 className="text-base font-bold text-slate-900">Find my path</h2>
            <p className="mt-0.5 max-w-xl text-[13px] leading-relaxed text-slate-600">
              {guide.intro}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white hover:text-slate-700"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* ── the roles ── */}
        <div className="overflow-y-auto px-5 py-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            I am a&hellip;
          </p>
          <div className="flex flex-wrap gap-1.5">
            {guide.roles.map((r) => {
              const active = picked?.key === r.key;
              return (
                <button
                  key={r.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setPicked(active ? null : r)}
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

          {picked && (
            <div
              className="mt-3.5 rounded-xl border px-4 py-3"
              style={{ borderColor: `${color}40`, background: `${color}0a` }}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-sm font-bold text-slate-900">{picked.role}</span>
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold"
                  style={{ color }}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {picked.hours} h of learner time
                </span>
              </div>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{picked.why}</p>
            </div>
          )}

          {/* ── what that means, level by level ── */}
          <div className="mt-4 space-y-2.5">
            {levels.map((level) => (
              <LevelPreview key={level.key} level={level} role={picked} color={color} />
            ))}
            {skipped.length > 0 && (
              <p className="pt-1 text-[12px] text-slate-400">
                Not in this path: {skipped.map((l) => l.label).join(', ')}. They stay available —
                you can take them once your own path is done.
              </p>
            )}
          </div>
        </div>

        {/* ── footer ── */}
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={() => setPicked(null)}
            disabled={!picked || pending}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-40"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Show me everything instead
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ background: color }}
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {picked ? 'Use this path' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function LevelPreview({
  level,
  role,
  color,
}: {
  level: GuideLevel;
  role: GuideRole | null;
  color: string;
}) {
  const path = role ? levelInPath(role, level.key) : null;
  const picked = path?.included ? path.releases : null;
  const partial = picked != null;

  return (
    <div className="rounded-xl border border-slate-200 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-bold text-slate-900">{level.label}</h3>
        {role && (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ background: color }}
          >
            <Check className="h-3 w-3" />
            {partial ? `${picked.length} of ${level.releases.length} releases` : 'All of it'}
          </span>
        )}
        <span className="ml-auto whitespace-nowrap text-[11px] text-slate-400">
          <PlayCircle className="mr-1 inline h-3 w-3" />
          {level.videos} · {formatLearnerTime(level.learnerMinutes)}
        </span>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{level.audience}</p>

      {level.releases.length > 0 && (
        <ul className="mt-2 space-y-1">
          {level.releases.map((r) => {
            /* Releases outside the path are dimmed rather than removed, so the learner can see
               what they are skipping as well as what they are taking. */
            const inPath = !role || !partial || picked.includes(r.title);
            return (
              <li
                key={r.title}
                className={`flex items-baseline justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[12.5px] ${
                  inPath ? 'bg-slate-50 text-slate-700' : 'text-slate-400'
                }`}
              >
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {inPath && role && <Check className="h-3 w-3 shrink-0" style={{ color }} />}
                  {r.title}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {r.videos} · {formatLearnerTime(r.learnerMinutes)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
