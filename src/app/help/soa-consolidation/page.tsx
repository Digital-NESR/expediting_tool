/*
 * Public help page for SOA Consolidation - no auth required, like the rest of /help.
 *
 * Public matters more here than on most of the tools. Half the people who need to understand the
 * cycle cannot sign in to it: the AP contacts are shared mailboxes, and the suppliers who receive
 * the request letter have no account at all. A page behind the tool's access gate would be
 * unreachable by exactly the audience that has to know what the letter in their inbox is.
 *
 * The header comes from the /help layout and the video location from ../media.
 */
'use client';

import { Receipt } from 'lucide-react';
import { SOA_BRAND } from '../brand';
import { SOA_TRAINING_VIDEO_EMBED_URL } from '../media';

/** The cycle in the order it is run, which is the order the walkthrough follows. */
const STAGES = [
  { label: 'Scope', detail: 'Pick the vendors whose balances carry the country.' },
  { label: 'Request', detail: 'One letter to each, with their open PO figure in it.' },
  { label: 'Remind', detail: 'Chase the silent ones before the window closes.' },
  { label: 'Accept', detail: 'File the statement or the reply it came in.' },
  { label: 'Consolidate', detail: 'Every invoice line in one workbook.' },
  { label: 'Hand off', detail: 'Delivered to AP, with the evidence behind it.' },
];

export default function SoaConsolidationHelpPublicPage() {
  return (
    <main className="mx-auto max-w-[900px] px-6 pb-16 pt-6">
      <div className="mb-6">
        <div className="mb-1 flex items-center gap-2">
          <div
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
            style={{ background: `${SOA_BRAND}1a` }}
          >
            <Receipt className="h-4 w-4" style={{ color: SOA_BRAND }} />
          </div>
          <p className="text-xs text-slate-400">SOA Consolidation / Help</p>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">Help &amp; Training</h1>
        <p className="mt-1 text-sm text-slate-500">
          Collecting statements of account from vendors, country by country, and handing the
          consolidated file to Finance.
        </p>
      </div>

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">About SOA Consolidation</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Each quarter every country confirms its vendor balances against what the vendors
          themselves say is outstanding. The tool runs that exercise: a country champion scopes the
          vendors worth asking, writes to them, chases the ones who go quiet, and files what comes
          back, whether that is the spreadsheet template or an email saying there is nothing
          outstanding.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          What AP receives at the end is one workbook holding every invoice line every vendor
          returned, with a tab naming each vendor the request was sent to and whether they answered.
          Reconciling those balances against the ledger stays with Finance; this tool collects and
          consolidates what the vendors sent, and keeps the evidence trail behind the coverage
          figure.
        </p>

        {/* Named in order, because the commonest question from a new champion is not what a screen
            does but where in the quarter they currently are. */}
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {STAGES.map((s, i) => (
            <li key={s.label} className="flex gap-2.5">
              <span
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                style={{ background: SOA_BRAND }}
              >
                {i + 1}
              </span>
              <span className="text-[12.5px] leading-relaxed">
                <span className="font-semibold text-slate-900">{s.label}</span>
                <span className="text-slate-500"> &middot; {s.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-sm font-bold text-slate-900">SOA Consolidation, Full Guide</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            A walkthrough of the whole cycle, from scoping a country to handing the consolidated
            file to Finance.
          </p>
        </div>
        <div className="p-4">
          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
            <iframe
              src={SOA_TRAINING_VIDEO_EMBED_URL}
              frameBorder="0"
              scrolling="no"
              allowFullScreen
              title="SOA Consolidation Training Video"
              className="h-full w-full"
            />
          </div>
        </div>
      </div>
    </main>
  );
}
