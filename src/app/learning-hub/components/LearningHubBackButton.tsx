import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

// Back-one-level button for Learning Hub pages. `href` is the parent page.
export default function LearningHubBackButton({ href, label = 'Back' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      title={label}
      aria-label={label}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:bg-[#307c4c]/5 hover:text-[#307c4c]"
    >
      <ArrowLeft className="h-4 w-4" />
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
