'use client';

import { CheckCircle2, XCircle } from 'lucide-react';

/**
 * One answer option, shared by the lesson gate quiz and the module knowledge check.
 *
 * The two quizzes were built separately and learners know both looks, so the palette and the
 * marker placement still differ by `variant`. Everything that is genuinely the same - the states
 * an option can be in, the structure, the disabled rule - is decided once, here.
 */
export type QuizOptionVariant = 'lesson' | 'module';

/**
 * `idle` and `selected` are the states before submitting. Afterwards an option is either the one
 * that should have been picked (`correct`), the learner's wrong pick (`incorrect`), or an option
 * the grading has nothing to say about (`graded`).
 */
export type QuizOptionState = 'idle' | 'selected' | 'correct' | 'incorrect' | 'graded';

const BUTTON_BASE: Record<QuizOptionVariant, string> = {
  lesson:
    'flex w-full items-center gap-3 rounded-lg border px-3.5 py-2.5 text-left text-sm transition-colors',
  module:
    'flex w-full items-center gap-2.5 rounded-xl border px-4 py-2.5 text-left text-sm transition-colors',
};

const BUTTON_STATE: Record<QuizOptionVariant, Record<QuizOptionState, string>> = {
  lesson: {
    idle: 'border-slate-200 bg-white hover:bg-slate-50',
    // The accent border of a pending pick is the track colour, applied inline below.
    selected: 'bg-white',
    correct: 'border-emerald-300 bg-emerald-50',
    incorrect: 'border-red-300 bg-red-50',
    graded: 'border-slate-200 bg-white',
  },
  module: {
    idle: 'border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50',
    selected: 'border-[#307c4c] bg-[#307c4c]/5 text-slate-900',
    correct: 'border-green-200 bg-green-50 text-green-800',
    incorrect: 'border-red-200 bg-red-50 text-red-700',
    graded: 'border-slate-200 text-slate-500',
  },
};

function Marker({
  variant,
  state,
  chosen,
  accentColor,
}: {
  variant: QuizOptionVariant;
  state: QuizOptionState;
  chosen: boolean;
  accentColor: string;
}) {
  // The lesson quiz keeps its radio after grading and reports the outcome with a trailing icon;
  // the module quiz swaps the radio itself for that icon.
  if (variant === 'lesson') {
    return (
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${chosen ? '' : 'border-slate-300'}`}
        style={
          state === 'selected' ? { borderColor: accentColor, background: accentColor } : undefined
        }
      >
        {state === 'selected' && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
      </span>
    );
  }
  if (state === 'correct') return <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />;
  if (state === 'incorrect') return <XCircle className="h-4 w-4 shrink-0 text-red-500" />;
  // A graded option with nothing to report still holds the marker's width, so the rows line up.
  if (state === 'graded') return <span className="h-4 w-4 shrink-0" />;
  return (
    <span
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${state === 'selected' ? 'border-[#307c4c]' : 'border-slate-300'}`}
    >
      {state === 'selected' && (
        <span className="h-2 w-2 rounded-full" style={{ background: accentColor }} />
      )}
    </span>
  );
}

export default function QuizOptionButton({
  variant,
  state,
  chosen,
  label,
  accentColor,
  disabled,
  onClick,
}: {
  variant: QuizOptionVariant;
  state: QuizOptionState;
  /** Whether this was the learner's pick, which the lesson radio keeps showing after grading. */
  chosen: boolean;
  label: string;
  /** The track colour, used for the pending selection. */
  accentColor: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`${BUTTON_BASE[variant]} ${BUTTON_STATE[variant][state]}`}
      style={
        variant === 'lesson' && state === 'selected'
          ? { borderColor: accentColor, boxShadow: `0 0 0 1px ${accentColor}` }
          : undefined
      }
    >
      <Marker variant={variant} state={state} chosen={chosen} accentColor={accentColor} />
      <span className={variant === 'lesson' ? 'flex-1 text-slate-700' : 'flex-1'}>{label}</span>
      {variant === 'lesson' && state === 'correct' && (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
      )}
      {variant === 'lesson' && state === 'incorrect' && (
        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
      )}
    </button>
  );
}
