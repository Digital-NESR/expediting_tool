export default function CatalogManagerLoading() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200/70 bg-white/75 px-4 backdrop-blur-xl md:h-16 md:px-6">
        <span className="skeleton-shimmer h-9 w-9 rounded-lg" />
        <span className="skeleton-shimmer h-7 w-7 rounded-lg" />
        <div className="space-y-1.5">
          <span className="skeleton-shimmer h-3.5 w-32 rounded" />
          <span className="skeleton-shimmer h-2.5 w-24 rounded" />
        </div>
        <span className="skeleton-shimmer ml-auto hidden h-9 w-[210px] rounded-lg md:block" />
        <span className="skeleton-shimmer h-9 w-44 rounded-lg" />
      </header>
      <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {/* hero */}
        <div className="overflow-hidden rounded-2xl border border-[#cfe4d8] bg-[linear-gradient(180deg,#eaf4ef_0%,#ffffff_72%)] p-8 shadow-sm">
          <span className="skeleton-shimmer h-6 w-40 rounded-full" />
          <span className="skeleton-shimmer mt-5 block h-10 w-2/3 max-w-[560px] rounded-lg" />
          <span className="skeleton-shimmer mt-3 block h-4 w-1/2 max-w-[420px] rounded" />
          <span className="skeleton-shimmer mt-7 block h-14 w-full max-w-[640px] rounded-2xl" />
        </div>
        {/* stat cards */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
              <span className="absolute inset-x-0 top-0 h-1 bg-slate-100" />
              <div className="flex items-start justify-between">
                <span className="skeleton-shimmer h-3 w-24 rounded" />
                <span className="skeleton-shimmer h-9 w-9 rounded-xl" />
              </div>
              <span className="skeleton-shimmer mt-4 block h-8 w-20 rounded" />
              <span className="skeleton-shimmer mt-2 block h-3 w-32 rounded" />
            </div>
          ))}
        </div>
        {/* content panels */}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <span className="skeleton-shimmer h-4 w-36 rounded" />
              {[0, 1, 2, 3].map((j) => (
                <div key={j} className="flex items-center gap-3">
                  <span className="skeleton-shimmer h-8 w-8 rounded-lg" />
                  <span className="skeleton-shimmer h-3.5 flex-1 rounded" />
                  <span className="skeleton-shimmer h-3.5 w-10 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
