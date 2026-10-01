/*
 * Public help page for the Travel Portal - no auth required. The header comes from the /help
 * layout, the video and manual locations from ../media, and the tab strip from ../HelpTabBar,
 * which TI-TE and RFx Officer share.
 *
 * The Travel Portal itself is a separate product on its own domain; this page exists because the
 * card on the home page sends people straight out to it, and the training for it has to live
 * somewhere a person who is not signed in can still reach.
 */
'use client';

import { useState } from 'react';
import { Download, FileWarning } from 'lucide-react';
import { TravelPortalMark } from '@/components/ToolMarks';
import HelpTabBar from '../HelpTabBar';
import { TRAVEL_BRAND } from '../brand';
import {
  TRAVEL_APPROVER_GUIDE_DOC_URL,
  TRAVEL_TRAINING_VIDEO_EMBED_URL,
  TRAVEL_USER_GUIDE_DOC_URL,
} from '../media';

const TABS = [
  { key: 'video', label: 'Training Video' },
  { key: 'user', label: 'User Guide' },
  { key: 'approver', label: 'Approver Guide' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Where the Travel Portal is switched on. The same three the home card lists. */
const LIVE_IN = ['UAE - Dubai', 'UAE - Abu Dhabi', 'Kuwait'];

function DownloadButton({ href, fileName }: { href: string; fileName: string }) {
  return (
    <a
      href={href}
      download={fileName}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      style={{ background: TRAVEL_BRAND }}
    >
      <Download className="h-4 w-4" />
      Download PDF
    </a>
  );
}

/**
 * One manual: a header with its own download button, and the PDF itself inline.
 *
 * Both guides are the same shape, so they are one component rather than two copies. The fallback
 * inside <object> is what a browser with no PDF plugin shows, and it repeats the download rather
 * than leaving a reader at a blank rectangle.
 */
function GuidePanel({
  title,
  blurb,
  href,
  fileName,
}: {
  title: string;
  blurb: string;
  href: string;
  fileName: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">{blurb}</p>
        </div>
        <DownloadButton href={href} fileName={fileName} />
      </div>
      <div className="p-5">
        <object
          data={href}
          type="application/pdf"
          width="100%"
          height="800px"
          className="rounded-lg border border-slate-100"
        >
          <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
            <FileWarning className="h-12 w-12 text-slate-300" strokeWidth={1.5} />
            <div>
              <p className="text-sm font-medium text-slate-700">
                PDF preview is not available in your browser.
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Download the file to read the full guide.
              </p>
            </div>
            <DownloadButton href={href} fileName={fileName} />
          </div>
        </object>
      </div>
    </div>
  );
}

export default function TravelPortalHelpPublicPage() {
  const [tab, setTab] = useState<TabKey>('video');

  return (
    <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: TRAVEL_BRAND }}
          >
            <TravelPortalMark className="h-4 w-4 text-white" />
          </div>
          <p className="text-xs text-slate-400">Travel Portal / Help</p>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Help &amp; Training</h1>
        <p className="mt-1 text-sm text-slate-500">
          Booking travel, and approving somebody else&apos;s. Watch the walkthrough, or read the
          manual for your side of it.
        </p>

        {/* The portal is not switched on everywhere yet, and somebody arriving at the training
            before the rollout reaches them should find that out here rather than at the login. */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Live in
          </span>
          {LIVE_IN.map((place) => (
            <span
              key={place}
              className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600 ring-1 ring-slate-200"
            >
              {place}
            </span>
          ))}
        </div>
      </div>

      <HelpTabBar tabs={TABS} active={tab} onSelect={setTab} brand={TRAVEL_BRAND} boldActiveTab />

      {tab === 'video' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Training Video</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              A walkthrough of the Travel Portal, from booking a trip to approving one.
            </p>
          </div>
          <div className="p-5">
            <iframe
              src={TRAVEL_TRAINING_VIDEO_EMBED_URL}
              width="100%"
              height="500"
              frameBorder="0"
              scrolling="no"
              allowFullScreen
              title="Travel Portal Training Video"
              className="rounded-lg"
            />
          </div>
        </div>
      )}

      {tab === 'user' && (
        <GuidePanel
          title="User Guide"
          blurb="For anybody booking travel: signing in, saving your personal details and preferences, searching flights, booking, and downloading the ticket."
          href={TRAVEL_USER_GUIDE_DOC_URL}
          fileName="NESR-Travel-Portal-User-Guide.pdf"
        />
      )}

      {tab === 'approver' && (
        <GuidePanel
          title="Approver Guide"
          blurb="For approvers: acting on the request straight from the email notification, reviewing and approving inside the portal instead, and delegating approvals."
          href={TRAVEL_APPROVER_GUIDE_DOC_URL}
          fileName="NESR-Travel-Portal-Approver-Guide.pdf"
        />
      )}
    </main>
  );
}
