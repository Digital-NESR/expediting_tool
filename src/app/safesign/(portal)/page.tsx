import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download, Plus } from 'lucide-react';
import { currentSafeSignActor } from '@/lib/safesign/access';
import { listCommunications, topicCards } from '@/lib/safesign/read';
import { formatDay, RESPONSE_TYPE_LABEL } from '@/lib/safesign/model';
import SafeSignShell, { BANNER_BUTTON, BANNER_BUTTON_GHOST, CARD, Empty } from '../components/SafeSignShell';

export default async function SafeSignDashboard() {
  const actor = await currentSafeSignActor();
  if (!actor?.role) redirect('/login');
  const [cards, comms] = await Promise.all([topicCards(), listCommunications()]);
  const recent = comms.slice(0, 8);
  const sentRequests = cards.reduce((s, c) => s + c.total, 0);
  const done = cards.reduce((s, c) => s + c.done, 0);
  const overdue = cards.reduce((s, c) => s + c.overdue, 0);
  const toReview = cards.reduce((s, c) => s + c.toReview, 0);

  return (
    <SafeSignShell
      user={{ name: actor.name, email: actor.email, role: actor.role }}
      title="Dashboard"
      subtitle="QHSE communications sent to suppliers, and who has acknowledged, signed or responded."
      actions={
        <>
          <a href="/api/safesign/export" className={BANNER_BUTTON_GHOST}>
            <Download className="h-4 w-4" /> Export to Excel
          </a>
          <Link href="/safesign/communications/new" className={BANNER_BUTTON}>
            <Plus className="h-4 w-4" /> New communication
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Compliance" value={sentRequests ? `${Math.round((done / sentRequests) * 100)}%` : '—'} hint={`${done} of ${sentRequests} responses complete`} />
        <Kpi label="Communications sent" value={String(comms.filter((c) => c.status !== 'draft').length)} hint={`${comms.filter((c) => c.status === 'draft').length} draft`} />
        <Kpi label="Overdue" value={String(overdue)} hint="past the deadline, no response" tone={overdue ? 'bad' : undefined} />
        <Kpi label="To review" value={String(toReview)} hint="action plans waiting for you" tone={toReview ? 'warn' : undefined} />
      </div>

      <section>
        <h2 className="mb-2 mt-2 text-sm font-semibold text-slate-700">By topic</h2>
        {cards.length === 0 ? (
          <Empty title="No topics yet" body="Add topics in Topics & users to group your communications." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map((t) => (
              <Link
                key={t.id}
                href={`/safesign/topics/${t.id}`}
                className={`${CARD} group p-4 transition-colors hover:border-[#307c4c]/40`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-[#1d4f31]">{t.name}</p>
                    <p className="truncate text-xs text-slate-500">{t.description || ' '}</p>
                  </div>
                  <span className="shrink-0 text-xs text-slate-400">{t.communications} sent</span>
                </div>
                <p className="mt-3 text-2xl font-bold text-slate-800">
                  {t.total ? `${t.done} / ${t.total}` : '—'}
                  <span className="ml-1.5 text-xs font-medium text-slate-500">{t.total ? 'complete' : 'nothing sent yet'}</span>
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-[#307c4c]" style={{ width: `${t.pct}%` }} />
                </div>
                <div className="mt-2 flex gap-3 text-[11px] font-medium">
                  {t.overdue > 0 && <span className="text-rose-600">{t.overdue} overdue</span>}
                  {t.toReview > 0 && <span className="text-sky-700">{t.toReview} to review</span>}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className={CARD}>
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Latest communications</h2>
          <Link href="/safesign/communications" className="text-xs font-semibold text-[#307c4c] hover:underline">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/safesign/communications/${c.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-slate-50">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">{c.title}</span>
                  <span className="text-xs text-slate-500">{c.topicName}</span>
                  <span className="text-xs text-slate-500">{RESPONSE_TYPE_LABEL[c.responseType]}</span>
                  <span className="text-xs text-slate-500">Due {formatDay(c.deadline)}</span>
                  <span className="w-24 text-right text-xs font-semibold text-slate-700">
                    {c.status === 'draft' ? 'Draft' : `${c.done} / ${c.total}`}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </SafeSignShell>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint: string; tone?: 'bad' | 'warn' }) {
  const color = tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-sky-700' : 'text-slate-800';
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{hint}</p>
    </div>
  );
}
