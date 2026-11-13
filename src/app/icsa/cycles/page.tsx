import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getIcsaActor, isChampion } from '@/lib/icsa/access';
import { listCycles, listEnrollments } from '@/lib/icsa/queries';
import { FREQUENCY_LABEL, fmtDate, progress } from '@/lib/icsa/model';
import { CARD, CyclePill, Empty, PageHeader, TD, TH } from '../components/ui';
import { NewCycleForm } from './CycleForms';
import { icsaSignInPath } from '@/lib/icsa/demo';

export default async function CyclesPage() {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin && !isChampion(actor)) redirect('/icsa');

  const [allCycles, enrollments] = await Promise.all([listCycles(), listEnrollments(actor)]);
  /* Champions see only the cycles the administrator has assigned their country to. */
  const cycles = actor.isAdmin
    ? allCycles
    : allCycles.filter((c) => enrollments.some((e) => e.cycleId === c.id));

  return (
    <>
      <PageHeader
        eyebrow="Self-audit cycles"
        title="Cycles"
        actions={actor.isAdmin ? <NewCycleForm /> : undefined}
      >
        {actor.isAdmin
          ? 'Open a cycle for each period and assign the countries taking part. Each country’s champion then chooses the respondents.'
          : 'Cycles your country has been assigned to. Open one to choose the people who must complete the self-assessment.'}
      </PageHeader>

      {!cycles.length ? (
        <Empty title="No cycles yet.">
          {actor.isAdmin
            ? 'Open the first one above.'
            : 'Your country has not been assigned to a cycle yet. You will get an email when it is.'}
        </Empty>
      ) : (
        <div className={`${CARD} overflow-x-auto`}>
          <table className="w-full min-w-[860px]">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                {[
                  'Cycle',
                  'Frequency',
                  'Period',
                  'Deadline',
                  'Threshold',
                  actor.isAdmin ? 'Countries' : 'Your countries',
                  'Responses',
                  'Status',
                ].map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {cycles.map((c) => {
                const mine = enrollments.filter((e) => e.cycleId === c.id);
                const p = progress(
                  mine.flatMap((e) => e.statuses),
                  c.thresholdPct,
                );
                return (
                  <tr key={c.id} className="hover:bg-[#307c4c]/5">
                    <td className={TD}>
                      <Link
                        href={`/icsa/cycles/${c.id}`}
                        className="font-semibold text-[#307c4c] hover:underline"
                      >
                        {c.label}
                      </Link>
                    </td>
                    <td className={TD}>{FREQUENCY_LABEL[c.frequency]}</td>
                    <td className={TD}>
                      {fmtDate(c.periodStart)} – {fmtDate(c.periodEnd)}
                    </td>
                    <td className={TD}>{fmtDate(c.deadline)}</td>
                    <td className={TD}>{c.thresholdPct}%</td>
                    <td className={TD}>
                      {mine.length ? (
                        mine.map((e) => e.country).join(', ')
                      ) : (
                        <span className="text-slate-400">None assigned</span>
                      )}
                    </td>
                    <td className={TD}>
                      {p.requested
                        ? `${p.responded} of ${p.requested} (${Math.round(p.rate * 100)}%)`
                        : '–'}
                    </td>
                    <td className={TD}>
                      <CyclePill status={c.status} />
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
