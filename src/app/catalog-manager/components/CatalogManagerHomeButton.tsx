import Link from 'next/link';

export default function CatalogManagerHomeButton() {
  return (
    <Link
      href="/home"
      title="Back to NESR Home"
      aria-label="Back to NESR home"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
      </svg>
      <span className="hidden sm:inline">Home</span>
    </Link>
  );
}
