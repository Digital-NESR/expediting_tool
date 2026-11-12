import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getIcsaActor, isChampion } from '@/lib/icsa/access';
import { listMyAssessments } from '@/lib/icsa/queries';
import {
  EDITABLE_STATUSES,
  daysLeft,
  fmtDate,
  pct,
  scoreAnswers,
  sectionsByKeys,
} from '@/lib/icsa/model';
import { AssessmentPill, BTN, BTN_QUIET, CARD, Empty, PageHeader } from './components/ui';
import { icsaSignInPath } from '@/lib/icsa/demo';

export default async function IcsaHome() {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  const mine = await listMyAssessments(actor.email);
  const manager = actor.isAdmin || isChampion(actor);

  return (
    <>
      <PageHeader
        eyebrow="Supply Chain · aligned with SOX controls"
        title="My assessments"
        actions={
          manager ? (
            <>
              <Link href="/icsa/cycles" className={BTN_QUIET}>
                Cycles
              </Link>
              <Link href="/icsa/dashboard" className={BTN}>
                Review dashboard
              </Link>
            </>
          ) : undefined
        }
      >
        Each form below is yours alone. Answers save as you type, so you can leave and come back.
      </PageHeader>

      {!mine.length ? (
        <Empty title="No assessments have been sent to you.">
          {manager
            ? 'Open Cycles to run your country, or the review dashboard to follow progress.'
            : 'Your champion sends you the form when a cycle opens.'}
        </Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {mine.map((a) => {
            const sections = sectionsByKeys(a.sections);
            const t = scoreAnswers(a.answers, sections).total;
            const editable = EDITABLE_STATUSES.includes(a.status) && a.enrollmentStatus === 'open';
            const left = daysLeft(a.deadline);
            return (
              <div key={a.id} className={`${CARD} flex flex-col p-5`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#307c4c]">
                      {a.cycleLabel}
                    </p>
                    <h2 className="mt-0.5 text-lg font-bold text-slate-900">{a.country}</h2>
                  </div>
                  <AssessmentPill status={a.status} />
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {sections.map((s) => s.title).join(' · ')}
                </p>
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-xs text-slate-500">
                    <span>Completion</span>
                    <span>
                      {t.done} of {t.n} answered ({pct(t.comp)})
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-[#2a7e4f]"
                      style={{ width: `${Math.round(t.comp * 100)}%` }}
                    />
                  </div>
                </div>
                {a.status === 'returned' && a.reviewerNote && (
                  <p className="mt-3 rounded-lg bg-orange-50 px-3 py-2 text-sm text-orange-800">
                    <b>Returned:</b> {a.reviewerNote}
                  </p>
                )}
                <div className="mt-4 flex items-center justify-between gap-3 pt-1">
                  <p
                    className={`text-xs ${editable && left <= 3 ? 'font-semibold text-red-700' : 'text-slate-500'}`}
                  >
                    Due {fmtDate(a.deadline)}
                    {editable && (left >= 0 ? ` · ${left} day${left === 1 ? '' : 's'} left` : '')}
                  </p>
                  <Link href={`/icsa/assessments/${a.id}`} className={editable ? BTN : BTN_QUIET}>
                    {editable ? (a.status === 'requested' ? 'Start' : 'Continue') : 'View'}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
