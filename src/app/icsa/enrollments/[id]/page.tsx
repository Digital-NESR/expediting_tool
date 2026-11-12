import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { getIcsaActor } from '@/lib/icsa/access';
import { getCycle, getEnrollment, listAssessmentsForEnrollment } from '@/lib/icsa/queries';
import { sweepOverdue } from '@/lib/icsa/lifecycle';
import {
  AWAITING_RESPONDENT,
  daysLeft,
  fmtDate,
  progress,
  scoreAnswers,
  sectionsByKeys,
} from '@/lib/icsa/model';
import {
  BTN_QUIET,
  Banner,
  EnrollmentPill,
  Kpi,
  PageHeader,
  ThresholdBar,
  CARD,
} from '../../components/ui';
import {
  EnrollmentActions,
  NominatePanel,
  RespondentsTable,
  type RespondentRow,
} from './EnrollmentClient';
import { icsaSignInPath } from '@/lib/icsa/demo';

export default async function EnrollmentPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  const { id } = await params;
  await sweepOverdue();
  const enrollment = await getEnrollment(actor, Number(id) || 0);
  if (!enrollment) notFound();
  const [cycle, assessments] = await Promise.all([
    getCycle(enrollment.cycleId),
    listAssessmentsForEnrollment(enrollment.id),
  ]);
  if (!cycle) notFound();

  const p = progress(
    assessments.map((a) => a.status),
    cycle.thresholdPct,
  );
  const isOpen = enrollment.status === 'open';
  const rows: RespondentRow[] = assessments.map((a) => {
    const t = scoreAnswers(a.answers, sectionsByKeys(a.sections)).total;
    return {
      id: a.id,
      name: a.respondentName,
      email: a.respondentEmail,
      jobTitle: a.jobTitle,
      department: a.department,
      sections: a.sections,
      status: a.status,
      comp: t.comp,
      rate: t.rate,
      requestedAt: a.requestedAt,
      lastRemindedAt: a.lastRemindedAt,
      reminderCount: a.reminderCount,
      submittedAt: a.submittedAt,
    };
  });
  const nominated = rows.filter((r) => r.status === 'nominated').length;
  const outstanding = rows.filter((r) => AWAITING_RESPONDENT.includes(r.status)).length;
  const awaitingReview = rows.filter((r) => r.status === 'submitted').length;
  const left = daysLeft(enrollment.deadline);

  return (
    <>
      <div className="mb-4 text-sm">
        <Link className="text-[#307c4c] hover:underline" href={`/icsa/cycles/${cycle.id}`}>
          ← {cycle.label}
        </Link>
      </div>
      <PageHeader
        eyebrow={`${cycle.label} · champion ${enrollment.championName || enrollment.championEmail}`}
        title={
          <span className="flex items-center gap-3">
            {enrollment.country} <EnrollmentPill status={enrollment.status} />
          </span>
        }
        actions={
          <a
            className={BTN_QUIET}
            href={`/api/icsa/export?cycle=${cycle.id}&country=${encodeURIComponent(enrollment.country)}`}
          >
            <Download className="h-4 w-4" /> Consolidated Excel
          </a>
        }
      >
        Deadline {fmtDate(enrollment.deadline)}
        {enrollment.deadline !== cycle.deadline && ' (extended)'}
        {isOpen && (left >= 0 ? ` · ${left} day${left === 1 ? '' : 's'} left` : '')}
      </PageHeader>

      {!isOpen && (
        <div className="mb-4">
          <Banner tone={enrollment.status === 'force_closed' ? 'error' : 'info'}>
            {enrollment.status === 'force_closed' ? 'Force-closed' : 'Closed'}{' '}
            {fmtDate(enrollment.closedAt)}
            {enrollment.closedBy && enrollment.closedBy !== 'system'
              ? ` by ${enrollment.closedBy}`
              : ''}
            .{enrollment.closeNote ? ` ${enrollment.closeNote}` : ''}
          </Banner>
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Requests sent"
          value={p.requested}
          sub={nominated ? `${nominated} nominated, not sent` : undefined}
        />
        <Kpi label="Responded" value={p.responded} sub="Submitted or reviewed" />
        <Kpi label="Awaiting review" value={awaitingReview} />
        <div className={`${CARD} border-t-4 border-t-[#2a7e4f] p-4`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Response rate
          </p>
          <p className="mt-1 text-2xl font-bold text-[#2a7e4f]">{Math.round(p.rate * 100)}%</p>
          <div className="mt-2">
            <ThresholdBar rate={p.rate} thresholdPct={cycle.thresholdPct} />
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Threshold {cycle.thresholdPct}% ·{' '}
            {p.met ? 'met, you can close' : `${p.shortBy} more needed`}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <EnrollmentActions
          enrollmentId={enrollment.id}
          isOpen={isOpen}
          isAdmin={actor.isAdmin}
          progress={p}
          nominated={nominated}
          outstanding={outstanding}
          deadline={enrollment.deadline}
          pendingExtension={
            enrollment.pendingExtension
              ? {
                  requestedDeadline: enrollment.pendingExtension.requestedDeadline,
                  reason: enrollment.pendingExtension.reason,
                }
              : null
          }
        />
      </div>

      {isOpen && (
        <div className="mb-4">
          <NominatePanel
            enrollmentId={enrollment.id}
            country={enrollment.country}
            already={rows.map((r) => r.email)}
          />
        </div>
      )}

      <RespondentsTable enrollmentId={enrollment.id} rows={rows} isOpen={isOpen} />
    </>
  );
}
