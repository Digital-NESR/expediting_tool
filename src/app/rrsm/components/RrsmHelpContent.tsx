'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Help & Training.

   One component, rendered in two places: the public /help/rrsm
   page the ? on the home card opens (no sign-in, so a supplier
   or somebody without RRSM access can read it), and /rrsm/help
   inside the tool. Two copies of the same instructions drift.

   Organised as: getting started and the menus, then the two
   modules (rental equipment, recurrent services), then one tab
   per job. Screenshots are captured from the /dev-preview pages
   (fixture data) and live in /public/help/rrsm; SHOT below holds
   their sizes.
   ───────────────────────────────────────────────────────────── */

import { useState } from 'react';
import Image from 'next/image';
import {
  Building2,
  ClipboardCheck,
  Compass,
  Forklift,
  Mail,
  Repeat,
  Settings,
  ShoppingCart,
} from 'lucide-react';
import HelpTabBar from '@/app/help/HelpTabBar';

const BRAND = '#307c4c';

type TabKey = 'start' | 'rentals' | 'ops' | 'supplier' | 'buyer' | 'recurrent' | 'admin';

const TABS = [
  { key: 'start' as const, label: 'Getting started' },
  { key: 'rentals' as const, label: 'Rental equipment' },
  { key: 'supplier' as const, label: 'Supplier validation' },
  { key: 'ops' as const, label: 'Ops validation' },
  { key: 'buyer' as const, label: 'PR & PO' },
  { key: 'recurrent' as const, label: 'Recurrent services' },
  { key: 'admin' as const, label: 'Admin' },
];

/** Every screenshot and its size in pixels, so each renders at its own width and no blurrier. */
const SHOT = {
  'menu-rentals': [280, 660],
  'menu-recurrent': [280, 380],
  'request-access': [500, 572],
  dashboard: [1280, 810],
  'supplier-validation': [1120, 410],
  'supplier-code': [1020, 540],
  'supplier-lines': [1020, 940],
  'ops-validation': [1280, 900],
  'ops-validator-view': [1280, 400],
  'ops-return': [1280, 480],
  'returned-to-buyer': [1232, 240],
  'pr-po': [1280, 1000],
  'send-to-ops': [1280, 360],
  renewals: [1120, 440],
  registry: [1280, 600],
  history: [1280, 380],
  reports: [1280, 620],
  'recurrent-dashboard': [1280, 1000],
  'recurrent-list': [1280, 580],
  'recurrent-requester': [1280, 640],
  'admin-countries': [1140, 1000],
  'reminder-email': [760, 550],
} as const;

/* ─── small pieces ───────────────────────────────────────────────────────── */

function Lede({ icon, who, line }: { icon: React.ReactNode; who: string; line: string }) {
  return (
    <div className="mb-7 flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ background: '#e6f1ea', color: BRAND }}
      >
        {icon}
      </div>
      <div>
        <div className="text-[15px] font-semibold text-slate-900">{who}</div>
        <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{line}</p>
      </div>
    </div>
  );
}

function H({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h3 id={id} className="mb-2 mt-9 scroll-mt-24 text-[15px] font-semibold text-slate-900">
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="mb-3 text-[13.5px] leading-relaxed text-slate-600">{children}</p>;
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mb-4 space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-[13.5px] leading-relaxed text-slate-600">
          <span
            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
            style={{ background: BRAND }}
          >
            {i + 1}
          </span>
          <span className="min-w-0">{item}</span>
        </li>
      ))}
    </ol>
  );
}

/** A real screenshot of the screen being described, with the caption doing the pointing. */
function Shot({ name, alt, caption }: { name: keyof typeof SHOT; alt: string; caption: string }) {
  const [width, height] = SHOT[name];
  return (
    /* Capped at the shot's own width so a narrow one is not stretched soft, and allowed to
       shrink below it on a phone. */
    <figure className="my-5" style={{ maxWidth: width }}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <Image
          src={`/help/rrsm/${name}.jpg`}
          alt={alt}
          width={width}
          height={height}
          className="h-auto w-full"
          unoptimized
        />
      </div>
      <figcaption className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
        {caption}
      </figcaption>
    </figure>
  );
}

