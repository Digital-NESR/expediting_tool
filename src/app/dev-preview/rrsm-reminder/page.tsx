/*
 * The renewal reminder email, rendered, for development only.
 *
 * An email is the one part of this tool nobody can look at before it reaches somebody. Everything
 * else has a screen; this gets read once, in Outlook, by a person who will not tell us it looked
 * broken. So it gets a preview of its own, covering the three shapes the subject line branches
 * on — a single contract, a digest, and something already expired — plus the unused-for-a-year
 * case the table calls out.
 *
 * Dev-only twice over: notFound() in a production build, and /dev-preview is only in
 * PUBLIC_PATHS outside production.
 */
import { notFound } from 'next/navigation';
import { renewalReminderMail } from '@/lib/rrsm/notify';

export const dynamic = 'force-dynamic';

const day = 86_400_000;
const iso = (offset: number) => new Date(Date.now() + offset * day).toISOString().slice(0, 10);

type Item = Parameters<typeof renewalReminderMail>[0]['items'][number];

const CRANE: Item = {
  description: 'Crane 50T — long term hire',
  assetRef: 'CR-50-01',
  segment: 'CPVEN_CT',
  supplierName: 'SMG Heavy Equipment',
  countryName: 'Kuwait',
  dueOn: iso(27),
  daysLeft: 27,
  monthsUsed: 12,
};

const FORKLIFT: Item = {
  description: 'Forklift 3T, Ahmadi yard',
  assetRef: 'FL-3T-04',
  segment: 'CPVEN_CT',
  supplierName: 'Gulf Lifting Services',
  countryName: 'Kuwait',
  dueOn: iso(12),
  daysLeft: 12,
  monthsUsed: 0,
};

const VILLA: Item = {
  description: 'Staff accommodation — Fahaheel, 24 beds',
  assetRef: '',
  segment: 'FACIL_AC',
  supplierName: 'Al Rasheed Properties',
  countryName: 'Kuwait',
  dueOn: iso(63),
  daysLeft: 63,
  monthsUsed: 11,
};

const EXPIRED: Item = {
  description: 'Light vehicle fleet — 9 units',
  assetRef: 'LV-09',
  segment: 'CPVEN_LV',
  supplierName: 'Autolease Kuwait',
  countryName: 'Kuwait',
  dueOn: iso(-9),
  daysLeft: -9,
  monthsUsed: 12,
};

const CASES: { title: string; note: string; items: Item[] }[] = [
  {
    title: 'One contract',
    note: 'The common case. A single row still reads as a table so the figures line up.',
    items: [CRANE],
  },
  {
    title: 'A digest, soonest first',
    note: 'What a buyer holding a country actually receives. One email, not four.',
    items: [CRANE, FORKLIFT, VILLA, EXPIRED],
  },
  {
    title: 'Already expired',
    note: 'The subject must not say "due soon" about something that has gone.',
    items: [EXPIRED],
  },
  {
    title: 'Unused for twelve months',
    note: 'The one worth arguing about, so the table says it rather than leaving it to be noticed.',
    items: [FORKLIFT],
  },
];

export default function RrsmReminderPreview() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="bg-amber-50 px-5 py-2.5 text-[12.5px] text-amber-900">
        <b className="font-semibold uppercase tracking-widest">Development preview</b> · the
        renewal reminder email, as the mail workflow receives it.
      </div>
      <div className="mx-auto max-w-[760px] px-4 py-8">
        {CASES.map((c) => {
          const mail = renewalReminderMail({ to: ['buyer.kw@nesr.com'], items: c.items, url: '#' });
          return (
            <section key={c.title} className="mb-8">
              <h2 className="text-[15px] font-semibold text-slate-900">{c.title}</h2>
              <p className="mt-1 text-[13px] text-slate-500">{c.note}</p>
              <div className="mt-3 rounded-t-xl border border-slate-200 bg-white px-5 py-3">
                <div className="font-mono text-[10.5px] uppercase tracking-widest text-slate-400">
                  Subject
                </div>
                <div className="mt-1 text-[13.5px] font-semibold text-slate-800">
                  {mail.subject}
                </div>
              </div>
              <div
                className="rounded-b-xl border border-t-0 border-slate-200 bg-white px-5 py-4"
                dangerouslySetInnerHTML={{ __html: mail.bodyHtml }}
              />
            </section>
          );
        })}
      </div>
    </main>
  );
}
