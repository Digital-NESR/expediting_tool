import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getIcsaActor, isChampion } from '@/lib/icsa/access';
import { getCycle, listChampions, listEnrollments } from '@/lib/icsa/queries';
import {
  FREQUENCY_LABEL,
  ICSA_COUNTRIES,
  daysLeft,
  fmtDate,
  isPastDeadline,
  progress,
} from '@/lib/icsa/model';
import {
  BTN_QUIET,
  CARD,
  CyclePill,
  Empty,
  EnrollmentPill,
  Kpi,
  PageHeader,
  TD,
  TH,
  ThresholdBar,
} from '../../components/ui';
import { AssignCountries, CycleAdminActions, type AssignableCountry } from '../CycleForms';
import { icsaSignInPath } from '@/lib/icsa/demo';

export default async function CyclePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin && !isChampion(actor)) redirect('/icsa');
  const { id } = await params;
  const cycle = await getCycle(Number(id) || 0);
  if (!cycle) notFound();
  const enrollments = await listEnrollments(actor, cycle.id);
  /* A champion only reaches a cycle their country has been assigned to. */
  if (!actor.isAdmin && !enrollments.length) redirect('/icsa/cycles');

  const enrolled = new Set(enrollments.map((e) => e.country));
  const canAssign = actor.isAdmin && cycle.status === 'open' && !isPastDeadline(cycle.deadline);
  let assignable: AssignableCountry[] = [];
  if (canAssign) {
    const champions = await listChampions();
    assignable = ICSA_COUNTRIES.filter((c) => !enrolled.has(c)).map((country) => ({
      country,
      champions: champions
        .filter((ch) => ch.country === country)
        .map((ch) => ({ email: ch.email, name: ch.name })),
    }));
  }
  const overall = progress(
    enrollments.flatMap((e) => e.statuses),
    cycle.thresholdPct,
  );
  const left = daysLeft(cycle.deadline);

  return (
    <>
      <div className="mb-4 text-sm">
        <Link className="text-[#307c4c] hover:underline" href="/icsa/cycles">
          ← Cycles
        </Link>
      </div>
      <PageHeader
        eyebrow={`${FREQUENCY_LABEL[cycle.frequency]} cycle`}
        title={
          <span className="flex items-center gap-3">
            {cycle.label} <CyclePill status={cycle.status} />
          </span>
        }
        actions={
          <>
            <a className={BTN_QUIET} href={`/icsa/dashboard?cycle=${cycle.id}`}>
              Dashboard
            </a>
            {actor.isAdmin && cycle.status === 'open' && (
              <CycleAdminActions
                cycleId={cycle.id}
                deadline={cycle.deadline}
                thresholdPct={cycle.thresholdPct}
              />
            )}
          </>
        }
      >
        Period {fmtDate(cycle.periodStart)} – {fmtDate(cycle.periodEnd)} · deadline{' '}
        {fmtDate(cycle.deadline)}
        {cycle.status === 'open' &&
          (left >= 0 ? ` (${left} day${left === 1 ? '' : 's'} left)` : ' (passed)')}
        {cycle.status === 'closed' && cycle.closeReason ? ` · closed: ${cycle.closeReason}` : ''}
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Countries assigned" value={enrollments.length} />
        <Kpi label="Requests sent" value={overall.requested} />
        <Kpi label="Responses" value={overall.responded} sub="Submitted or reviewed" />
        <Kpi
          label="Response rate"
          value={`${Math.round(overall.rate * 100)}%`}
          sub={`Threshold ${cycle.thresholdPct}%`}
        />
      </div>

      {canAssign && <AssignCountries cycleId={cycle.id} countries={assignable} />}

      {!enrollments.length ? (
        <Empty title="No country is in this cycle yet.">
          {actor.isAdmin ? 'Assign countries above; their champions are emailed.' : null}
        </Empty>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {['Country', 'Champion', 'Deadline', 'Responses vs threshold', 'Status', ''].map(
                  (h) => (
                    <th key={h} className={TH}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {enrollments.map((e) => {
                const p = progress(e.statuses, cycle.thresholdPct);
                const nominated = e.statuses.filter((s) => s === 'nominated').length;
                return (
                  <tr key={e.id} className="hover:bg-[#307c4c]/5">
                    <td className={`${TD} font-semibold`}>{e.country}</td>
                    <td className={TD}>{e.championName || e.championEmail}</td>
                    <td className={TD}>
                      {fmtDate(e.deadline)}
                      {e.deadline !== cycle.deadline && (
                        <span className="ml-1 text-xs text-amber-700">(extended)</span>
                      )}
                      {e.pendingExtension && (
                        <p className="text-xs text-amber-700">
                          Extension to {fmtDate(e.pendingExtension.requestedDeadline)} requested
                        </p>
                      )}
                    </td>
                    <td className={TD}>
                      <ThresholdBar
                        rate={p.rate}
                        thresholdPct={cycle.thresholdPct}
                        label={
                          <>
                            <span>
                              {p.responded} of {p.requested} responded
                            </span>
                            <span>{p.met ? 'Threshold met' : `${p.shortBy} more needed`}</span>
                          </>
                        }
                      />
                      {nominated > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          {nominated} nominated, not sent yet
                        </p>
                      )}
                    </td>
                    <td className={TD}>
                      <EnrollmentPill status={e.status} />
                    </td>
                    <td className={`${TD} text-right`}>
                      <Link
                        href={`/icsa/enrollments/${e.id}`}
                        className="font-semibold text-[#307c4c] hover:underline"
                      >
                        Manage →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
