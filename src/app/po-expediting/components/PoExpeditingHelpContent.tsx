'use client';

import { useState } from 'react';

type GuideKey = 'full' | 'supplier';

interface Guide {
  key: GuideKey;
  label: string;
  title: string;
  blurb: string;
  videoUrl: string;
}

const GUIDES: Guide[] = [
  {
    key: 'full',
    label: 'Full Guide',
    title: 'PO Expediting, Full Guide',
    blurb: 'A complete walkthrough of the tool: navigating the dashboard, filtering and sorting open POs, building an expedite queue, sending supplier update requests, and reconciling the responses that come back.',
    videoUrl:
      'https://nesrcorp.sharepoint.com/sites/digitalstudio/_layouts/15/embed.aspx?UniqueId=784e6c40-b34f-409c-9b30-9bd26fdadbfc&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
  },
  {
    key: 'supplier',
    label: 'Supplier Guide',
    title: 'PO Expediting, Supplier Guide',
    blurb: 'For suppliers: how to open the update link, review the purchase orders NESR is expediting, and submit delivery status and dates back to the team.',
    videoUrl:
      'https://nesrcorp.sharepoint.com/sites/digitalstudio/_layouts/15/embed.aspx?UniqueId=814d1093-6f25-4093-b2eb-aac7402dcc7c&embed=%7B%22ust%22%3Afalse%2C%22hv%22%3A%22CopyEmbedCode%22%7D&referrer=StreamWebApp&referrerScenario=EmbedDialog.Create',
  },
];

const FEATURES = [
  'Live open-PO dashboard',
  'DS-code delivery tracking',
  'Expedite queue',
  'Supplier update requests',
  'Response reconciliation',
  'Analytics',
];

export default function PoExpeditingHelpContent() {
  const [key, setKey] = useState<GuideKey>('full');
  const guide = GUIDES.find((g) => g.key === key) ?? GUIDES[0];

  return (
    <>
      {/* Heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Help &amp; Training</h1>
        <p className="mt-1 text-sm text-slate-500">Everything you need to get up to speed on PO Expediting.</p>
      </div>

      {/* About the tool */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">About PO Expediting</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          PO Expediting gives the supply chain team a live view of every open purchase order sourced from SAP, so
          nothing slips through the cracks. Track delivery status against DS codes, filter and sort by due date, value,
          supplier, or country, and see at a glance what is past due, due this week, or on track.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          Select the lines you need to chase, build an expedite queue, and send suppliers one consolidated update
          request. Supplier responses flow back in and reconcile against the open POs, giving the whole team a single
          place to drive on-time delivery.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {FEATURES.map((f) => (
            <span key={f} className="rounded-full bg-[#307c4c]/10 px-2.5 py-1 text-[11px] font-semibold text-[#307c4c]">
              {f}
            </span>
          ))}
        </div>
      </div>

      {/* Guide tabs */}
      <div className="mb-5 flex flex-wrap gap-2">
        {GUIDES.map((g) => {
          const active = g.key === key;
          return (
            <button
              key={g.key}
              onClick={() => setKey(g.key)}
              className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-colors ${
                active
                  ? 'border-[#307c4c] bg-[#307c4c]/10 text-[#307c4c]'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {g.label}
            </button>
          );
        })}
      </div>

      <p className="mb-6 text-sm text-slate-500">{guide.blurb}</p>

      {/* Video */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-slate-900">{guide.title}</h2>
          <p className="mt-0.5 text-xs text-slate-400">Video walkthrough</p>
        </div>
        <div className="p-4">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              key={guide.videoUrl}
              src={guide.videoUrl}
              frameBorder="0"
              scrolling="no"
              allowFullScreen
              title={guide.title}
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </>
  );
}
