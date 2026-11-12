import Link from 'next/link';
import { ArrowLeft, Forklift } from 'lucide-react';

/**
 * The RRSM preview, before there is anything to preview.
 *
 * A placeholder on purpose: the launcher card points somewhere, so an administrator clicking it
 * gets a page that says where the work has reached rather than a 404. The portal itself is to be
 * built from the approved design; this file is the first thing that gets replaced when it is.
 */
export default function RrsmPage() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans">
      <div className="mx-auto max-w-2xl px-5 py-20">
        <Link
          href="/home"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 transition-colors hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to applications
        </Link>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100">
            <Forklift className="h-6 w-6 text-slate-400" />
          </div>

          <h1 className="mt-5 text-[22px] font-bold tracking-tight text-slate-900">RRSM</h1>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
            Admin preview · not built yet
          </p>

          <p className="mt-5 text-[14px] leading-relaxed text-slate-600">
            Nothing here yet. The RRSM portal is to be built from the approved design, and this page
            stands in for it so the launcher card has somewhere to go.
          </p>
          <p className="mt-3 text-[14px] leading-relaxed text-slate-600">
            The card on the home launcher is greyed out and inert for everyone who is not a platform
            administrator, and this route refuses them too.
          </p>
        </div>
      </div>
    </div>
  );
}
