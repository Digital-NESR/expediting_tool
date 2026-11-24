/*
 * Public Help page for SafeSign. No sign-in needed, so it can be sent to a supplier as well as to
 * the NESR team.
 */
import type { Metadata } from 'next';
import { FileSignature } from 'lucide-react';

export const metadata: Metadata = { title: 'NESR | Help - SafeSign' };

const H2 = 'mt-8 text-base font-semibold text-slate-900';
const P = 'mt-2 text-sm leading-relaxed text-slate-600';
const LI = 'text-sm leading-relaxed text-slate-600';

export default function SafeSignHelpPage() {
  return (
    <main className="mx-auto max-w-[820px] px-6 pb-16 pt-6">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[#307c4c]/15 bg-white">
          <FileSignature className="h-3.5 w-3.5 text-[#307c4c]" />
        </div>
        <p className="text-xs text-slate-400">SafeSign / Help</p>
      </div>

      <h1 className="text-2xl font-bold tracking-tight text-slate-900">SafeSign</h1>
      <p className={P}>
        SafeSign sends QHSE letters, policies and requests to suppliers and tracks who has acknowledged, signed or
        responded, and when. Every response is recorded with the person&rsquo;s name, email address, time and IP address,
        so the record holds up in an audit.
      </p>

      <h2 className={H2}>For suppliers</h2>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5">
        <li className={LI}>Open the link in the email from NESR.</li>
        <li className={LI}>Choose the email address the message was sent to. We email a six-digit code to it.</li>
        <li className={LI}>Enter the code, then download and read the documents.</li>
        <li className={LI}>
          Respond as asked: tick and <b>Acknowledge</b>, <b>draw your signature</b>, <b>upload the signed letter</b>,
          upload the documents requested, or upload your <b>action plan</b>.
        </li>
      </ol>
      <p className={P}>
        If NESR asks for changes to an action plan, you get an email with their comments and can upload a new version
        through the same link. Reminders are emailed until the request is completed.
      </p>

      <h2 className={H2}>For the NESR team</h2>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li className={LI}>
          <b>Vendor library:</b> add suppliers with their category of work, the people who receive requests (TO) and
          those copied (CC). Paste a list straight from Excel.
        </li>
        <li className={LI}>
          <b>New communication:</b> pick a topic, attach the documents, choose what you need back (acknowledge, sign the
          letter, upload signed copy, submit documents, or action plan), set the deadline and reminders, and select
          suppliers one by one or a whole category at once. It saves as a draft; nothing is emailed until you press Send.
        </li>
        <li className={LI}>
          <b>Tracking:</b> each communication shows every supplier&rsquo;s status, who responded and when, their files,
          and a full history. Select suppliers and press Remind to chase them by hand.
        </li>
        <li className={LI}>
          <b>Reminders:</b> sent automatically each morning on the days before the deadline you chose, and then every few
          days once overdue.
        </li>
        <li className={LI}>
          <b>Action plans:</b> accept them, or request changes with a comment. Every version is kept.
        </li>
        <li className={LI}>
          <b>Dashboard:</b> one card per topic with its compliance figure (for example 10 / 15), a supplier-by-document
          grid per topic, and an Excel export with the status per supplier per document.
        </li>
      </ul>
    </main>
  );
}
