import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { getIcsaActor, isChampion } from '@/lib/icsa/access';
import { countrySnapshots, type CountrySnapshot } from '@/lib/icsa/analytics';
import { listCycles, listEnrollments } from '@/lib/icsa/queries';
import { complianceBand, pct } from '@/lib/icsa/model';
import { icsaSignInPath } from '@/lib/icsa/demo';
import { CARD, Empty, EnrollmentPill, Kpi, PageHeader, ResponseBar } from '../components/ui';
import CyclePicker from './CyclePicker';
import { RatingChip } from './RatingChip';

export const dynamic = 'force-dynamic';

const BAND_TEXT = {
  strong: 'text-[#2a7e4f]',
  watch: 'text-amber-600',
  gap: 'text-red-600',
  none: 'text-slate-400',
};
const BAND_BAR = {
  strong: 'bg-[#2a7e4f]',
  watch: 'bg-amber-400',
  gap: 'bg-red-500',
  none: 'bg-slate-200',
};

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ cycle?: string }>;
}) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin && !isChampion(actor)) redirect('/icsa');
  const sp = await searchParams;

  /* Only cycles with a country this person can see. */
  const [cycles, mine] = await Promise.all([listCycles(), listEnrollments(actor)]);
  const withCountries = cycles.filter((c) => mine.some((e) => e.cycleId === c.id));
  const fallback = withCountries.find((c) => c.status === 'open') ?? withCountries[0];
  const cycle = withCountries.find((c) => c.id === Number(sp.cycle)) ?? fallback;

  const header = (
    <PageHeader
      eyebrow={actor.isAdmin ? 'All countries' : `Champion · ${actor.championCountries.join(', ')}`}
      title="Analytics"
      actions={
        withCountries.length > 1 && cycle ? (
          <CyclePicker
            cycles={withCountries.map((c) => ({ id: c.id, label: c.label }))}
            value={cycle.id}
          />
        ) : undefined
      }
    >
      Compliance and gaps for {actor.isAdmin ? 'every country' : 'your country'} in a cycle. Open a
      country for the AI review of its gaps and to plan the actions that close them.
    </PageHeader>
  );

  if (!cycle) {
    return (
      <>
        {header}
        <Empty title="Nothing to analyse yet.">
          {actor.isAdmin
            ? 'Assign countries to a cycle first.'
            : 'Your country has not been assigned to a cycle yet.'}
        </Empty>
      </>
    );
  }

  const snaps = await countrySnapshots(actor, cycle.id);
  const rates = snaps.map((s) => s.compliance).filter((r): r is number => r !== null);
  const avg = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;
  const gapCount = snaps.reduce((n, s) => n + s.gaps.length, 0);
  const planned = snaps.reduce(
    (n, s) => n + s.gaps.filter((g) => s.plans.some((p) => p.questionRef === g.ref)).length,
    0,
  );
  const forms = snaps.reduce((n, s) => n + s.forms, 0);
  const asked = snaps.reduce((n, s) => n + s.progress.requested, 0);

  return (
    <>
      {header}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Countries" value={snaps.length} sub={cycle.label} />
        <Kpi label="Forms submitted" value={`${forms} of ${asked}`} />
        <Kpi label="Average compliance" value={pct(avg)} sub="Across countries with answers" />
        <Kpi
          label="Gaps with an action plan"
          value={`${planned} of ${gapCount}`}
          sub="Questions answered No or Partial"
        />
      </div>

      {snaps.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {snaps.map((s) => (
            <CountryCard key={s.enrollment.id} s={s} />
          ))}
        </div>
      ) : (
        <Empty title="No country in this cycle." />
      )}
    </>
  );
}

function CountryCard({ s }: { s: CountrySnapshot }) {
  const band = complianceBand(s.compliance);
  const planned = s.gaps.filter((g) => s.plans.some((p) => p.questionRef === g.ref)).length;
  const high = s.review?.review.gaps.filter((g) => g.severity === 'high').length ?? 0;
  const done = s.plans.filter((p) => p.status === 'done').length;
  return (
    <Link
      href={`/icsa/analytics/${s.enrollment.id}`}
      className={`${CARD} group flex flex-col p-5 transition hover:border-[#307c4c]/40 hover:shadow-md`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-900">{s.enrollment.country}</h2>
          <p className="truncate text-xs text-slate-500">
            {s.enrollment.championName || s.enrollment.championEmail}
          </p>
        </div>
        <EnrollmentPill status={s.enrollment.status} />
      </div>

      <div className="mt-4 flex items-end gap-4">
        <div>
          <p className={`text-3xl font-bold ${BAND_TEXT[band]}`}>{pct(s.compliance)}</p>
          <p className="text-xs text-slate-500">Compliance</p>
        </div>
        <div className="flex-1">
          <ResponseBar
            rate={s.completion}
            label={
              <>
                <span>
                  {s.progress.responded} of {s.progress.requested} submitted
                </span>
                <span>{Math.round(s.completion * 100)}% filled</span>
              </>
            }
          />
        </div>
      </div>

      <div className="mt-4 flex h-10 items-end gap-1" aria-label="Compliance by section">
        {s.perSection.map((p) => {
          const b = complianceBand(p.rate);
          return (
            <div
              key={p.key}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${p.id}. ${p.short}: ${pct(p.rate)}`}
            >
              <div className="flex h-7 w-full items-end rounded bg-slate-50">
                <div
                  className={`w-full rounded ${BAND_BAR[b]}`}
                  style={{ height: p.rate === null ? '3px' : `${Math.max(8, p.rate * 100)}%` }}
                />
              </div>
              <span className="text-[0.625rem] leading-none text-slate-400">{p.id}</span>
            </div>
          );
        })}
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3 text-center">
        <div>
          <dt className="text-[0.6875rem] text-slate-500">Gaps</dt>
          <dd className={`font-bold ${s.gaps.length ? 'text-red-600' : 'text-slate-700'}`}>
            {s.gaps.length}
          </dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-slate-500">Planned</dt>
          <dd className="font-bold text-slate-700">
            {planned}/{s.gaps.length}
          </dd>
        </div>
        <div>
          <dt className="text-[0.6875rem] text-slate-500">Actions done</dt>
          <dd className="font-bold text-slate-700">
            {done}/{s.plans.length}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
        {s.review ? (
          <span className="flex items-center gap-1.5 text-slate-600">
            <Sparkles className="h-3.5 w-3.5 text-violet-500" /> AI review
            <RatingChip rating={s.review.review.rating} />
            {high > 0 && <span className="text-red-600">{high} high</span>}
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-slate-400">
            <Sparkles className="h-3.5 w-3.5" />
            {s.forms ? 'Not reviewed by AI yet' : 'No forms submitted yet'}
          </span>
        )}
        <span className="flex items-center gap-1 font-semibold text-[#307c4c] group-hover:underline">
          Open <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
}
