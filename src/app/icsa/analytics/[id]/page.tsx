import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIcsaActor, isChampion } from '@/lib/icsa/access';
import { countrySnapshot } from '@/lib/icsa/analytics';
import { aiConfigured } from '@/lib/icsa/ai';
import { complianceBand, fmtDate, pct } from '@/lib/icsa/model';
import { icsaSignInPath } from '@/lib/icsa/demo';
import { CARD, EnrollmentPill, Kpi, PageHeader, RateChip } from '../../components/ui';
import { AiReviewCard, GapWorkspace } from './CountryClient';

export const dynamic = 'force-dynamic';

const BAND_BAR = {
  strong: 'bg-[#2a7e4f]',
  watch: 'bg-amber-400',
  gap: 'bg-red-500',
  none: 'bg-slate-200',
};

export default async function CountryAnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin && !isChampion(actor)) redirect('/icsa');
  const { id } = await params;
  const found = await countrySnapshot(actor, Number(id) || 0);
  if (!found) notFound();
  const { cycle, snap } = found;
  const e = snap.enrollment;
  const planned = snap.gaps.filter((g) => snap.plans.some((p) => p.questionRef === g.ref)).length;
  const stale = !!snap.review && snap.review.responsesCount !== snap.forms;

  return (
    <>
      <div className="mb-4 text-sm">
        <Link className="text-[#307c4c] hover:underline" href={`/icsa/analytics?cycle=${cycle.id}`}>
          ← Analytics
        </Link>
      </div>
      <PageHeader
        eyebrow={cycle.label}
        title={
          <span className="flex items-center gap-3">
            {e.country} <EnrollmentPill status={e.status} />
          </span>
        }
        actions={
          <Link
            className="text-sm font-semibold text-[#307c4c] hover:underline"
            href={`/icsa/enrollments/${e.id}`}
          >
            Respondents →
          </Link>
        }
      >
        Champion {e.championName || e.championEmail} · deadline {fmtDate(e.deadline)}. Figures count
        submitted and reviewed forms only.
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Forms submitted"
          value={`${snap.progress.responded} of ${snap.progress.requested}`}
          sub={`${Math.round(snap.completion * 100)}% of questions filled${snap.progress.met ? ', all in' : ''}`}
        />
        <Kpi label="Compliance" value={pct(snap.compliance)} sub="Yes ÷ (Yes + No + Partial)" />
        <Kpi label="Gaps" value={snap.gaps.length} sub="Questions answered No or Partial" />
        <Kpi
          label="Gaps with a plan"
          value={`${planned} of ${snap.gaps.length}`}
          sub={`${snap.plans.filter((p) => p.status === 'done').length} of ${snap.plans.length} actions done`}
        />
      </div>

      <div className={`${CARD} mb-6 p-5`}>
        <h2 className="font-bold text-slate-800">Compliance by section</h2>
        <div className="mt-3 space-y-2">
          {snap.perSection.map((p) => {
            const b = complianceBand(p.rate);
            return (
              <div
                key={p.key}
                className="grid grid-cols-[minmax(0,180px)_1fr_auto] items-center gap-3 text-sm"
              >
                <span className="truncate text-slate-600">
                  {p.id}. {p.short}
                </span>
                <div className="h-2.5 rounded-full bg-slate-100">
                  <div
                    className={`h-2.5 rounded-full ${BAND_BAR[b]}`}
                    style={{ width: p.rate === null ? 0 : `${Math.round(p.rate * 100)}%` }}
                  />
                </div>
                <RateChip rate={p.rate} />
              </div>
            );
          })}
        </div>
      </div>

      <AiReviewCard
        enrollmentId={e.id}
        review={snap.review}
        stale={stale}
        forms={snap.forms}
        gapCount={snap.gaps.length}
        aiReady={aiConfigured()}
      />

      <GapWorkspace
        enrollmentId={e.id}
        gaps={snap.gaps}
        plans={snap.plans}
        findings={snap.review?.review.gaps ?? []}
        aiReady={aiConfigured()}
      />
    </>
  );
}
