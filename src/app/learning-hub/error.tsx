'use client';

import Link from 'next/link';

/**
 * Learning Hub route error boundary (covers /learning-hub and everything under
 * it, including the CMS at /learning-hub/admin).
 *
 * The CMS mutations throw — a pg error, or an {@link AccessError} from the video
 * URL check — and nothing used to catch them, so an admin saw a blank screen with
 * the reason only in the server log. Anything that escapes the inline handling in
 * AdminClient lands here instead, with a way back.
 */
export default function LearningHubError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">
        Something went wrong in the Learning Hub
      </h2>
      <p className="max-w-md text-sm text-slate-500">
        This page could not be loaded. Your progress is safe — nothing was changed by the failure.
      </p>
      {error.digest && (
        <p className="text-xs text-slate-400">
          Reference: <code className="rounded bg-slate-100 px-1 py-0.5">{error.digest}</code>
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={reset}
          className="rounded-xl bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#276041]"
        >
          Try again
        </button>
        <Link
          href="/learning-hub"
          className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50"
        >
          Back to the Learning Hub
        </Link>
      </div>
    </div>
  );
}