function Note({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  const warn = tone === 'warn';
  return (
    <div
      className={`my-4 rounded-lg border px-4 py-3 text-[13px] leading-relaxed ${
        warn
          ? 'border-amber-200 bg-amber-50 text-amber-900'
          : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
    >
      {children}
    </div>
  );
}

/** What this person cannot do, which is as much of the job as what they can. */
function Cannot({ items }: { items: string[] }) {
  return (
    <div className="my-5">
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        What you cannot do, on purpose
      </div>
      <ul className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        {items.map((t) => (
          <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
            <span className="text-slate-400">—</span>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A plain table, for the menu maps and the role summaries. */
function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="my-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[560px] text-[13px]">
        <thead>
          <tr className="bg-slate-50 text-left text-slate-500">
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="text-slate-600">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100 align-top">
              {r.map((c, j) => (
                <td
                  key={j}
                  className={`px-4 py-2.5 ${j === 0 ? 'font-medium text-slate-800' : ''}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The stages a monthly line moves through, as cards. */
function StageCards({ items }: { items: { label: string; who: string; detail: string }[] }) {
  return (
    <div className="my-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((s, i) => (
        <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
              style={{ background: s.label === 'Returned' ? '#dc2626' : BRAND }}
            >
              {i + 1}
            </span>
            <span className="text-[13.5px] font-semibold text-slate-900">{s.label}</span>
          </div>
          <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-widest text-slate-400">
            {s.who}
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-slate-600">{s.detail}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── tab 1 · getting started and the menus ──────────────────────────────── */

function StartTab({ go }: { go: (t: TabKey) => void }) {
  const link = (t: TabKey, label: string) => (
    <button type="button" onClick={() => go(t)} className="font-semibold text-[#1d4f31] underline">
      {label}
    </button>
  );
  return (
    <div>
      <Lede
        icon={<Compass className="h-5 w-5" />}
        who="RRSM in one paragraph"
        line="RRSM (Rental & Recurrent Services Management) is where NESR confirms, every month, what it rented and from whom, and where it decides, every year, whether to keep its annual contracts and subscriptions. It has two modules, and each country runs one or both."
      />

      <H>The two modules</H>
      <Table
        head={['Module', 'What it covers', 'Rhythm', 'Read']}
        rows={[
          [
            <span key="r" className="inline-flex items-center gap-1.5">
              <Forklift className="h-4 w-4 text-[#307c4c]" /> Rental equipment
            </span>,
            'Vehicles, cranes, generators, accommodation, security, manpower: anything on hire by the month.',
            'Monthly, 26th to 25th',
            link('rentals', 'Rental equipment'),
          ],
          [
            <span key="c" className="inline-flex items-center gap-1.5">
              <Repeat className="h-4 w-4 text-[#307c4c]" /> Recurrent services
            </span>,
            'Annual contracts, software subscriptions, AMCs, insurance: things renewed, not billed by the month.',
            'Yearly, by expiry date',
            link('recurrent', 'Recurrent services'),
          ],
        ]}
      />
      <P>
        Which module you see depends on the country you are looking at. For example, the UAE, Oman
        and Kuwait run rental equipment; HQ Dubai runs recurrent services only. The country picker
        at the top right switches between the countries you have access to.
      </P>

      <H>Who does what</H>
      <Table
        head={['Person', 'What they do', 'How they get access']}
        rows={[
          [
            'Buyer',
            'Opens the month, invites suppliers, sends lines to Ops, links PRs and POs, closes the month, keeps the Service Registry, handles renewals and recurrent services.',
            'Appointed per country by an RRSM admin, or asks for access (below).',
          ],
          [
            'Ops validator',
            'Confirms what was actually used on the lines a buyer sent them, then validates or returns each line.',
            'Nothing to request: a buyer sending them a line is what gives access, to those lines only.',
          ],
          [
            'Supplier',
            'Confirms their month (quantities, days, rate) and uploads the delivery note, timesheet and invoice.',
            'An emailed link plus a one-time code. No NESR account.',
          ],
          [
            'Requester',
            'Decides whether their recurrent services are renewed, changed or cancelled.',
            'Nothing to request: being named on a service by a buyer gives access to their own services.',
          ],
          [
            'RRSM admin',
            'Switches countries live, chooses their steps and modules, appoints buyers, approves access requests.',
            'Platform admins, plus the RRSM admin list.',
          ],
        ]}
      />

      <H>Getting in</H>
      <P>
        Open RRSM from the home page. If you have no access yet you are asked which country you buy
        for; an RRSM admin approves the request and you are emailed. Ops validators and requesters
        never need to ask: their access arrives with the first line or service they are named on.
      </P>
      <Shot
        name="request-access"
        alt="The request access screen"
        caption="What somebody without access sees. Pick the country, say why if it helps, and send. An RRSM admin decides in Admin → RRSM → Access requests, and you are emailed the answer."
      />

      <H id="menus">The menu, page by page</H>
      <P>
        The menu (the ☰ at the top left) shows only the pages that apply to you and to the country
        you are looking at. Pin it open with the pin icon.
      </P>
      <div className="my-5 flex flex-col gap-4 sm:flex-row">
        <div className="sm:w-1/2">
          <Shot
            name="menu-rentals"
            alt="The RRSM menu for a rentals country"
            caption="A rentals country, as a buyer or admin sees it."
          />
        </div>
        <div className="sm:w-1/2">
          <Shot
            name="menu-recurrent"
            alt="The RRSM menu for a recurrent-only country"
            caption="HQ Dubai: recurrent services only."
          />
        </div>
      </div>
      <Table
        head={['Menu', 'Item', 'What it is for', 'Who sees it']}
        rows={[
          [
            'Navigate',
            'Dashboard',
            'The month at a glance: value, stages, what needs doing, SAP.',
            'Buyers, admins',
          ],
          [
            'This month',
            'Supplier validation',
            'Invite suppliers, choose the documents they must upload, remind them, download what they sent.',
            'Buyers, admins (country runs supplier validation)',
          ],
          [
            'This month',
            'Ops validation',
            'Confirm what was used and validate or return each line.',
            'Ops validators (their lines only), admins',
          ],
          [
            'This month',
            'PR & PO',
            'Send lines to Ops, review supplier rate changes, link PRs, follow SAP, close the month.',
            'Buyers, admins',
          ],
          [
            'Records',
            'Renewals',
            'Rental contracts ending in the next 90 days, with a year of use beside each.',
            'Buyers, admins',
          ],
          [
            'Records',
            'Service Registry',
            'Every item on hire and its units, suppliers and rates. Shared with the Catalog.',
            'Buyers, admins',
          ],
          [
            'Records',
            'Cycle history',
            'Every month the country has run, its value and how far it got.',
            'Buyers, admins',
          ],
          [
            'Records',
            'Reports',
            'What the country is getting in a month, by supplier, by category or by cost center.',
            'Buyers, admins',
          ],
          [
            'Recurrent services',
            'Recurrent services',
            'Annual contracts and subscriptions, their expiry, requester decisions and POs.',
            'Buyers, admins, requesters (their own)',
          ],
          ['', 'Help & Training', 'This page.', 'Everyone'],
        ]}
      />
      <Note>
        An Ops validator sees only <b>Ops validation</b> and <b>Help</b>. A requester sees only{' '}
        <b>Recurrent services</b> (their own) and <b>Help</b>. That is deliberate: their access is
        to what they were sent or named on, not to the country.
      </Note>
    </div>
  );
}

/* ─── tab 2 · rental equipment: the month ────────────────────────────────── */

const RENTAL_STAGES = [
  {
    label: 'Awaiting supplier',
    who: 'Supplier',
    detail:
      'The month is open and the line is pre-filled from last month. The supplier confirms it.',
  },
  {
    label: 'Submitted',
    who: 'Buyer sends to Ops',
    detail: 'The supplier has confirmed. The buyer sends it to its Ops validator, who checks it.',
  },
  {
    label: 'Validated',
    who: 'Ops validator',
    detail: 'Ops confirmed what was actually used. The buyer can now put it on a PO.',
  },
  {
    label: 'Closed',
    who: 'Buyer',
    detail: 'On a PO and finished. Closed lines are what next month is compared against.',
  },
  {
    label: 'Returned',
    who: 'Ops or buyer, with a reason',
    detail: 'Something is wrong. It goes back, with the reason, to the person who must fix it.',
  },
];

function RentalsTab({ go }: { go: (t: TabKey) => void }) {
  const link = (t: TabKey, label: string) => (
    <button type="button" onClick={() => go(t)} className="font-semibold text-[#1d4f31] underline">
      {label}
    </button>
  );
  return (
    <div>
      <Lede
        icon={<Forklift className="h-5 w-5" />}
        who="Rental equipment: the monthly cycle"
        line="Everything on hire is listed once in the Service Registry. Each month RRSM copies what is on hire into that month, the supplier confirms it, Ops confirm what was actually used, and the buyer puts it on a PO."
      />

      <H>The month runs from the 26th to the 25th</H>
      <P>
        A month is named after the month it ends in. <b>November 2026</b> covers 26 October to 25
        November, the SAP posting period.
      </P>

      <H>A line moves through these stages</H>
      <P>
        One line is one unit on hire for that month: one vehicle, one guard post, one generator. A
        line is never edited backwards. When something is wrong it is <b>returned</b> with a reason,
        so the record keeps who said what.
      </P>
      <StageCards items={RENTAL_STAGES} />

      <H>The month, start to finish</H>
      <Steps
        items={[
          <>
            <b>Buyer opens the month</b> on PR &amp; PO. Every unit still on hire is copied in at
            today&apos;s registry rate, with last month&apos;s quantity and its usual Ops validator
            already filled in.
          </>,
          <>
            <b>Buyer invites the suppliers</b> on {link('supplier', 'Supplier validation')}, ticking
            which documents each must upload.
          </>,
          <>
            <b>Supplier confirms</b> through their link: quantities, days, and a new rate if it
            changed, plus the documents.
          </>,
          <>
            <b>Buyer sends the lines to Ops</b> on {link('buyer', 'PR & PO')}, picking the validator
            from the company directory. A changed rate is accepted or rejected first.
          </>,
          <>
            <b>Ops validator confirms and validates</b> on {link('ops', 'Ops validation')}, or
            returns a line to the buyer with the reason.
          </>,
          <>
            <b>Buyer links the PR</b>. The PO, its approval and the service entry then fill in from
            SAP. When a validated line has its PO, <b>Close all ready</b> finishes it.
          </>,
        ]}
      />

      <H>Not every country runs every step</H>
      <P>
        An RRSM admin chooses, per country, whether suppliers confirm their month and whether Ops
        validate it. A step that is off is simply skipped: with no supplier step, lines open ready
        for Ops; with no Ops step, the supplier&apos;s confirmation goes straight to PR &amp; PO;
        with neither, lines open ready for the PO. The page for a step that is off disappears from
        the menu. A supplier&apos;s changed rate always waits for a buyer, whatever the steps.
      </P>

      <H id="dashboard">Dashboard</H>
      <Shot
        name="dashboard"
        alt="The rentals dashboard"
        caption="The bar shows where every line of the month is. Each tile opens the page that clears it: suppliers not yet in, lines to validate, lines waiting on a PO, renewals due. Below, the month's POs as SAP has them."
      />

      <H id="registry">Service Registry</H>
      <P>
        The list every month is opened from, shared with the Catalog Manager: an item added in
        either tool appears in both. An <b>item</b> is one supplier, service and rate (for example
        &quot;Toyota Prado, Al Mulla, 250 KWD a month&quot;); its <b>units</b> are the actual
        vehicles or posts on hire, each with its plate, segment and cost center.
      </P>
      <Shot
        name="registry"
        alt="The Service Registry"
        caption="Items, Units and Suppliers are three views of the same register. + Unit puts another unit under an item; Edit item changes the item in both RRSM and the Catalog. 'To confirm' marks an item whose rate nobody has confirmed yet."
      />
      <Steps
        items={[
          <>
            <b>Add item</b> registers a new service with its supplier, category, unit of measure and
            rate; <b>Add supplier</b> adds a supplier with the contact emails invitations go to.
          </>,
          <>
            A <b>rate</b> changed on the item applies from the next month opened. A month already
            open keeps the rate it opened with.
          </>,
          <>
            <b>Off hire</b> a unit when it has gone for good: it stays on record and the next month
            leaves it out. For a single month it was not used, Ops untick On hire instead.
          </>,
          <>Every change is recorded with your name; each unit shows its history.</>,
        ]}
      />

      <H id="renewals">Renewals</H>
      <Shot
        name="renewals"
        alt="The renewals page"
        caption="Rental contracts ending in the next 90 days, soonest first, with how many of the last twelve months each was actually used. A unit unused all year is called out."
      />
      <Steps
        items={[
          <>
            <b>Extend 12 months</b>: the end date moves twelve months from the date it was due, not
            from today.
          </>,
          <>
            <b>Extend with scope change</b>: the same, and you change the unit in the registry.
          </>,
          <>
            <b>Do not extend</b>: recorded; somebody still off-hires the unit when the date comes.
          </>,
        ]}
      />
      <P>
        Buyers are emailed at 90, 60, 30, 14 and 7 days before an end date and on the day itself:
        one email listing everything of theirs, never one per contract.
      </P>
      <Shot
        name="reminder-email"
        alt="The renewal reminder email"
        caption="The renewal reminder. Soonest first, with twelve months of actual use beside each unit."
      />

      <H id="history">Cycle history</H>
      <Shot
        name="history"
        alt="Cycle history"
        caption="Every month the country has run: suppliers, lines, how many reached a PO, the value and how far it got."
      />

      <H id="reports">Reports</H>
      <Shot
        name="reports"
        alt="RRSM reports"
        caption="Pick a month (or what is on hire now), then group by supplier, category or cost center. Each group opens to its units; the bar shows its share of the month. Download CSV gives the same rows for Excel."
      />
    </div>
  );
}

/* ─── tab 3 · supplier validation ────────────────────────────────────────── */

function SupplierTab() {
  return (
    <div>
      <Lede
        icon={<Building2 className="h-5 w-5" />}
        who="Supplier validation"
        line="Once a month each supplier confirms what they had on hire with NESR, through a personal link. The buyer sends the links and chooses which documents each supplier must upload."
      />

      <H>For the buyer: invite, remind, collect</H>
      <Shot
        name="supplier-validation"
        alt="The Supplier validation page"
        caption="One row per supplier with lines this month: who has not been asked, who is waiting, who has submitted. DN, TS and INV are the Delivery Note, Timesheet and Invoice each supplier must upload."
      />
      <Steps
        items={[
          <>
            Tick the suppliers (<b>Select everyone not asked</b> does it in one click) and the
            documents each must upload, then <b>Send invitations</b>. Each supplier&apos;s ticks are
            remembered for next month.
          </>,
          <>
            A supplier with no email on file still gets a link: <b>Copy</b> it and send it yourself.
          </>,
          <>
            <b>Remind</b> chases a supplier who has not submitted. Reminders are only ever sent by a
            buyer; RRSM never chases on its own.
          </>,
          <>
            <b>Download all documents</b> gives every uploaded file as one ZIP, a folder per
            supplier.
          </>,
        ]}
      />

      <H>For the supplier: confirm your month</H>
      <P>
        You need no NESR account. The invitation email carries a link personal to your company and
        that month. Opening it shows the addresses NESR holds for you, partly hidden; pick one you
        can read and a six-digit code is sent to it.
      </P>
      <Shot
        name="supplier-code"
        alt="The supplier verification step"
        caption="You pick which of your own mailboxes gets the code. If none of them is yours, reply to the invitation and ask NESR to add your address."
      />
      <Note tone="warn">
        The code works once and only for a short time. After too many wrong attempts, request a new
        one. Nobody at NESR can read the code out to you.
      </Note>
      <Shot
        name="supplier-lines"
        alt="The supplier's monthly form"
        caption="The month arrives pre-filled from last month, so you are mostly confirming. Upload the requested documents at the top before submitting."
      />
      <Steps
        items={[
          <>
            <b>On hire, days and quantity</b>: what was actually used. Untick anything that came off
            hire during the month.
          </>,
          <>
            <b>Rate and unit</b>: if your rate or pricing unit changed, change it here. A changed
            rate is not accepted automatically: a buyer reviews it before the line goes any further.
          </>,
          <>
            <b>Documents</b>: upload each one NESR asked for (Delivery Note, Timesheet, Invoice).
            You cannot submit until they are all there.
          </>,
          <>
            <b>Submit to NESR</b> sends the month. NESR&apos;s buyer and operations team take it
            from there.
          </>,
        ]}
      />
      <Cannot
        items={[
          'A supplier sees only their own lines for that month, never another supplier.',
          'A supplier cannot reopen a submitted month; ask the buyer.',
        ]}
      />
    </div>
  );
}

/* ─── tab 4 · ops validation ─────────────────────────────────────────────── */

function OpsTab() {
  return (
    <div>
      <Lede
        icon={<ClipboardCheck className="h-5 w-5" />}
        who="Ops validation"
        line="You are the person who knows what was actually on site. A buyer sends you the lines you are responsible for; you confirm what was used and validate them, or return them with the reason. Nothing is paid that you have not validated."
      />

      <H>How lines reach you</H>
      <P>
        Nobody appoints Ops validators per country. On PR &amp; PO the buyer ticks lines, picks you
        from the company directory and sends them. You get <b>one email listing those lines</b>,
        with a link straight to them. That is also what gives you access: you see the lines sent to
        you and those suppliers&apos; documents, nothing else in RRSM. Each line remembers its
        validator, so next month the buyer can send it to you again in one click.
      </P>

      <H>What you see</H>
      <Shot
        name="ops-validator-view"
        alt="Ops validation as a validator sees it"
        caption="Only the lines sent to you, grouped by supplier, with the supplier's documents (Delivery Note, Timesheet, Invoice) beside the supplier's name to open."
      />

      <H>Confirm, then validate</H>
      <Shot
        name="ops-validation"
        alt="The Ops validation page"
        caption="Read 'vs last month' first: a big jump or a NEW line is where a month goes wrong. The rate is shown but is not yours to change."
      />
      <Steps
        items={[
          <>
            Check <b>On hire</b>, <b>Days</b> and <b>Qty</b> against what was on site and correct
            them if needed, then <b>Save</b>.
          </>,
          <>Open the supplier&apos;s delivery note or timesheet if you need to check against it.</>,
          <>
            <b>Validated</b> is your statement that this is what was used. The line moves to the
            buyer for the PO.
          </>,
          <>
            A line whose supplier changed the rate shows <i>waiting for buyer review</i>: you can
            validate it once the buyer has accepted or rejected the change.
          </>,
        ]}
      />

      <H id="return">If something is wrong: Return</H>
      <P>
        Click <b>Return</b> and say why. The reason is required, because it is the one thing the
        buyer needs to act.
      </P>
      <Shot
        name="ops-return"
        alt="Returning a line with a reason"
        caption="Return asks for the reason before it sends. 'Return to buyer' sends it."
      />
      <Steps
        items={[
          <>
            The line goes to <b>Returned</b> and leaves your list.
          </>,
          <>
            The country&apos;s buyers are <b>emailed the reason</b> (you are copied), and the reason
            shows on the line in PR &amp; PO.
          </>,
          <>
            The buyer sorts it out, with the supplier if needed (for example, the supplier corrects
            an invoice or the register is fixed), then <b>sends the line to Ops again</b>, to you or
            to somebody else.
          </>,
          <>
            It comes back to you as <b>Submitted</b>, with a fresh email, and you validate it as
            normal.
          </>,
        ]}
      />
      <Note>
        A buyer can also return a line to you, from Submitted or even after you validated it, with
        their reason. You are emailed; the line shows the reason, and you correct it, click{' '}
        <b>Submitted</b>, then <b>Validated</b> again.
      </Note>
      <Cannot
        items={[
          'You cannot change a rate. Rates come from the Service Registry.',
          'You cannot record a PR, PO or invoice, or close a line.',
          'You cannot see lines that were not sent to you, or any other RRSM page.',
          'You cannot take back a line you returned: the buyer sends it again.',
        ]}
      />
    </div>
  );
}

/* ─── tab 5 · PR & PO (buyer) ────────────────────────────────────────────── */

function BuyerTab() {
  return (
    <div>
      <Lede
        icon={<ShoppingCart className="h-5 w-5" />}
        who="PR & PO: the buyer's working page"
        line="Everything the buyer does during the month happens here: open the month, send lines to Ops, decide supplier rate changes, link each line to its PR, follow it through SAP, and close it."
      />

      <Shot
        name="pr-po"
        alt="The PR & PO page"
        caption="Top to bottom: sending to Ops, PR matching, live SAP status with filters, then the lines by supplier. Download all documents and Close all ready are in the banner."
      />

      <H id="send">Send lines to Ops</H>
      <Shot
        name="send-to-ops"
        alt="Sending lines to an Ops validator"
        caption="Tick lines, then pick the validator from the directory. If all the ticked lines already have the same validator, 'Send to [name]' does it in one click."
      />
      <Steps
        items={[
          <>
            <b>Send N to their usual validators</b>: every line not yet sent that already has a
            validator (from last month) goes to that person. Usually all you need.
          </>,
          <>
            For the rest, tick the lines (or <b>Tick all not sent</b>), click{' '}
            <b>Pick validator and send…</b>, and search the company directory.
          </>,
          <>
            Each validator gets one email listing their lines; you are copied. The line shows{' '}
            <i>Ops: [name] · sent [date]</i>, and the validator is remembered for next month.
          </>,
          <>
            To move a line to somebody else, tick it and send it again; the new person gets it and
            the old one no longer sees it.
          </>,
        ]}
      />

      <H id="returned">When Ops return a line</H>
      <Shot
        name="returned-to-buyer"
        alt="A line returned by Ops"
        caption="A returned line shows who returned it and why. You are also emailed. Sort it out, then tick it and send it to Ops again."
      />
      <P>
        Sending a returned line to Ops again puts it back to <b>Submitted</b> for the validator you
        pick, who gets a fresh email. If a validated line turns out to be wrong, use <b>Return</b>{' '}
        yourself: you must give the reason, it goes back to its validator, and they are emailed. You
        cannot overwrite what Ops validated.
      </P>

      <H>Supplier rate changes</H>
      <P>
        A supplier who changed a rate or pricing unit shows a yellow box on the line. <b>Accept</b>{' '}
        takes the new terms for this month; leave <i>Also update the service register</i> ticked to
        keep them for future months too. <b>Reject</b> keeps the agreed terms. Ops cannot validate
        the line until you decide.
      </P>

      <H>PR matching and SAP status</H>
      <P>
        RRSM reads SAP (through Materials DB) several times a day. Once SAP has a PO from that
        supplier, RRSM links each line to its PR on its own where it can:
      </P>
      <Table
        head={['Tile', 'Means', 'What to do']}
        rows={[
          ['Matched', 'The one PR from that supplier worth exactly the line.', 'Nothing.'],
          [
            'To check',
            'Linked, but not certain (within 1%, or the supplier’s only PR).',
            'Confirm it, or Change it. Confirm all does the lot once you have looked.',
          ],
          ['No PR found', 'Nothing in SAP to match yet.', 'Link PR by hand once it is raised.'],
          ['Linked by a buyer', 'Linked or confirmed by a person.', 'Nothing.'],
        ]}
      />
      <P>
        From the PR on, the <b>SAP status</b> column fills in by itself: PR released, converted to a
        PO, PO under release (and with whom), released, service entry posted. The filter chips
        narrow the page to one state, for example <i>PO under release</i>.
      </P>
      <Note tone="warn">
        RRSM does not create anything in SAP. Raise PRs and POs in SAP as usual; RRSM follows them.
      </Note>

      <H>GR number and closing</H>
      <Steps
        items={[
          <>
            <b>GR no.</b> shows the goods receipt / service entry document SAP posted against the
            line&apos;s PO. RRSM fills it in from SAP on its own and keeps it on the line; there is
            nothing to type.
          </>,
          <>
            <b>Close all ready</b> closes every validated line that has a PO, in one click.
          </>,
          <>
            <b>Download all documents</b> gives every supplier upload for the month as one ZIP.
          </>,
        ]}
      />
      <Cannot
        items={[
          'You cannot change quantity, days or on-hire. Return the line to Ops instead.',
          'You cannot validate a line, unless you send it to yourself as its validator.',
        ]}
      />
    </div>
  );
}

/* ─── tab 6 · recurrent services ─────────────────────────────────────────── */

function RecurrentTab() {
  return (
    <div>
      <Lede
        icon={<Repeat className="h-5 w-5" />}
        who="Recurrent services"
        line="Annual contracts, software subscriptions, AMCs and insurance. They are not billed monthly; what matters is the expiry date. Each service has requester-validators who decide whether it is renewed, and a buyer who records the renewal and its PO."
      />

      <H>The page</H>
      <Shot
        name="recurrent-list"
        alt="The Recurrent services page"
        caption="Needs attention is the working list: due within 90 days, expired, decided and waiting for the buyer, or a PO to update. The other chips and the department filter narrow it further."
      />
      <Table
        head={['Status', 'Means']}
        rows={[
          ['Active', 'Running, more than 90 days from expiry.'],
          ['Due for renewal', 'Expires within 90 days; the requester needs to decide.'],
          ['Expired', 'Past its expiry with no renewal recorded.'],
          ['Renewal decided · with buyer', 'The requester decided; the buyer records the renewal.'],
          ['Cancelled', 'The requester decided not to renew.'],
          ['No expiry date', 'Nobody has recorded when it ends yet.'],
        ]}
      />
      <P>
        <b>Old PO</b> and <b>No PO</b> mark a service whose last PO is out of date or missing: the
        buyer adds the current PO number.
      </P>

      <H>For the requester: decide</H>
      <Shot
        name="recurrent-requester"
        alt="Recurrent services as a requester sees them"
        caption="A requester sees only the services they are named on. Open one to decide."
      />
      <Steps
        items={[
          <>
            Open a service that is <b>Due for renewal</b> or <b>Expired</b>.
          </>,
          <>
            Choose <b>Renew as is</b>, <b>Renew with changes</b> (say what changes, for example
            fewer licences) or <b>Cancel</b>, add a note for the buyer if useful, and{' '}
            <b>Send decision to the buyer</b>.
          </>,
          <>The buyer is emailed. You can update your decision until the buyer acts on it.</>,
        ]}
      />

      <H>For the buyer: add, renew, keep it current</H>
      <Steps
        items={[
          <>
            <b>Add service</b>: service name, supplier, department, requester-validators (picked
            from the directory; anyone can be one), expiry, renewal period, value if known, last PO
            and the supplier&apos;s contacts.
          </>,
          <>
            When a requester decides to renew, record the <b>new PO</b> and the <b>new expiry</b>.
            The service runs to its new date and goes back to Active.
          </>,
          <>
            Attach the contract or quotation to the service; the PO history from SAP is shown on it.
          </>,
        ]}
      />

      <H>Reminders</H>
      <P>
        Requesters are emailed at <b>90, 60, 30, 14, 7 and 0 days</b> before expiry, once per
        morning, listing everything of theirs. Reminders are switched on per country by an RRSM
        admin; while they are off (as for HQ Dubai until its dates are corrected) the page says so
        and nobody is emailed.
      </P>

      <H>Recurrent dashboard</H>
      <Shot
        name="recurrent-dashboard"
        alt="The recurrent services dashboard"
        caption="Active, expired, due and with the buyer, each clickable; the annual value; what expires over the next 12 months; and the same counts by department and by requester-validator."
      />
      <Cannot
        items={[
          'A requester sees and decides only their own services.',
          'Only a buyer or admin adds, edits, renews or removes a service.',
        ]}
      />
    </div>
  );
}

/* ─── tab 7 · admin ──────────────────────────────────────────────────────── */

function AdminTab() {
  return (
    <div>
      <Lede
        icon={<Settings className="h-5 w-5" />}
        who="RRSM administration"
        line="Admin → RRSM has two pages: Countries & Team, and Access requests. Admins can also do everything a buyer can, in every country."
      />

      <H>Countries &amp; Team</H>
      <Shot
        name="admin-countries"
        alt="Admin · RRSM · Countries & Team"
        caption="Each country: live or not, which modules it runs, which validation steps, whether recurrent reminders are mailed, and its buyers."
      />
      <Steps
        items={[
          <>
            <b>Appoint somebody</b>: role (Buyer or Central admin), country, and the person from the
            directory. Somebody covering two countries gets two rows.
          </>,
          <>
            <b>Modules</b>: rental equipment, recurrent services, or both.
          </>,
          <>
            <b>Validation steps</b>: supplier validation and Ops validation, each on or off. When
            you switch a step off mid-month you are asked whether this month&apos;s lines move on
            too.
          </>,
          <>
            <b>Recurrent reminders</b>: off until the country&apos;s expiry dates are right, so
            nobody is emailed about stale dates.
          </>,
          <>
            <b>Switch the country live</b> once it has a buyer.
          </>,
        ]}
      />
      <Note>
        Ops validators and requesters are not appointed here. A buyer sending a line to somebody, or
        naming them on a recurrent service, is what gives them access, and only to that.
      </Note>

      <H>Access requests</H>
      <P>
        Somebody without access asks for buyer access to a country from RRSM itself. Approve or
        reject it here; they are emailed either way, and approving appoints them as a buyer.
      </P>

      <H>Emails RRSM sends</H>
      <div className="my-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="text-[13px] leading-relaxed text-slate-600">
          Supplier invitation, reminder and verification code · supplier submitted · lines sent to
          an Ops validator · line returned (to the buyers or the validator) · renewal reminders ·
          recurrent reminders and decisions · access decisions. The app writes each message and the
          n8n mail workflow sends it from the Digital SupplyChain mailbox.
        </div>
      </div>
    </div>
  );
}

/* ─── the page ───────────────────────────────────────────────────────────── */

export default function RrsmHelpContent() {
  const [tab, setTab] = useState<TabKey>('start');
  const go = (t: TabKey) => {
    setTab(t);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
          RRSM · Help &amp; Training
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
          Rental &amp; Recurrent Services Management. Start with <b>Getting started</b> for the
          modules and the menu; the other tabs cover each page and each person&apos;s job, with the
          screen they do it on.
        </p>
      </div>

      <HelpTabBar tabs={TABS} active={tab} onSelect={setTab} brand={BRAND} boldActiveTab />

      {tab === 'start' && <StartTab go={go} />}
      {tab === 'rentals' && <RentalsTab go={go} />}
      {tab === 'supplier' && <SupplierTab />}
      {tab === 'ops' && <OpsTab />}
      {tab === 'buyer' && <BuyerTab />}
      {tab === 'recurrent' && <RecurrentTab />}
      {tab === 'admin' && <AdminTab />}
    </div>
  );
}
