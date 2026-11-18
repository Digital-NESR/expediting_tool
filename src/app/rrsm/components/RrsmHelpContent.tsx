'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Help & Training.

   One component, rendered in two places: the public /help/rrsm
   page the ? on the tile opens, and /rrsm/help inside the tool.
   The same file for both, for the reason the ProcureGuard help
   carries: two copies of the same instructions drift, and the
   one people read is never the one somebody remembered to
   update.

   The first tab is the whole workflow. Everything after it is
   one person's job — what they do, in order, with the screen
   they do it on. Organised by WHO rather than by FEATURE on
   purpose: nobody arrives here wanting to read about the
   renewals module, they arrive wanting to know what they are
   supposed to do.

   Screenshots are real, captured from the live screens, and
   live in /public/help/rrsm.
   ───────────────────────────────────────────────────────────── */

import { useState } from 'react';
import Image from 'next/image';
import {
  Building2,
  CalendarClock,
  ClipboardCheck,
  Mail,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Workflow,
} from 'lucide-react';
import HelpTabBar from '@/app/help/HelpTabBar';

const BRAND = '#307c4c';

type TabKey = 'flow' | 'supplier' | 'ops' | 'buyer' | 'admin';

const TABS = [
  { key: 'flow' as const, label: 'How it works' },
  { key: 'supplier' as const, label: 'Supplier' },
  { key: 'ops' as const, label: 'Ops' },
  { key: 'buyer' as const, label: 'Buyer' },
  { key: 'admin' as const, label: 'Admin' },
];

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

