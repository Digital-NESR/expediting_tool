/** Shown while a SafeSign page loads: the banner, a row of cards and a table, in grey. */
export default function SafeSignLoading() {
  return (
    <div className="min-h-[100dvh] bg-slate-50">
      <div className="h-14 border-b border-gray-100 bg-white md:h-16" />
      <div className="mx-auto max-w-[1400px] animate-pulse space-y-4 px-4 py-4 sm:px-6">
        <div className="h-[76px] rounded-2xl bg-[#307c4c]/25" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="h-11 bg-slate-50" />
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex gap-4 border-t border-slate-100 px-4 py-4">
              <div className="h-3 flex-1 rounded bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-3 w-24 rounded bg-slate-100" />
              <div className="h-3 w-16 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
