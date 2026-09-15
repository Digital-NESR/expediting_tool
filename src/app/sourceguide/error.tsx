'use client';

/**
 * SourceGuide route error boundary.
 *
 * The read actions used to swallow a database failure and return an empty array,
 * so an outage rendered as a legitimate "no results" page. They now throw, which
 * needs somewhere to land: without this boundary the whole route falls back to
 * the framework's bare error page. A denied or pending user is NOT routed here —
 * those reads still degrade to empty on purpose so the access overlay renders.
 */
export default function SourceGuideError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <h2 className="text-lg font-semibold text-slate-900">SourceGuide could not load this page</h2>
      <p className="max-w-md text-sm text-slate-500">
        The data behind this page is temporarily unavailable. Nothing was changed — please try again.
      </p>
      <button
        onClick={reset}
        className="rounded-xl bg-[#2A7E4F] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#236842]"
      >
        Try again
      </button>
    </div>
  );
}
