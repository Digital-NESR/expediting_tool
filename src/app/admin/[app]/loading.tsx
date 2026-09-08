/* Shown instantly in the content area while an admin section's server
   data loads. The sidebar lives in the layout and stays put, so only
   this panel swaps — navigation feels responsive instead of frozen. */
export default function AdminSectionLoading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-6 w-56 rounded-md bg-slate-200" />
      <div className="mb-6 h-20 w-full rounded-xl bg-slate-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-100" />
        ))}
      </div>
      <div className="mt-6 h-64 w-full rounded-xl bg-slate-100" />
    </div>
  );
}
