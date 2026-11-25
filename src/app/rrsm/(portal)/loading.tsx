/**
 * Shown the instant somebody moves between RRSM pages, while the server renders the next one.
 *
 * RRSM had no loading boundary, so a click in the menu did nothing visible until the whole page
 * (database, and on PR & PO the SAP reads) had come back, which is what read as lag. With this the
 * App Router swaps in the skeleton at once and can prefetch the routes, as ProcureGuard and
 * SafeSign already do. Same shape as the RRSM shell: header, green banner, a card row, a table.
 */
export default function RrsmLoading() {
  return (
    <div className="min-h-[100dvh] bg-slate-50" aria-busy="true" aria-label="Loading">
      <div className="flex h-14 items-center gap-3 border-b border-gray-100 bg-white px-4 md:h-16 md:px-6">
        <div className="h-6 w-6 rounded bg-slate-100" />
        <div className="h-9 w-9 rounded-lg bg-[#307c4c]/15" />
        <div className="space-y-1.5">
          <div className="h-3.5 w-16 rounded bg-slate-100" />
          <div className="h-2.5 w-48 rounded bg-slate-100" />
        </div>
        <div className="ml-auto h-8 w-28 rounded-full bg-slate-100" />
      </div>
      <div className="mx-auto max-w-[1400px] animate-pulse space-y-4 px-4 py-4 sm:px-6">
        <div className="h-[82px] rounded-2xl bg-gradient-to-br from-[#307c4c]/40 to-[#1d4f31]/40" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-[104px] rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="h-11 bg-slate-50" />
          {Array.from({ length: 7 }).map((_, i) => (
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
