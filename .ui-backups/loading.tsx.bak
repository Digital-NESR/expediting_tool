// Shown instantly on every ProcureGuard navigation while the server renders the
// (force-dynamic) page. Giving the App Router a loading boundary makes <Link>
// transitions feel immediate and lets the router prefetch these routes.
export default function ProcureGuardLoading() {
  return (
    <div className="min-h-[100dvh] bg-white font-sans">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:h-16 md:px-8">
        <div className="h-9 w-9 rounded-lg bg-slate-100" />
        <div className="h-6 w-6 rounded-md bg-[#307c4c]/20" />
        <div className="h-4 w-44 rounded bg-slate-100" />
        <div className="ml-auto hidden h-3 w-24 rounded bg-slate-100 sm:block" />
      </header>

      <main className="mx-auto max-w-[1220px] space-y-6 px-4 py-6 sm:px-6">
        <div className="animate-pulse space-y-6">
          {/* Hero banner */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-t-4 border-[#307c4c]/40 p-6 sm:p-8">
              <div className="h-3 w-44 rounded bg-slate-100" />
              <div className="h-6 w-56 rounded bg-slate-100" />
              <div className="h-4 w-full max-w-xl rounded bg-slate-100" />
            </div>
          </div>

          {/* Metric cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="h-3 w-24 rounded bg-slate-100" />
                <div className="h-8 w-20 rounded bg-slate-100" />
                <div className="h-3 w-32 rounded bg-slate-100" />
              </div>
            ))}
          </div>

          {/* List / table block */}
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-40 rounded bg-slate-100" />
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/3 rounded bg-slate-100" />
                  <div className="h-3 w-1/2 rounded bg-slate-100" />
                </div>
                <div className="h-5 w-20 rounded bg-slate-100" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
