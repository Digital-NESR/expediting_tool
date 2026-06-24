/*
 * Shared Help & Training content for ProcureGuard, used by both the public page
 * (/help/procureguard) and the in-app page (/procure-guard/help).
 *
 * TO WIRE UP TRAINING MATERIAL (edit the AUDIENCES array below):
 *   videoUrl — two options, auto-detected:
 *                • SharePoint/Stream embed URL (https://...embed.aspx...) → rendered in an <iframe>,
 *                  so SharePoint streams it and the app serves nothing (no size/load on the site).
 *                • Local file in /public/help/, e.g. '/help/procureguard-requester.mp4' → native <video>.
 *              Leave '' to show "coming soon".
 *   pdfUrl   — place the PDF in /public/help/ and point here, e.g. '/help/procureguard-requester.pdf'.
 *              Leave '' to show "coming soon".
 */
'use client';

import { useState } from 'react';

const PG_GREEN = '#307c4c';

type AudienceKey = 'requester' | 'approver' | 'general';

interface AudienceMaterial {
  key: AudienceKey;
  label: string;
  blurb: string;
  videoUrl: string; // SharePoint Stream embed URL — '' = coming soon
  pdfUrl: string; // e.g. '/help/procureguard-requester.pdf' — '' = coming soon
  pdfDownloadName: string;
}

const AUDIENCES: AudienceMaterial[] = [
  {
    key: 'requester',
    label: 'For Requesters',
    blurb: 'How to submit and track adhoc PO and advance payment requests through the approval chain.',
    videoUrl: 'https://nesrcorp-my.sharepoint.com/personal/cmorales_nesr_com/_layouts/15/embed.aspx?UniqueId=7b907d0d-d647-4c08-a8a8-9a22264013ab&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
    pdfUrl: '/help/procureguard-requester.pdf', // placeholder PDF in public/help/ — replace with final guide
    pdfDownloadName: 'ProcureGuard-Requester-Guide.pdf',
  },
  {
    key: 'approver',
    label: 'For Approvers',
    blurb: 'How to review, approve, and reject requests at your stage of the approval workflow.',
    videoUrl: 'https://nesrcorp-my.sharepoint.com/personal/cmorales_nesr_com/_layouts/15/embed.aspx?UniqueId=072e46f1-e586-47c1-bfe8-476a6598959d&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
    pdfUrl: '/help/procureguard-approver.pdf', // placeholder PDF in public/help/ — replace with final guide
    pdfDownloadName: 'ProcureGuard-Approver-Guide.pdf',
  },
  {
    key: 'general',
    label: 'General Overview',
    blurb: 'A general introduction to ProcureGuard — roles, workflow, and notifications.',
    videoUrl: 'https://nesrcorp-my.sharepoint.com/personal/cmorales_nesr_com/_layouts/15/embed.aspx?UniqueId=16ca0d2c-d4be-4e75-b5b9-e335b246a6cf&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
    pdfUrl: '/help/procureguard-overview.pdf', // placeholder PDF in public/help/ — replace with final guide
    pdfDownloadName: 'ProcureGuard-Overview.pdf',
  },
];

function ComingSoon({ kind }: { kind: 'video' | 'documentation' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <svg className="h-6 w-6 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">Training {kind} coming soon</p>
        <p className="mt-1 text-xs text-slate-400">This material is being prepared and will appear here once published.</p>
      </div>
    </div>
  );
}

function DownloadButton({ href, name }: { href: string; name: string }) {
  return (
    <a
      href={href}
      download={name}
      className="inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors"
      style={{ background: PG_GREEN }}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Download PDF
    </a>
  );
}

export default function ProcureGuardHelpContent() {
  const [audienceKey, setAudienceKey] = useState<AudienceKey>('requester');
  const [tab, setTab] = useState<'video' | 'docs'>('video');
  const audience = AUDIENCES.find(a => a.key === audienceKey) ?? AUDIENCES[0];

  return (
    <>
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Help &amp; Training</h1>
        <p className="mt-1 text-sm text-slate-500">
          Choose your role, then watch the video walkthrough or read the documentation.
        </p>
      </div>

      {/* Audience selector */}
      <div className="mb-5 flex flex-wrap gap-2">
        {AUDIENCES.map(a => {
          const active = a.key === audienceKey;
          return (
            <button
              key={a.key}
              onClick={() => setAudienceKey(a.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#307c4c] bg-[#307c4c]/10 text-[#307c4c]'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {a.label}
            </button>
          );
        })}
      </div>

      <p className="mb-6 text-sm text-slate-500">{audience.blurb}</p>

      {/* Video / Docs tabs */}
      <div className="mb-6 flex gap-0.5 border-b border-slate-200">
        {([
          { key: 'video', label: 'Video Tutorial' },
          { key: 'docs', label: 'Training Documentation' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2.5 text-[0.84375rem] font-medium transition-colors ${
              tab === key
                ? 'border-[#307c4c] font-semibold text-[#307c4c]'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Video */}
      {tab === 'video' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <h2 className="text-sm font-bold text-slate-900">Video Tutorial — {audience.label}</h2>
            <p className="mt-0.5 text-xs text-slate-400">A step-by-step walkthrough of ProcureGuard.</p>
          </div>
          <div className="p-4">
            {audience.videoUrl ? (
              audience.videoUrl.startsWith('http') ? (
                <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                  <iframe
                    key={audience.videoUrl}
                    src={audience.videoUrl}
                    frameBorder="0"
                    scrolling="no"
                    allowFullScreen
                    title={`ProcureGuard Training Video — ${audience.label}`}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <video
                  key={audience.videoUrl}
                  controls
                  preload="metadata"
                  className="aspect-video w-full rounded-lg bg-black object-contain"
                >
                  <source src={audience.videoUrl} type="video/mp4" />
                  Your browser does not support embedded video. <a href={audience.videoUrl}>Download the video</a> instead.
                </video>
              )
            ) : (
              <ComingSoon kind="video" />
            )}
          </div>
        </div>
      )}

      {/* Docs */}
      {tab === 'docs' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Training Documentation — {audience.label}</h2>
              <p className="mt-0.5 text-xs text-slate-400">Full reference guide for ProcureGuard.</p>
            </div>
            {audience.pdfUrl && <DownloadButton href={audience.pdfUrl} name={audience.pdfDownloadName} />}
          </div>
          <div className="p-4">
            {audience.pdfUrl ? (
              <object
                data={audience.pdfUrl}
                type="application/pdf"
                width="100%"
                height="800px"
                className="rounded-lg border border-slate-100"
              >
                <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                  <p className="text-sm font-medium text-slate-700">PDF preview is not available in your browser.</p>
                  <DownloadButton href={audience.pdfUrl} name={audience.pdfDownloadName} />
                </div>
              </object>
            ) : (
              <ComingSoon kind="documentation" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
