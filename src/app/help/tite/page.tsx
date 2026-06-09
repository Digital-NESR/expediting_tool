/*
 * Public help page for TI-TE — no auth required.
 * TUTORIAL_VIDEO_URL — SharePoint Stream embed URL.
 * DOCS_PDF_URL       — place the PDF at /public/help/documentation.pdf.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';

const TUTORIAL_VIDEO_URL = 'https://nesrcorp-my.sharepoint.com/personal/mfarhan1_nesr_com/_layouts/15/embed.aspx?UniqueId=6d6aa2cc-81db-4eb1-aec6-24014ef1aa7f&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create';
const DOCS_PDF_URL        = '/help/documentation.pdf';

export default function TITEHelpPublicPage() {
  const [tab, setTab] = useState<'video' | 'docs'>('video');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">

      {/* ── Header ── */}
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
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Home
        </Link>
      </header>

      <main className="max-w-[900px] mx-auto px-6 pb-16 pt-6">

        {/* Page heading */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="flex h-6 w-6 items-center justify-center rounded-md shrink-0"
              style={{ background: '#006B0C' }}
            >
              <span className="text-white font-extrabold text-[9px] tracking-tight">TI·TE</span>
            </div>
            <p className="text-xs text-slate-400">TI-TE / Help</p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Help &amp; Documentation</h1>
          <p className="text-sm text-slate-500 mt-1">
            Watch the video walkthrough or read the full documentation below.
          </p>
        </div>

        {/* Tab navigation */}
        <div className="flex gap-0.5 border-b border-slate-200 mb-6">
          {([
            { key: 'video', label: 'Video Tutorial'         },
            { key: 'docs',  label: 'Training Documentation' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2.5 text-[13.5px] font-medium transition-colors border-b-2 -mb-px ${
                tab === key
                  ? 'text-[#006B0C] border-[#006B0C] font-semibold'
                  : 'text-slate-400 border-transparent hover:text-slate-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

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
                src={TUTORIAL_VIDEO_URL}
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
                href={DOCS_PDF_URL}
                download="TITE-Training-Documentation.pdf"
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ background: '#006B0C' }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download PDF
              </a>
            </div>
            <div className="p-5">
              <object
                data={DOCS_PDF_URL}
                type="application/pdf"
                width="100%"
                height="800px"
                className="rounded-lg border border-slate-100"
              >
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-slate-700">PDF preview is not available in your browser.</p>
                    <p className="text-xs text-slate-400 mt-1">Download the file to view the full documentation.</p>
                  </div>
                  <a
                    href={DOCS_PDF_URL}
                    download="TITE-Training-Documentation.pdf"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ background: '#006B0C' }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
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
