'use client';

import type { SendProgress as Progress } from '../types';

/**
 * The send button, while it is sending.
 *
 * A country of 120 suppliers takes about two minutes, because each letter is a real webhook call
 * to a real mail server. A disabled button for two minutes is indistinguishable from a hang, and
 * the reasonable thing for somebody to do about a hang is press it again.
 *
 * So it says three things: how far through, which supplier is being written to right now, and how
 * many refused. The vendor name matters as much as the number: a count that ticks could be a
 * animation, a supplier's name changing could not.
 *
 * It takes the place of the button rather than sitting beside it, so there is nothing left to
 * press while the send runs.
 */
export default function SendProgressBar({ progress, pct }: { progress: Progress; pct: number }) {
  const verb =
    progress.kind === 'request'
      ? 'Sending'
      : progress.kind === 'reminder'
        ? 'Reminding'
        : 'Retrying';

  return (
    <div
      className="min-w-[300px] rounded-[7px] border border-sns-line bg-white px-3 py-2"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] font-bold text-sns-ink">
          {verb} {progress.done} of {progress.total}
        </span>
        {progress.failed > 0 && (
          <span className="text-[10.5px] font-bold text-[#B71C1C]">{progress.failed} failed</span>
        )}
      </div>

      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#ECEFEC]">
        <div
          className="h-full rounded-full bg-sns-green transition-[width] duration-300 ease-out"
          style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
        />
      </div>

      {/* Truncated rather than wrapped: the bar must not change height as the names change, or the
          buttons beside it jump on every vendor. */}
      <div className="mt-1 truncate text-[10.5px] text-sns-grey" title={progress.current}>
        {progress.current || 'Working out who is due'}
      </div>
    </div>
  );
}
