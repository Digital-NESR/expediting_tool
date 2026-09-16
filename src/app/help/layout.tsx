/*
 * Shell shared by every public /help/* page.
 *
 * These pages are reachable without signing in, so the shell is deliberately
 * session-free: a static wordmark and a plain link back to the home page, with
 * no user menu and nothing that reads a session. Each of the five pages used to
 * carry its own byte-identical copy of this header, which is how they drifted
 * into two different class orderings for the same result.
 *
 * The <main> element stays with each page — RFx Officer is deliberately wider
 * than the rest — so only the header lives here.
 */
import Image from 'next/image';
import Link from 'next/link';

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center gap-3 sticky top-0 z-30">
        <Image
          src="/nesr-logo-circle.png"
          alt="NESR"
          width={30}
          height={30}
          className="rounded-full"
        />
        <span className="font-semibold text-slate-900 text-sm tracking-tight">
          NESR Digital Supply Chain
        </span>
        <div className="flex-1" />
        <Link
          href="/home"
          className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </header>

      {children}
    </div>
  );
}
