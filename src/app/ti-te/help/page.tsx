/*
 * The in-app TI-TE help page. Same two tabs as the public /help/tite page, inside
 * the TI-TE sidebar shell rather than the public header — so only the tab strip
 * and the material locations are shared with it, not the frame.
 *
 * Where the video and the PDF live is configuration; see `@/app/help/media` for
 * the environment variables and the SharePoint embed-URL rules.
 */
'use client';

import { useState } from 'react';
import TiteSidebar from '@/components/TiteSidebar';
import HelpTabBar from '@/app/help/HelpTabBar';
import { TITE_BRAND } from '@/app/help/brand';
import { TITE_TRAINING_DOC_URL, TITE_TRAINING_VIDEO_EMBED_URL } from '@/app/help/media';

const TABS = [
  { key: 'video', label: 'Video Tutorial' },
  { key: 'docs', label: 'Training Documentation' },
] as const;

/* ─── Page ─────────────────────────────────────────────────────── */

export default function HelpPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [tab, setTab] = useState<'video' | 'docs'>('video');

  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button
          onClick={() => setSidebarOpen(true)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div
          className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0"
          style={{ background: TITE_BRAND }}
        >
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">Help &amp; Documentation</span>
        <div className="flex-1" />
      </header>

      <main className="max-w-[900px] mx-auto px-6 pb-16 pt-6">
        {/* Page heading */}
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-1">Home / Help</p>
          <h1 className="text-2xl font-bold tracking-tight">Help &amp; Documentation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Watch the video walkthrough or read the full documentation below.
          </p>
        </div>

        <HelpTabBar tabs={TABS} active={tab} onSelect={setTab} brand={TITE_BRAND} boldActiveTab />

        {/* ── Video Tutorial ── */}
        {tab === 'video' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Video Tutorial</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                A step-by-step walkthrough of the TI-TE shipment tracking tool.
              </p>
            </div>
            <div className="p-5">
              <iframe
                src={TITE_TRAINING_VIDEO_EMBED_URL}
                width="100%"
                height="500"
                frameBorder="0"
                scrolling="no"
                allowFullScreen
                title="TITE Training Video"
                className="rounded-lg"
              />
            </div>
          </div>
        )}

        {/* ── Training Documentation ── */}
        {tab === 'docs' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900">Training Documentation</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Full reference guide for the TI-TE tool.
                </p>
              </div>
              <a
                href={TITE_TRAINING_DOC_URL}
                download="TITE-Training-Documentation.pdf"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ background: TITE_BRAND }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download PDF
              </a>
            </div>
            <div className="p-5">
              <object
                data={TITE_TRAINING_DOC_URL}
                type="application/pdf"
                width="100%"
                height="800px"
                className="rounded-lg border border-slate-100"
              >
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <svg
                    className="w-12 h-12 text-slate-300"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      PDF preview is not available in your browser.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      Download the file to view the full documentation.
                    </p>
                  </div>
                  <a
                    href={TITE_TRAINING_DOC_URL}
                    download="TITE-Training-Documentation.pdf"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ background: TITE_BRAND }}
                  >
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    Download PDF
                  </a>
                </div>
              </object>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
