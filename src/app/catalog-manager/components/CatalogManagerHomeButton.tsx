import Link from 'next/link';
import { Home } from 'lucide-react';

export default function CatalogManagerHomeButton() {
  return (
    <Link
      href="/home"
      title="Back to NESR Home"
      aria-label="Back to NESR home"
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-all hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c] active:scale-[0.97]"
    >
      <Home className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      <span className="hidden sm:inline">Home</span>
    </Link>
  );
}
