import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Download } from 'lucide-react';
import { getIcsaActor, isChampion } from '@/lib/icsa/access';
import {
  championOptions,
  listCycles,
  listEnrollments,
  listManagedAssessments,
} from '@/lib/icsa/queries';
import {
  ICSA_COUNTRIES,
  ICSA_SECTIONS,
  RESPONDED_STATUSES,
  fmtDate,
  pct,
  progress,
  questionText,
  rankGaps,
  scoreAnswers,
  sectionsByKeys,
} from '@/lib/icsa/model';
import {
  AssessmentPill,
  BTN_QUIET,
  CARD,
  Empty,
  EnrollmentPill,
  Kpi,
  PageHeader,
  RateChip,
  TD,
  TH,
  ThresholdBar,
} from '../components/ui';
import ScopeFilter from './ScopeFilter';
import { icsaSignInPath } from '@/lib/icsa/demo';

type SP = Promise<{ cycle?: string; country?: string; champion?: string }>;

export default async function DashboardPage({ searchParams }: { searchParams: SP }) {
  const actor = await getIcsaActor();
  if (!actor) redirect(icsaSignInPath());
  if (!actor.isAdmin && !isChampion(actor)) redirect('/icsa');
  const sp = await searchParams;

  const cycles = await listCycles();
  /* Default to the current cycle: the newest open one, else the newest. */
  const defaultCycle = cycles.find((c) => c.status === 'open') ?? cycles[0];
  const cycleParam = sp.cycle ?? (defaultCycle ? String(defaultCycle.id) : 'all');
  const cycleId = cycleParam === 'all' ? null : Number(cycleParam) || null;
  const cycle = cycles.find((c) => c.id === cycleId) ?? null;
  const country = sp.country || null;
  const champion = actor.isAdmin ? sp.champion || null : null;

  const [all, enrollmentsAll, champions] = await Promise.all([
    listManagedAssessments(actor, { cycleId, country, champion }),
    listEnrollments(actor, cycleId ?? undefined),
    actor.isAdmin ? championOptions() : Promise.resolve([]),
  ]);
  const enrollments = enrollmentsAll.filter(
    (e) =>
      (!country || e.country === country) &&
      (!champion || e.championEmail.toLowerCase() === champion.toLowerCase()),
  );

  const scored = all.map((a) => ({
    a,
    score: scoreAnswers(a.answers, sectionsByKeys(a.sections)),
  }));
  const responded = scored.filter((x) => RESPONDED_STATUSES.includes(x.a.status));
  const started = new Set(
    all.filter((a) => a.status !== 'requested').map((a) => `${a.cycleId}:${a.country}`),
  ).size;
  const awaiting = all.filter((a) => a.status === 'submitted').length;
  const reviewed = all.filter((a) => a.status === 'reviewed').length;
  const rates = responded.map((x) => x.score.total.rate).filter((r): r is number => r !== null);
  const avg = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null;
  const coverage = progress(
    all.map((a) => a.status),
    cycle?.thresholdPct ?? 70,
  );

  /* Compliance by section and country, pooled over every response in that country. */
  const countriesInView = [...new Set(responded.map((x) => x.a.country))].sort();
  const pooled = countriesInView.map((c) => {
    const mine = responded.filter((x) => x.a.country === c);
    const cell = (key?: string) => {
      let yes = 0;
      let scoredN = 0;
      for (const { score } of mine) {
        for (const p of score.per) {
          if (key && p.section.key !== key) continue;
          yes += p.tally.Yes;
          scoredN += p.tally.Yes + p.tally.No + p.tally.Partial;
        }
      }
      return scoredN ? yes / scoredN : null;
    };
    return {
      country: c,
      n: mine.length,
      overall: cell(),
      per: ICSA_SECTIONS.map((s) => cell(s.key)),
    };
  });
  const gaps = rankGaps(
    responded.map((x) => ({ country: x.a.country, answers: x.a.answers, sections: x.a.sections })),
  );

  const scopeCountries = actor.isAdmin ? [...ICSA_COUNTRIES] : actor.championCountries;
  const exportHref = `/api/icsa/export?${new URLSearchParams({
    ...(cycleId ? { cycle: String(cycleId) } : {}),
    ...(country ? { country } : {}),
    ...(champion ? { champion } : {}),
  }).toString()}`;

  return (
    <>
      <PageHeader
        eyebrow={
          actor.isAdmin ? 'Administrator' : `Champion · ${actor.championCountries.join(', ')}`
        }
        title="Review dashboard"
        actions={
          <a className={BTN_QUIET} href={exportHref}>
            <Download className="h-4 w-4" /> Consolidated Excel
          </a>
        }
      >
        {cycle
          ? `${cycle.label}: deadline ${fmtDate(cycle.deadline)}, threshold ${cycle.thresholdPct}%.`
          : 'Every cycle.'}{' '}
        Open an assessment to read its answers, then mark it reviewed or return it for changes.
      </PageHeader>

      <div className={`${CARD} mb-6 p-4`}>
        <ScopeFilter
          cycles={cycles.map((c) => ({ id: c.id, label: c.label }))}
          countries={scopeCountries}
          champions={champions}
          value={{ cycle: cycleParam, country: country ?? '', champion: champion ?? '' }}
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Countries started" value={started} sub={`${enrollments.length} enrolled`} />
        <Kpi label="Awaiting review" value={awaiting} />
        <Kpi label="Reviewed" value={reviewed} />
        <Kpi label="Average compliance" value={pct(avg)} sub="Submitted and reviewed only" />
        <Kpi
          label="Response rate"
          value={`${Math.round(coverage.rate * 100)}%`}
          sub={`${coverage.responded} of ${coverage.requested} asked`}
        />
      </div>

      {enrollments.length > 0 && (
        <Block title="Cycle progress by country">
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[760px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {[
                    'Country',
                    'Cycle',
                    'Champion',
                    'Deadline',
                    'Responses vs threshold',
                    'Status',
                    '',
                  ].map((h) => (
                    <th key={h} className={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {enrollments.map((e) => {
                  const c = cycles.find((x) => x.id === e.cycleId);
                  const p = progress(e.statuses, c?.thresholdPct ?? 70);
                  return (
                    <tr key={e.id} className="hover:bg-[#307c4c]/5">
                      <td className={`${TD} font-semibold`}>{e.country}</td>
                      <td className={TD}>{c?.label}</td>
                      <td className={TD}>{e.championName || e.championEmail}</td>
                      <td className={TD}>{fmtDate(e.deadline)}</td>
                      <td className={TD}>
                        <ThresholdBar
                          rate={p.rate}
                          thresholdPct={p.thresholdPct}
                          label={
                            <>
                              <span>
                                {p.responded} of {p.requested}
                              </span>
                              <span>{Math.round(p.rate * 100)}%</span>
                            </>
                          }
                        />
                      </td>
                      <td className={TD}>
                        <EnrollmentPill status={e.status} />
                      </td>
                      <td className={`${TD} text-right`}>
                        <Link
                          href={`/icsa/enrollments/${e.id}`}
                          className="font-semibold text-[#307c4c] hover:underline"
                        >
                          Open →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Block>
      )}

      <Block title="Assessments">
        {!all.length ? (
          <Empty title="No assessments in this scope yet.">
            They appear here as soon as a champion sends the requests.
          </Empty>
        ) : (
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  {[
                    'Country',
                    'Respondent',
                    'Sections',
                    'Status',
                    'Completion',
                    'Compliance',
                    'Open items',
                    'Updated',
                    '',
                  ].map((h) => (
                    <th key={h} className={TH}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {scored.map(({ a, score }) => (
                  <tr key={a.id} className="hover:bg-[#307c4c]/5">
                    <td className={TD}>
                      <b>{a.country}</b>
                      <p className="text-xs text-slate-500">{a.cycleLabel}</p>
                    </td>
                    <td className={TD}>
                      {a.respondentName || a.respondentEmail}
                      <p className="text-xs text-slate-500">{a.designation || a.jobTitle || ''}</p>
                    </td>
                    <td className={`${TD} text-xs`}>
                      {sectionsByKeys(a.sections)
                        .map((s) => s.short)
                        .join(', ')}
                    </td>
                    <td className={TD}>
                      <AssessmentPill status={a.status} />
                    </td>
                    <td className={TD}>{pct(score.total.comp)}</td>
                    <td className={TD}>
                      <RateChip rate={score.total.rate} />
                    </td>
                    <td className={TD}>{score.total.open}</td>
                    <td className={TD}>{fmtDate(a.updatedAt)}</td>
                    <td className={`${TD} text-right`}>
                      <Link
                        href={`/icsa/assessments/${a.id}`}
                        className="font-semibold text-[#307c4c] hover:underline"
                      >
                        {a.status === 'submitted' ? 'Review' : 'Open'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      {pooled.length > 0 && (
        <Block
          title="Compliance by section and country"
          sub="Pooled over every submitted and reviewed response in the country."
        >
          <div className={`${CARD} overflow-x-auto`}>
            <table className="w-full min-w-[900px]">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr>
                  <th className={TH}>Country</th>
                  <th className={`${TH} text-right`}>Responses</th>
                  <th className={`${TH} text-right`}>Overall</th>
                  {ICSA_SECTIONS.map((s) => (
                    <th key={s.key} className={`${TH} text-right`} title={s.title}>
                      {s.id}. {s.short.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pooled.map((r) => (
                  <tr key={r.country}>
                    <td className={`${TD} font-semibold`}>{r.country}</td>
                    <td className={`${TD} text-right`}>{r.n}</td>
                    <td className={`${TD} text-right`}>
                      <RateChip rate={r.overall} />
                    </td>
                    {r.per.map((v, i) => (
                      <td key={i} className={`${TD} text-right`}>
                        <RateChip rate={v} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="flex flex-wrap gap-4 px-4 py-2 text-xs text-slate-500">
              <span>
                <RateChip rate={0.95} /> 90%+ strong
              </span>
              <span>
                <RateChip rate={0.8} /> 70–89% watch
              </span>
              <span>
                <RateChip rate={0.5} /> under 70% gap
              </span>
              <span>
                <RateChip rate={null} /> no data
              </span>
            </p>
          </div>
        </Block>
      )}

      {responded.length > 0 && (
        <Block title="Most common open items" sub="Questions answered No or Partial most often.">
          {!gaps.length ? (
            <Empty title="No open items in this scope." />
          ) : (
            <div className={`${CARD} overflow-x-auto`}>
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    {['Ref', 'Question', 'No', 'Partial', 'Countries'].map((h) => (
                      <th key={h} className={TH}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {gaps.slice(0, 15).map((g) => (
                    <tr key={g.question.ref}>
                      <td className={`${TD} font-semibold`}>{g.question.ref}</td>
                      <td className={TD}>{questionText(g.question, null)}</td>
                      <td className={TD}>{g.no}</td>
                      <td className={TD}>{g.partial}</td>
                      <td className={TD}>{g.countries.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Block>
      )}
    </>
  );
}

function Block({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      {sub && <p className="mb-2 text-sm text-slate-500">{sub}</p>}
      <div className={sub ? '' : 'mt-2'}>{children}</div>
    </section>
  );
}