function H({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 mt-8 text-[15px] font-semibold text-slate-900">{children}</h3>;
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
function Shot({
  src,
  alt,
  caption,
  width,
  height,
}: {
  src: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
}) {
  return (
    /* Capped at the shot's own width so a narrow screen is not stretched soft to fill the
       column, and still allowed to shrink below it on a phone. */
    <figure className="my-5" style={{ maxWidth: width }}>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <Image
          src={src}
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
        warn ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}
    >
      {children}
    </div>
  );
}

/** What this person cannot do, which is as much of the job as what they can. */
function Cannot({ items }: { items: string[] }) {
  return (
    <ul className="my-4 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      {items.map((t) => (
        <li key={t} className="flex gap-2 text-[13px] leading-relaxed text-slate-600">
          <span className="text-slate-400">—</span>
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

/* ─── tab 1 · the whole workflow ─────────────────────────────────────────── */

const STAGES: { label: string; who: string; detail: string }[] = [
  {
    label: 'Awaiting supplier',
    who: 'Supplier, or Ops',
    detail:
      'The line is open for the month and nobody has said what was used yet. It arrives pre-filled from last month.',
  },
  {
    label: 'Submitted',
    who: 'Supplier, or Ops',
    detail: 'Somebody has stated the quantity and days. It is now a claim, not yet a confirmed fact.',
  },
  {
    label: 'Validated',
    who: 'Ops',
    detail: 'Ops confirm the claim matches what was actually on site. This is the gate before any money moves.',
  },
  {
    label: 'Closed',
    who: 'Buyer',
    detail: 'A PO carries the line and the month is finished. Closed lines are the basis of next month’s comparison.',
  },
];

function FlowTab() {
  return (
    <div>
      <Lede
        icon={<Workflow className="h-5 w-5" />}
        who="RRSM in one paragraph"
        line="Everything NESR rents or buys on a standing arrangement — vehicles, cranes, accommodation, security, camp services — is confirmed once a month, validated by the people who used it, and put on a PO by the buyer who owns it. RRSM is where that month happens, and where the once-a-year question of whether to keep the contract gets answered."
      />

      <H>The month runs from the 26th to the 25th</H>
      <P>
        A cycle is named after the month it ends in. <b>November 2026</b> covers 26 October to 25
        November. That window is the SAP posting period, not an RRSM invention, which is why it does
        not start on the 1st.
      </P>

      <H>A line moves through four stages</H>
      <P>
        Every rented asset or recurrent service is one line. A line is never edited backwards:
        when something is wrong it is <b>returned</b> to whoever said it, so the record keeps who
        stated what.
      </P>
      <div className="my-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        {STAGES.map((s, i) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: BRAND }}
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
      <Note>
        <b>Returned</b> is the fifth stage and the one that matters when something is wrong. Ops can
        return a submitted line to the supplier; a buyer can return a validated line to Ops. Neither
        overwrites the other’s figures, because validation is somebody’s statement about what
        happened and quietly editing it loses who said it.
      </Note>

      <H>SAP status is tracked separately, on purpose</H>
      <P>
        A line’s <b>stage</b> is RRSM’s own workflow. Its <b>SAP status</b> — PR under approval,
        Approved, PO under approval, Pending GRN, GRN completed, Cancelled — mirrors what ERP says.
        They are two columns because they answer different questions, and collapsing them into one
        is how a line that is finished in RRSM gets mistaken for a line that has been received in
        SAP.
      </P>
      <Note tone="warn">
        RRSM does not write to SAP. PR and PO numbers are typed in by the buyer after they are
        raised in ERP. Nothing here creates a purchase order.
      </Note>

      <H>The order things happen in</H>
      <Steps
        items={[
          <>
            <b>Admin</b> switches the country on and appoints its buyers and Ops validators. Nothing
            below is possible until this is done.
          </>,
          <>
            <b>Ops</b> open the month’s cycle. Every active line on the register opens pre-filled
            from last month at the current agreed rate.
          </>,
          <>
            <b>Ops</b> send the suppliers their invitations — one personal link each.
          </>,
          <>
            <b>The supplier</b> opens the link, verifies with a code emailed to them, checks the
            pre-filled list, corrects what is wrong, and submits.
          </>,
          <>
            <b>Ops</b> validate each line against what was actually on site, returning anything that
            does not match.
          </>,
          <>
            <b>The buyer</b> raises the PR and PO in SAP, records the numbers and the invoice against
            each validated line, and closes the month.
          </>,
          <>
            Alongside all of that, <b>renewals</b> run on their own annual clock, and RRSM emails
            the people who have to decide.
          </>,
        ]}
      />

      <H>Renewals run on a timer, not on the cycle</H>
      <P>
        A contract ending is an annual question, not a monthly one. RRSM checks every morning and
        emails at <b>90, 60, 30, 14 and 7 days</b> before the end date, and again on the day itself.
        Each person gets one email listing everything of theirs, never one email per contract.
      </P>
      <Shot
        src="/help/rrsm/reminder-email.jpg"
        alt="The renewal reminder email"
        width={546}
        height={512}
        caption="What the reminder looks like. Soonest first, with twelve months of actual use beside each line — a contract that ran at zero all year is called out, because that is the one worth arguing about."
      />

      <H>Who does what, in one table</H>
      <div className="my-5 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[520px] text-[13px]">
          <thead>
            <tr className="bg-slate-50 text-left text-slate-500">
              <th className="px-4 py-2.5 font-semibold">Role</th>
              <th className="px-4 py-2.5 font-semibold">Owns</th>
              <th className="px-4 py-2.5 font-semibold">Cannot</th>
            </tr>
          </thead>
          <tbody className="text-slate-600">
            {[
              ['Supplier', 'Stating what was on hire', 'See anyone else’s data, or change a rate'],
              ['Ops', 'On hire, days, quantity, notes, validation', 'Raise a PO, or decide a renewal'],
              ['Buyer', 'PR, PO, SAP status, invoice, closing, renewals', 'Change what Ops validated'],
              ['Admin', 'Countries, people, going live', '—'],
            ].map(([a, b, c]) => (
              <tr key={a} className="border-t border-slate-100">
                <td className="px-4 py-2.5 font-medium text-slate-800">{a}</td>
                <td className="px-4 py-2.5">{b}</td>
                <td className="px-4 py-2.5">{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Note>
        <b>Ops and a buyer are equals, not a hierarchy.</b> Neither outranks the other and neither
        can do the other’s half. A buyer who disagrees with a validation returns the line; they
        cannot overwrite it.
      </Note>
    </div>
  );
}

/* ─── tab 2 · supplier ───────────────────────────────────────────────────── */

function SupplierTab() {
  return (
    <div>
      <Lede
        icon={<Building2 className="h-5 w-5" />}
        who="You supply NESR"
        line="Once a month NESR asks you to confirm what you had on hire with them. You have no NESR account and never need one: you get a personal link by email, and a code to prove the link reached the right person."
      />

      <H>1 · The invitation arrives</H>
      <P>
        An email from NESR titled <i>“confirm your [month] rentals and services”</i> carries a link
        that is personal to your company and that month. It also carries the date the month closes.
        Forwarding the link to a colleague is fine — the code step below is what actually controls
        access.
      </P>

      <H>2 · Prove the link reached you</H>
      <P>
        Opening the link shows the addresses NESR already holds for you, partly hidden. Pick the one
        you can read, and a six-digit code is sent to it.
      </P>
      <Shot
        src="/help/rrsm/supplier-code.jpg"
        alt="The supplier verification step"
        width={466}
        height={376}
        caption="The addresses are masked because the page is reachable by anyone holding the link. You are picking which of your own mailboxes to use, not typing a new one."
      />
      <Note tone="warn">
        The code lasts <b>two minutes</b> and can be used once. Five wrong attempts and you must
        request a new one. If no address shown is one you can open, reply to the invitation and ask
        NESR to add yours — nobody at NESR can read the code out to you.
      </Note>

      <H>3 · Check the month, don’t type it</H>
      <P>
        The list is already filled in from last month, so in most cases you are confirming rather
        than entering. Correct anything that is wrong, untick anything that came off hire during the
        month, and add a short note where the change needs explaining.
      </P>
      <Shot
        src="/help/rrsm/supplier-lines.jpg"
        alt="The supplier's monthly confirmation form"
        width={466}
        height={483}
        caption="Last month's figure sits beside each line so a change is visible. The note field is where 'off hire on 12 November' belongs — it is what stops the line being queried later."
      />
      <Steps
        items={[
          <>
            <b>On hire</b> — untick anything that was returned or ended during the month. Leave the
            days and quantity showing what was used up to that point.
          </>,
          <>
            <b>Days and quantity</b> — what was actually used, not what was contracted. A vehicle off
            the road for a fortnight is not a full month.
          </>,
          <>
            <b>Note</b> — optional, but the fastest way to stop a query. One line is enough.
          </>,
          <>
            <b>Save for later</b> keeps your work without sending it. <b>Submit to NESR</b> sends it
            and closes the link.
          </>,
        ]}
      />

      <H>4 · After you submit</H>
      <P>
        Your link closes and NESR’s operations team check the figures against what was on site. If
        something does not match, the line comes back to you with a reason and the link reopens for
        it. Rates are not shown to you and are not editable here — a rate change is a commercial
        conversation with your buyer, not a monthly correction.
      </P>

      <Cannot
        items={[
          'You cannot see any other supplier, or anything outside your own month.',
          'You cannot change a rate, a PO number or anything NESR records internally.',
          'You cannot reopen a submitted month yourself — ask NESR to return the line.',
        ]}
      />
    </div>
  );
}

/* ─── tab 3 · ops ────────────────────────────────────────────────────────── */

function OpsTab() {
  return (
    <div>
      <Lede
        icon={<ClipboardCheck className="h-5 w-5" />}
        who="You are Ops for a country"
        line="You are the person who knows what was actually on site. Your half of RRSM is the truth of the month: what was on hire, for how many days, in what quantity. Nothing gets paid for that you have not validated."
      />

      <H>1 · Open the month</H>
      <P>
        At the start of a cycle, open it. Every active line on the register appears pre-filled from
        last month at the rate currently on the register — not the rate that was used last month, so
        a renegotiated rate does not silently restate an approved past month.
      </P>

      <H>2 · Invite the suppliers</H>
      <P>
        <b>Supplier invitations</b> in the sidebar lists everyone with lines this month and shows
        where each one has got to.
      </P>
      <Shot
        src="/help/rrsm/invitations.jpg"
        alt="The invitations screen"
        width={694}
        height={213}
        caption="Not asked, waiting and submitted are three different states, and the screen keeps them apart — 'asked and ignoring us' is the only one worth chasing."
      />
      <Note>
        A supplier with no email address on file still gets a link: use <b>Copy link</b> and send it
        however you normally reach them. The link is created whether or not the email goes out,
        which is why the screen can tell you nobody has been asked rather than quietly showing
        nothing.
      </Note>

      <H>3 · Validate what came back</H>
      <P>
        <b>Ops validation</b> is your working screen. Each line shows the quantity and
        days claimed, the value that produces, and how it compares to last month.
      </P>
      <Shot
        src="/help/rrsm/board-ops.jpg"
        alt="The Ops validation page"
        width={800}
        height={500}
        caption="VS LAST MONTH is the column to read first. A jump of +170% or a line marked NEW is where a month goes wrong, and both are called out rather than left to be noticed."
      />
      <Steps
        items={[
          <>
            Check <b>on hire</b>, <b>days</b> and <b>quantity</b> against what was on site. You can
            edit all three — a supplier who overstated is corrected here, not argued with by email.
          </>,
          <>
            Read the <b>vs last month</b> column. A big move or a <b>NEW</b> line deserves a look
            before it is validated.
          </>,
          <>
            <b>Save</b> keeps your edits. <b>Validated</b> is your statement that this is what
            happened, and is the gate the buyer works from.
          </>,
          <>
            <b>Return</b> sends the line back to the supplier with a reason, rather than fixing it
            silently.
          </>,
        ]}
      />
      <Note tone="warn">
        A supplier who never replies must not be able to stall the month. You can fill in and submit
        a line yourself — most standing vehicle hire has nothing for a supplier to add anyway.
      </Note>

      <H>4 · Renewals — you read, you do not decide</H>
      <P>
        The <b>Renewals</b> page is visible to you and shows everything ending in the next 90 days,
        with twelve months of use beside it. You can read all of it and add a note. Committing NESR
        to another twelve months is a buyer’s decision, so the buttons are not yours.
      </P>

      <Cannot
        items={[
          'You cannot change a rate. Rates come from the register and a change there is a commercial decision.',
          'You cannot raise or record a PR, PO, SAP status or invoice.',
          'You cannot close a line, or decide a renewal.',
          'You only see your own country, unless you have been given more than one.',
        ]}
      />
    </div>
  );
}

/* ─── tab 4 · buyer ──────────────────────────────────────────────────────── */

function BuyerTab() {
  return (
    <div>
      <Lede
        icon={<ShoppingCart className="h-5 w-5" />}
        who="You are the buyer for a country"
        line="You turn a validated month into a purchase order, keep SAP and RRSM telling the same story, and answer the annual question of whether a contract is worth keeping."
      />

      <H>1 · Work from what Ops validated</H>
      <P>
        <b>PR &amp; PO</b> shows the same lines from your side. A line you cannot act
        on yet has not been validated.
      </P>
      <Shot
        src="/help/rrsm/board-buyer.jpg"
        alt="The buyer's PR & PO page"
        width={800}
        height={500}
        caption="Your columns are PR, PO, SAP status and invoice. The quantity and days are Ops' and are read-only here, which is deliberate."
      />
      <Steps
        items={[
          <>Raise the PR and PO in SAP as you normally would. RRSM does not do this for you.</>,
          <>
            Record the <b>PR</b> and <b>PO</b> numbers against the line, and set the <b>SAP status</b>{' '}
            to match ERP.
          </>,
          <>
            Enter the <b>invoice</b> value. RRSM flags it against the line’s own total, so a
            mismatch is caught before it is paid rather than at reconciliation.
          </>,
          <>
            <b>Close all ready</b> closes every validated line that carries a PO, in one action,
            once the month is done.
          </>,
        ]}
      />
      <Note tone="warn">
        If a validated line is wrong, <b>return</b> it. You cannot edit the quantity or days: those
        are Ops’ statement of what happened, and overwriting them would lose who said what.
      </Note>

      <H>2 · Decide the renewals</H>
      <P>
        The <b>Renewals</b> page lists everything ending within 90 days, soonest first, with twelve
        months of actual use beside each one. You are emailed about these; the screen is where the
        decision is recorded.
      </P>
      <Shot
        src="/help/rrsm/renewals.jpg"
        alt="The renewals view"
        width={694}
        height={264}
        caption="Months used counts months that carried a quantity, not months the line existed — so a line sitting idle all year reads as 'Unused for 12 months' rather than as a year of service."
      />
      <Steps
        items={[
          <>
            <b>Extend 12 months</b> — the end date moves twelve months from <i>the date it was
            due</i>, not from today, so a late decision does not walk the anniversary forward.
          </>,
          <>
            <b>Extend with scope change</b> — same twelve months; what changes is the line itself,
            which you edit on the register separately.
          </>,
          <>
            <b>Do not extend</b> — recorded, and the end date is left exactly where it was. Somebody
            still has to off-hire the line when the date arrives.
          </>,
        ]}
      />
      <Note>
        A decision is final and carries your name, the date and your note. The note is the one thing
        a reader will want next year, so it is worth the sentence.
      </Note>

      <H>3 · What the reminders will do</H>
      <P>
        You are emailed at 90, 60, 30, 14 and 7 days before an end date, and on the day itself. One
        email per morning covering everything of yours, never one per contract. Once a contract has
        expired undecided you are chased once more and then left alone — the list does not go away.
      </P>

      <H>4 · Keep the register up to date</H>
      <P>
        The <b>Service register</b> is the list every month is opened from, and keeping it right is
        yours. <b>Add line</b> registers a new asset or service; clicking a line opens it to edit.
        Suppliers are added from the same page, and need a contact email for the monthly invitation
        to be sent to them.
      </P>
      <Steps
        items={[
          <>
            A changed <b>rate</b> applies from the next month opened. A month already open keeps the
            rate it opened with, so an approved month is never restated.
          </>,
          <>
            A <b>contract end date</b> is what puts a line on the Renewals page, and the owner and
            requester on the line are the people reminded.
          </>,
          <>
            <b>Off hire</b> a line when the asset has gone for good; the line stays on record and the
            next month leaves it out. For a single month it was not used, Ops untick On hire
            instead.
          </>,
          <>
            A line can be deleted only while no month has carried it. Every change is recorded with
            your name, and each line shows its history.
          </>,
        ]}
      />

      <Cannot
        items={[
          'You cannot change quantity, days or on-hire. Return the line instead.',
          'You cannot validate a line — that is Ops’ half.',
          'You only see your own country, unless you have been given more than one.',
        ]}
      />
    </div>
  );
}

/* ─── tab 5 · admin ──────────────────────────────────────────────────────── */

function AdminTab() {
  return (
    <div>
      <Lede
        icon={<Settings className="h-5 w-5" />}
        who="You administer RRSM centrally"
        line="You decide which countries are live and who does what in each one. Until you act, nobody can use RRSM at all — which is the intended behaviour, not a fault."
      />

      <H>Everything starts dark</H>
      <P>
        All 19 countries start switched off. RRSM rolls out country by country, and switching one on
        is an act with a date and a person behind it, so it belongs here where it is recorded rather
        than in a deployment that runs itself.
      </P>
      <Shot
        src="/help/rrsm/admin-countries.jpg"
        alt="Admin · countries and team"
        width={796}
        height={500}
        caption="Admin → RRSM → Countries & Team. A country cannot be switched on with nobody assigned to it, because a live country with no buyer silently swallows every renewal reminder."
      />
      <Steps
        items={[
          <>
            <b>Appoint somebody</b> — pick a role, a country, and a person from the directory. One
            row is one person in one country; somebody covering two countries gets two rows.
          </>,
          <>
            Assign at least a <b>buyer</b> and an <b>Ops</b> validator. They are equals: neither can
            do the other’s half, so a country with only one of them is a country that cannot finish
            a month.
          </>,
          <>
            <b>Switch the country live.</b> Only then does the tile open for the people you have
            appointed.
          </>,
        ]}
      />
      <Note tone="warn">
        A live country with no buyer is the one configuration fault that silently disables renewals:
        there is nobody to email, so the reminders go nowhere and the screen looks fine. Assign the
        buyer first.
      </Note>

      <H>Roles, exactly</H>
      <div className="my-4 space-y-3">
        {[
          {
            icon: <ClipboardCheck className="h-4 w-4" />,
            name: 'Ops',
            text: 'Opens the cycle, invites suppliers, owns on-hire, days, quantity and notes, and validates. Reads renewals without deciding them.',
          },
          {
            icon: <ShoppingCart className="h-4 w-4" />,
            name: 'Buyer',
            text: 'Owns PR, PO, SAP status, invoice and closing. Decides renewals. Cannot change what Ops validated.',
          },
          {
            icon: <ShieldCheck className="h-4 w-4" />,
            name: 'Admin',
            text: 'Everything, in every country, plus the country and team settings on this screen.',
          },
        ].map((r) => (
          <div
            key={r.name}
            className="flex gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3"
          >
            <span className="mt-0.5 shrink-0" style={{ color: BRAND }}>
              {r.icon}
            </span>
            <div>
              <div className="text-[13.5px] font-semibold text-slate-900">{r.name}</div>
              <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">{r.text}</p>
            </div>
          </div>
        ))}
      </div>

      <H>What RRSM sends, and from where</H>
      <P>
        Every RRSM email is written by the application and sent by a workflow, so the wording lives
        in version control rather than inside an automation nobody reviews. Four messages exist: the
        supplier’s invitation, the supplier’s six-digit code, the notification that a supplier has
        submitted, and the renewal reminder.
      </P>
      <div className="my-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-[13px] leading-relaxed text-slate-600">
          If no email is arriving anywhere, the mail webhook is the first thing to check. RRSM
          treats an unsent message as a failure rather than reporting success, so a supplier who
          never received a code is told to try again instead of being left waiting.
        </p>
      </div>

      <div className="my-4 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
        <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p className="text-[13px] leading-relaxed text-slate-600">
          Renewal reminders run once every morning. Running the check twice in a day sends nothing
          the second time, so a failed run is safe to retry.
        </p>
      </div>
    </div>
  );
}

/* ─── the page ───────────────────────────────────────────────────────────── */

export default function RrsmHelpContent() {
  const [tab, setTab] = useState<TabKey>('flow');

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-semibold tracking-tight text-slate-900">
          RRSM · Help &amp; Training
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-600">
          Rental &amp; Recurrent Services Management. The first tab is how the whole thing works;
          the rest are one tab per person, covering what you do and the screen you do it on.
        </p>
      </div>

      <HelpTabBar tabs={TABS} active={tab} onSelect={setTab} brand={BRAND} boldActiveTab />

      {tab === 'flow' && <FlowTab />}
      {tab === 'supplier' && <SupplierTab />}
      {tab === 'ops' && <OpsTab />}
      {tab === 'buyer' && <BuyerTab />}
      {tab === 'admin' && <AdminTab />}
    </div>
  );
}
