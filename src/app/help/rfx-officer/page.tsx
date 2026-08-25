/*
 * Public help & training page for RFx Officer — no auth required.
 * Tab 1: Training video (SharePoint). Tab 2: the RFQ Flow walkthrough (training material).
 * If the inline video ever stops embedding, replace VIDEO_URL with the SharePoint
 * "Embed" URL (…/_layouts/15/embed.aspx?UniqueId=…) — same format TI-TE uses.
 */
'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  FileText, Upload, Users, Send, Inbox, BarChart3, Trophy, Database, Cloud, HardDrive,
  Map, BookOpen, Globe, History, ChevronRight, Sparkles, Play,
} from 'lucide-react';

const VIDEO_URL = 'https://nesrcorp-my.sharepoint.com/:v:/g/personal/mfarhan1_nesr_com/IQDRcTl5dTRpTIwfOCh4uUFCAUJ0EWXTUU_V7YUUqBI1ocY';
const GREEN = '#307c4c';

/* ── small building blocks ─────────────────────────────────────── */

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{children}</span>;
}

function AIBadge({ model }: { model: 'pro' | 'flash' }) {
  const cls = model === 'pro' ? 'bg-indigo-100 text-indigo-700' : 'bg-sky-100 text-sky-700';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>
      <Sparkles className="h-3 w-3" /> Gemini 2.5-{model === 'pro' ? 'Pro' : 'Flash'}
    </span>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

function SubBox({ title, badges, children }: { title: React.ReactNode; badges?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">{title}</p>
        {badges && <div className="flex gap-1 flex-wrap">{badges}</div>}
      </div>
      {children}
    </div>
  );
}

function Stage({ num, icon, title, badge, children }: { num: number; icon: React.ReactNode; title: string; badge?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <Card className="p-4">
        <div className="flex items-center gap-2.5 pb-3 mb-1 text-base font-semibold text-slate-900">
          <span className="h-7 w-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: GREEN }}>{num}</span>
          <span className="text-slate-400">{icon}</span>
          {title}
          {badge}
        </div>
        <div className="space-y-3">{children}</div>
      </Card>
      <div className="ml-3.5 h-4 border-l-2 border-dashed border-slate-200 last:hidden" />
    </>
  );
}

function Chevron() {
  return <ChevronRight className="h-4 w-4 shrink-0 mt-0.5 text-slate-300" />;
}

/* ── RFQ Flow walkthrough (training material) ──────────────────── */

function RFQFlow() {
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-slate-900">RFQ Flow</h2>
        <p className="text-sm text-slate-500 mt-1">
          End-to-end walkthrough of how a Request for Quotation moves through RFxOfficer — from creation to award — and where AI assists at each step.
        </p>
      </div>

      {/* Status lifecycle */}
      <Card className="p-4">
        <p className="text-xs text-slate-400 mb-3 font-medium uppercase tracking-wide">Status lifecycle</p>
        <div className="flex items-center flex-wrap gap-y-2 gap-x-1">
          {[
            ['draft', 'bg-slate-100 text-slate-700'],
            ['pending_review', 'bg-amber-100 text-amber-700'],
            ['approved', 'bg-blue-100 text-blue-700'],
            ['collecting', 'bg-cyan-100 text-cyan-700'],
            ['comparing', 'bg-purple-100 text-purple-700'],
            ['awarded', 'bg-green-100 text-green-700'],
            ['closed', 'bg-slate-100 text-slate-500'],
          ].map(([label, cls], i, arr) => (
            <div key={label} className="flex items-center gap-1">
              <span className={`text-xs font-mono px-2 py-0.5 rounded ${cls}`}>{label}</span>
              {i < arr.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Parallel exits: <Mono>cancelled</Mono> (buyer), <Mono>declined</Mono> / <Mono>expired</Mono> (per supplier). Manual path skips <Mono>pending_review</Mono>.
        </p>
      </Card>

      <div className="space-y-0">
        {/* 1 — RFQ Creation */}
        <Stage num={1} icon={<FileText className="h-4 w-4" />} title="RFQ Creation">
          <div className="grid md:grid-cols-3 gap-4">
            <SubBox title="Manual entry">
              <p className="text-sm text-slate-500">Buyer fills a form: title, country, plant, quote deadline, notes, and line items (description, quantity, unit, SAP part number). RFQ is created immediately in <Mono>draft</Mono> status.</p>
            </SubBox>
            <SubBox
              title={<><Upload className="h-3.5 w-3.5" />PR Upload</>}
              badges={<><AIBadge model="pro" /><AIBadge model="flash" /></>}
            >
              <p className="text-sm text-slate-500">Buyer uploads a SAP Purchase Requisition (PDF, Excel, CSV, image). A blank RFQ is created first; the file goes through two sequential AI steps:</p>
              <ol className="text-sm text-slate-500 list-decimal list-inside space-y-1 pl-1">
                <li><span className="font-medium text-slate-700">Line-item extraction</span> — Gemini 2.5-Pro pulls part numbers, descriptions, quantities, plant, delivery location. Stored in <Mono>aiExtractionRaw</Mono>.</li>
                <li><span className="font-medium text-slate-700">Spend classification</span> — Gemini 2.5-Flash maps each line to Category → Sub-Category → Family → Commodity + a UNSPSC code + confidence. Taxonomy read live from <Mono>sg_commodities</Mono>.</li>
              </ol>
              <p className="text-sm text-slate-500">Lands in <Mono>pending_review</Mono>. Buyer reviews, edits, approves → <Mono>approved</Mono>.</p>
            </SubBox>
            <SubBox title={<><FileText className="h-3.5 w-3.5" />Select a Released PR</>}>
              <p className="text-sm text-slate-500">Buyer searches the live <Mono>released_prs</Mono> table (grouped by PR number) and picks one or more lines — also reachable from the Released PRs list or a PR&apos;s detail page.</p>
              <p className="text-sm text-slate-500">Chosen line items are pre-filled (no AI extraction — the source is already structured). The RFQ stores <Mono>rfqOrigin: &quot;released_pr&quot;</Mono> plus source <Mono>prNumber</Mono>/<Mono>prDate</Mono>; one RFQ can draw from several PRs.</p>
            </SubBox>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="text-xs font-medium text-slate-400 mb-2">Line item fields</p>
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-500">
              {['lineNumber','sapPartNumber','mfrPartNumber','description','quantity','unit','plant','deliveryLocation','notes','spendCategory','spendSubCategory','spendFamily','commodity','unspscCode','aiClassificationConfidence'].map(f => <span key={f}>{f}</span>)}
            </div>
          </div>
        </Stage>

        {/* 2 — Supplier Selection */}
        <Stage num={2} icon={<Users className="h-4 w-4" />} title="Supplier Selection" badge={<AIBadge model="flash" />}>
          <p className="text-sm text-slate-500">Three methods for adding suppliers. Each creates an <Mono>RFQSupplier</Mono> with a unique <Mono>vendorToken</Mono> and initial status <Mono>pending</Mono>.</p>
          <div className="grid md:grid-cols-3 gap-3">
            <SubBox title={<><Sparkles className="h-3.5 w-3.5 text-sky-500" />AI Suggestions</>}>
              <ol className="text-[12px] text-slate-500 list-decimal list-inside space-y-1">
                <li>Match each line&apos;s classification against <Mono>sg_mappings</Mono> ⋈ <Mono>sg_commodities</Mono> ⋈ <Mono>supplier_avl</Mono> in the RFQ country</li>
                <li><span className="font-medium text-slate-700">Progressive relaxation</span>: tightest first (category → commodity), widening to country-only — only until ~50 candidates</li>
                <li>Tier (preferred / backup) is a scoring signal, not a filter</li>
                <li>Up to 50 candidates sent to Gemini 2.5-Flash for scoring</li>
              </ol>
              <p className="text-[12px] text-slate-500">Scores 0–100 (category + preferred + country + email). Picked supplier stored on <Mono>RFQSupplier.supplierCode</Mono> with <Mono>addedBy: &quot;ai&quot;</Mono>.</p>
            </SubBox>
            <SubBox title="Search AVL">
              <p className="text-[12px] text-slate-500">Buyer searches the remote SourceGuide AVL (<Mono>supplier_avl</Mono>) by name, code, or category. The vendor&apos;s <Mono>supplier_code</Mono> is stored on the <Mono>RFQSupplier</Mono>.</p>
            </SubBox>
            <SubBox title="Ad-hoc">
              <p className="text-[12px] text-slate-500">Buyer types a company name and email directly — a lightweight <Mono>RFQSupplier</Mono> is created with <Mono>adHocName</Mono> and <Mono>adHocEmail</Mono>.</p>
            </SubBox>
          </div>
        </Stage>

        {/* 3 — Dispatch */}
        <Stage num={3} icon={<Send className="h-4 w-4" />} title="Dispatch">
          <p className="text-sm text-slate-500">Buyer reviews the supplier list and clicks Dispatch. System validates: ≥1 supplier with an email, ≥1 line item, and both a quote deadline and delivery location set.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">What happens</p>
              <ul className="text-sm text-slate-500 space-y-1.5">
                {[
                  <>Email to each supplier with a vendor portal link: <Mono>/vendor/[token]</Mono></>,
                  <>Token expiry: 7 days after the quote deadline (30 days if none)</>,
                  <>RFQSupplier status: <Mono>pending → sent</Mono></>,
                  <>RFQ status: <Mono>→ collecting</Mono></>,
                  <><Mono>RFQ_DISPATCHED</Mono> audit event; delivery tracked in <Mono>EmailLog</Mono></>,
                ].map((t, i) => <li key={i} className="flex gap-2"><Chevron />{t}</li>)}
              </ul>
            </div>
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">RFQSupplier record</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono text-slate-500">
                {['supplierCode','adHocName','adHocEmail','vendorToken','tokenExpiresAt','status','addedBy','tokenUsedAt'].map(f => <span key={f}>{f}</span>)}
              </div>
              <p className="text-[12px] text-slate-500">Supplier statuses: <Mono>pending → sent → opened → quoted</Mono>. Also <Mono>declined</Mono>, <Mono>expired</Mono>.</p>
            </div>
          </div>
        </Stage>

        {/* 4 — Vendor Portal */}
        <Stage num={4} icon={<Inbox className="h-4 w-4" />} title="Vendor Portal — Quote Submission">
          <div className="grid md:grid-cols-2 gap-4">
            <SubBox title="Token link (email-OTP gated)">
              <p className="text-[12px] text-slate-500">Vendor clicks <Mono>/vendor/[token]</Mono>. A one-time passcode is emailed before access (token-bound cookie via <Mono>VendorAccessOtp</Mono>). First access stamps <Mono>tokenUsedAt</Mono> and moves status to <Mono>opened</Mono>.</p>
            </SubBox>
            <SubBox title="Authenticated portal">
              <p className="text-[12px] text-slate-500">Vendors with an account log in as the <Mono>vendor</Mono> role at <Mono>/vendor-portal/rfqs/[rfqSupplierId]</Mono> — account-based access, no token expiry.</p>
            </SubBox>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Quote form — per line item</p>
            <div className="grid md:grid-cols-2 gap-4">
              <ul className="text-sm text-slate-500 space-y-1.5">
                {[
                  'Unit price + currency (auto-converts to USD)',
                  'Lead time (days) + notes',
                  'Preferred Incoterms (EXW, FCA, DAP, DDP…)',
                  'Payment terms (Net 30/60/90, LC, COD…)',
                  'Validity period, warranty terms',
                  'Technical notes, "Cannot supply" toggle',
                  'Offer an alternative — alternate part #, manufacturer, description',
                  'Quote a different quantity — positive and less than requested',
                ].map((t, i) => <li key={i} className="flex gap-2"><Chevron />{t}</li>)}
              </ul>
              <div className="space-y-2">
                <div className="rounded-lg border border-amber-100 bg-amber-50 p-2.5 space-y-1">
                  <p className="text-xs font-medium text-amber-700">Competitive pricing indicator</p>
                  <p className="text-xs text-amber-600">A live badge shows rank among submitted quotes: <span className="font-mono">Top 2</span> (green), 3rd (amber), beyond (gray).</p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1">
                  <p className="text-xs font-medium text-slate-700">No historical price reference</p>
                  <p className="text-xs text-slate-600">Historical pricing is buyer-only — vendor-facing history endpoints are hard-locked (403). Vendors see no benchmark.</p>
                </div>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 text-sm text-slate-500 space-y-1">
            <p className="font-medium text-slate-700 text-xs">On submission</p>
            <p className="text-xs">Validates <Mono>collecting</Mono> status + deadline not passed → upserts <Mono>Quote</Mono> + <Mono>QuoteLineItem</Mono> → RFQSupplier <Mono>→ quoted</Mono> → buyer notification → <Mono>QUOTE_SUBMITTED</Mono> audit. Vendors can revise until deadline.</p>
          </div>
        </Stage>

        {/* 5 — Comparison */}
        <Stage num={5} icon={<BarChart3 className="h-4 w-4" />} title="Quote Comparison & AI Analysis" badge={<AIBadge model="pro" />}>
          <p className="text-sm text-slate-500">Buyer opens the compare page — a matrix of all quotes. Lowest USD price per line is green, highest red. Split awards supported. A quote for less than the requested quantity shows a <Mono>QTY x/y</Mono> badge — totals always use the RFQ&apos;s quantity.</p>
          <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-4 space-y-3">
            <p className="text-sm font-semibold text-indigo-800 flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-600" />AI Quote Analysis — Gemini 2.5-Pro</p>
            <p className="text-sm text-slate-500">Buyer clicks <span className="font-medium">&quot;AI Analyze&quot;</span>. The model receives the full RFQ + all quotes + historical spend (live from <Mono>historic_spend</Mono>) and returns:</p>
            <div className="grid md:grid-cols-2 gap-3 text-sm">
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Per line item</p>
                <ul className="text-xs text-slate-500 space-y-1">
                  <li><Mono>recommendedQuoteLineItemId</Mono> + reasoning</li>
                  <li><Mono>historicalPriceUsd</Mono> + <Mono>priceVariancePct</Mono></li>
                  <li>Score: Price 0–40 · Lead time 0–30 · Terms 0–30 · <span className="font-bold">Total 0–100</span></li>
                </ul>
              </div>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Flags &amp; overall</p>
                <div className="flex flex-wrap gap-1">
                  {['BELOW_MARKET','ABOVE_MARKET','LONG_LEAD_TIME','SHORT_VALIDITY','INCOMPLETE_QUOTE','ONLY_SUPPLIER','PREFERRED_VENDOR'].map(f => <span key={f} className="text-[11px] font-mono bg-white border border-slate-200 px-1.5 py-0.5 rounded">{f}</span>)}
                </div>
                <p className="text-xs text-slate-500 mt-1">Plus overall summary, risks, and split-award recommendation. Stored in <Mono>aiComparisonResult</Mono>.</p>
              </div>
            </div>
          </div>
        </Stage>

        {/* 6 — Negotiation */}
        <Stage num={6} icon={<BarChart3 className="h-4 w-4" />} title="Negotiation (optional)" badge={<AIBadge model="pro" />}>
          <p className="text-sm text-slate-500">Before awarding, the buyer can open negotiation rounds with a supplier. Each is a <Mono>NegotiationRound</Mono> tied to the <Mono>RFQSupplier</Mono>.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <ul className="text-sm text-slate-500 space-y-1.5">
              {[
                'Gemini 2.5-Pro drafts a negotiation message from the quote, baseline/target totals, and historical benchmarks',
                'Buyer edits and sends it; the supplier may revise their quote past the deadline while a round is open',
                'On response, the model evaluates the concession (achieved vs. target)',
              ].map((t, i) => <li key={i} className="flex gap-2"><Chevron />{t}</li>)}
            </ul>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-slate-500">Quote revision history</p>
              <p className="text-xs text-slate-500">Every revision is snapshotted to <Mono>QuoteRevision</Mono> so the full price trail (initial → negotiated) is preserved, even as the live <Mono>Quote</Mono> is overwritten.</p>
            </div>
          </div>
        </Stage>

        {/* 7 — Award */}
        <Stage num={7} icon={<Trophy className="h-4 w-4" />} title="Award">
          <p className="text-sm text-slate-500">Buyer selects which quote wins each line item and clicks <span className="font-medium">&quot;Award Selected&quot;</span>. Split awards supported.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <ul className="text-sm text-slate-500 space-y-1.5">
              {[
                <>All <Mono>isAwarded</Mono> flags reset, then selected <Mono>QuoteLineItem</Mono> marked awarded</>,
                <><Mono>Quote</Mono> records marked awarded if all their items were selected</>,
                <>RFQ status <Mono>→ awarded</Mono></>,
                <><Mono>RFQ_AWARDED</Mono> audit event logged</>,
              ].map((t, i) => <li key={i} className="flex gap-2"><Chevron />{t}</li>)}
            </ul>
            <div className="rounded-lg border border-green-100 bg-green-50 p-3 space-y-1.5">
              <p className="text-xs font-medium text-green-700">Local historical price recorded</p>
              <p className="text-xs text-green-600">Each awarded line inserts a local <Mono>HistoricalPrice</Mono> (<Mono>source: &quot;awarded_rfq&quot;</Mono>). Write-only today — all displays are powered live by the remote <Mono>historic_spend</Mono> table; kept for a future use case.</p>
            </div>
          </div>
        </Stage>
      </div>

      {/* Supporting data */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-semibold text-slate-900 flex items-center gap-2"><Database className="h-4 w-4 text-slate-400" />Supporting Data &amp; Where It Feeds In</p>
        <div className="flex flex-wrap gap-4 text-xs">
          <span className="inline-flex items-center gap-1.5 text-slate-500"><Cloud className="h-3.5 w-3.5 text-sky-600" /><span className="font-medium text-sky-700">Remote SourceGuide DB</span> — read-only reference data, maintained by SourceGuide.</span>
          <span className="inline-flex items-center gap-1.5 text-slate-500"><HardDrive className="h-3.5 w-3.5 text-emerald-600" /><span className="font-medium text-emerald-700">Local RFxOfficer DB</span> — transactional data this app owns.</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="text-left py-2 pr-4 font-medium w-44">Dataset</th>
                <th className="text-left py-2 pr-4 font-medium w-40">Source</th>
                <th className="text-left py-2 font-medium">Used in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {[
                [<Database className="h-3.5 w-3.5 text-slate-400" />, 'Suppliers (AVL)', 'remote', '/admin/approved-vendors', <>Supplier master (<Mono>supplier_avl</Mono>) — names, emails — for AI suggestions and display. Preferred/backup is derived from that supplier&apos;s <Mono>sg_mappings</Mono> tier per country.</>],
                [<Map className="h-3.5 w-3.5 text-slate-400" />, 'Mappings', 'remote', '/admin/source-guide', <>First-pass filter in AI supplier selection. <Mono>sg_mappings</Mono> narrows the pool to suppliers serving the (country + category), keyed by <Mono>supplier_code</Mono>.</>],
                [<BookOpen className="h-3.5 w-3.5 text-slate-400" />, 'Commodities / taxonomy', 'remote', '/admin/spend-taxonomy', <>Canonical hierarchy (<Mono>sg_commodities</Mono>) given to Gemini 2.5-Flash during PR classification.</>],
                [<Globe className="h-3.5 w-3.5 text-slate-400" />, 'Countries', 'remote', '/admin/countries', <>Country reference (<Mono>sg_countries</Mono> + champions + <Mono>sg_guide_meta</Mono>) — names, tones, champions. Powers country filters and code→name resolution.</>],
                [<History className="h-3.5 w-3.5 text-slate-400" />, 'Spend History', 'remote', '/admin/spend-history', <>Buyer-only historical PO spend from <Mono>historic_spend</Mono>. Matched by exact SAP part number, then fuzzy word-overlap, scoped to country. Never shown to vendors.</>],
                [<Trophy className="h-3.5 w-3.5 text-slate-400" />, 'Historical Prices (awards)', 'local', 'auto-created on award', <>Local <Mono>HistoricalPrice</Mono>, write-only today — populated on every award but not read yet. Reserved for a future use case.</>],
                [<FileText className="h-3.5 w-3.5 text-slate-400" />, 'Released PRs', 'remote', '/released-prs', <>Released SAP PRs from <Mono>released_prs</Mono>. Powers the &quot;Select a Released PR&quot; creation path and its own list/detail screens. Visibility scoped by buyer country.</>],
              ].map(([icon, name, src, browse, used], i) => (
                <tr key={i}>
                  <td className="py-3 pr-4 font-medium text-slate-700"><span className="inline-flex items-center gap-1.5">{icon}{name}</span></td>
                  <td className="py-3 pr-4 text-xs">
                    <span className={`inline-flex items-center gap-1 ${src === 'remote' ? 'text-sky-700' : 'text-emerald-700'}`}>
                      {src === 'remote' ? <Cloud className="h-3 w-3" /> : <HardDrive className="h-3 w-3" />}{src === 'remote' ? 'Remote' : 'Local'}
                    </span>
                    <br /><span className="text-slate-400 font-mono text-[11px]">{browse}</span>
                  </td>
                  <td className="py-3 text-slate-500 text-xs">{used}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* AI steps summary */}
      <Card className="p-4 space-y-3">
        <p className="text-base font-semibold text-slate-900 flex items-center gap-2"><Sparkles className="h-4 w-4 text-indigo-500" />AI Steps Summary</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
                <th className="text-left py-2 pr-4 font-medium">Step</th>
                <th className="text-left py-2 pr-4 font-medium">Model</th>
                <th className="text-left py-2 pr-4 font-medium">Trigger</th>
                <th className="text-left py-2 font-medium">Output</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs align-top">
              {[
                ['PR extraction', 'pro', 'PR file upload', 'Structured line items from an unstructured document — part numbers, descriptions, quantities, plant'],
                ['Spend classification', 'flash', 'After PR extraction', 'Taxonomy per line: Category → Sub-Category → Family → Commodity → UNSPSC + confidence'],
                ['Supplier matching', 'flash', '"Suggest from AI" button', 'Ranked supplier list (0–100) over a candidate pool built by progressive commodity relaxation (~50 max). Score = category + preferred + country + email'],
                ['Negotiation draft & eval', 'pro', 'Negotiation round', "Drafts a message from the quote + target totals; on the vendor's response, evaluates the concession vs. target"],
                ['Quote analysis', 'pro', '"AI Analyze" button', 'Per-line recommendations (price 40 + lead 30 + terms 30), price variance vs. historical, risk flags, overall award recommendation'],
              ].map(([step, model, trig, out], i) => (
                <tr key={i}>
                  <td className="py-3 pr-4 font-medium text-slate-700">{step}</td>
                  <td className="py-3 pr-4"><AIBadge model={model as 'pro' | 'flash'} /></td>
                  <td className="py-3 pr-4 text-slate-500">{trig}</td>
                  <td className="py-3 text-slate-500">{out}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ── Page ──────────────────────────────────────────────────────── */

export default function RFxOfficerHelpPage() {
  const [tab, setTab] = useState<'video' | 'docs'>('video');

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center gap-3 sticky top-0 z-30">
        <Image src="/nesr-logo-circle.png" alt="NESR" width={30} height={30} className="rounded-full" />
        <span className="font-semibold text-slate-900 text-sm tracking-tight">NESR Digital Supply Chain</span>
        <div className="flex-1" />
        <Link href="/home" className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Home
        </Link>
      </header>

      <main className="max-w-[960px] mx-auto px-6 pb-16 pt-6">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex h-6 w-6 items-center justify-center rounded-md shrink-0" style={{ background: GREEN }}>
              <span className="text-white font-extrabold text-[9px] tracking-tight">RFx</span>
            </div>
            <p className="text-xs text-slate-400">RFx Officer / Help</p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Help &amp; Training</h1>
          <p className="text-sm text-slate-500 mt-1">Watch the training video, then read the full RFQ flow walkthrough.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-0.5 border-b border-slate-200 mb-6">
          {([
            { key: 'video', label: 'Training Video' },
            { key: 'docs', label: 'RFQ Flow' },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2.5 text-[13.5px] font-medium transition-colors border-b-2 -mb-px"
              style={tab === key ? { color: GREEN, borderColor: GREEN } : { color: '#94a3b8', borderColor: 'transparent' }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'video' && (
          <Card className="shadow-sm overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Training Video</h2>
              <p className="text-xs text-slate-400 mt-0.5">A walkthrough of the RFx Officer RFQ lifecycle.</p>
            </div>
            <div className="p-5 space-y-3">
              <iframe
                src={VIDEO_URL}
                width="100%"
                height="520"
                frameBorder="0"
                scrolling="no"
                allowFullScreen
                title="RFx Officer Training Video"
                className="rounded-lg bg-slate-100"
              />
              <a
                href={VIDEO_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ background: GREEN }}
              >
                <Play className="w-4 h-4" /> Open video in SharePoint
              </a>
              <p className="text-xs text-slate-400">If the video doesn&apos;t play inline, use the button above to open it in SharePoint.</p>
            </div>
          </Card>
        )}

        {tab === 'docs' && <RFQFlow />}
      </main>
    </div>
  );
}
