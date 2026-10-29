'use client';

/* ─────────────────────────────────────────────────────────────
   Travel Portal analytics.

   Four bands, and which of them render is decided on the server: a finance reader's payload
   does not contain the optimisation figures and nobody but an admin is sent a traveller's
   passport expiry. The `null` checks below are therefore rendering the absence of data, not
   hiding data that arrived — hiding a section in the client would leave it in the page source.

   Band 1 · Headline          every role
   Band 2 · Finance           every role, including the rejected requests the user asked for
   Band 3 · Optimisation      management and admin
   Band 4 · Traveller data    admin only, with the identity documents behind an audited reveal
   ───────────────────────────────────────────────────────────── */

import { useCallback, useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Eye, Loader2, ShieldAlert } from 'lucide-react';
import { getTravelAnalytics, revealTravellerIdentity } from '@/app/actions/travel-analytics';
import type { TravelFilters } from '@/lib/travel-analytics/filters';
import type { IdentityDocuments } from '@/lib/travel-analytics/queries';
import type {
  ApproverBottleneck,
  QualityFlag,
  SavingsGroup,
  SpendGroup,
  TravelAnalyticsData,
  TravellerRecord,
} from '@/lib/travel-analytics/queries';
import Link from 'next/link';
import { formatDate } from '@/lib/format';
import BookingChannels from './BookingChannels';
import SpendByDimension from './SpendByDimension';
import SpendOverTime from './SpendOverTime';
import TravelFilterBar from './TravelFilterBar';
import TravelMap from './TravelMap';
import TravelTypes from './TravelTypes';
import { CarrierMixChart, LeadTimeHistogram, ViolationsOverTimeChart } from './TravelCharts';

const BRAND = '#307c4c';
const CARD = 'rounded-2xl border border-slate-200 bg-white shadow-sm';

const usd = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : `$${Math.round(n).toLocaleString()}`;
const count = (n: number) => n.toLocaleString();
const days = (n: number | null) => (n === null ? '—' : `${n.toFixed(n < 10 ? 1 : 0)} d`);

/* ═══ Shared furniture ═══════════════════════════════════════════════════════ */

function Kpi({
  label,
  value,
  note,
  tone = 'default',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'default' | 'warn';
}) {
  return (
    <div className={`${CARD} p-4`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p
        className={`mt-1.5 text-[26px] font-bold tracking-tight tabular-nums ${
          tone === 'warn' ? 'text-amber-700' : 'text-slate-900'
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] leading-snug text-slate-500">{note}</p>}
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`${CARD} p-5 ${className}`}>
      <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
      {subtitle && <p className="mt-0.5 text-[11.5px] leading-snug text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

function Band({
  number,
  title,
  blurb,
  children,
}: {
  number: number;
  title: string;
  blurb: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3">
        <span
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: BRAND }}
        >
          {number}
        </span>
        <div>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
          <p className="text-[12px] text-slate-500">{blurb}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-slate-400">{children}</p>;
}

/**
 * A labelled bar list.
 *
 * Every spend group carries its own population, so a row whose bookings include unpriced ones
 * says so on the row itself. A caption at the bottom of the card would be a statement about the
 * whole chart and silently wrong for the one country that holds most of the zeroes.
 */
function SpendBars({ rows, emptyText }: { rows: SpendGroup[]; emptyText: string }) {
  const max = Math.max(1, ...rows.map((r) => r.totalUsd));
  if (!rows.length) return <Empty>{emptyText}</Empty>;
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700" title={r.label}>
              {r.label}
              {r.sublabel && (
                <span className="ml-1.5 text-[11px] text-slate-400">{r.sublabel}</span>
              )}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-slate-900">
              {usd(r.totalUsd)}
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.totalUsd / max) * 100}%`, background: BRAND }}
            />
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-400">
            {count(r.bookings)} {r.bookings === 1 ? 'booking' : 'bookings'}
            {r.zeroValued > 0 && ` · ${count(r.zeroValued)} priced at $0`}
            {r.averageTicketUsd !== null && ` · ${usd(r.averageTicketUsd)} average`}
          </p>
        </div>
      ))}
    </div>
  );
}

function CountBars({
  rows,
  unit,
  tone = BRAND,
}: {
  rows: { label: string; value: number; note?: string }[];
  unit: string;
  tone?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Empty>Nothing to show.</Empty>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-slate-700" title={r.label}>
              {r.label}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-slate-900">
              {count(r.value)}{' '}
              <span className="text-[10px] font-normal text-slate-400">{unit}</span>
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.value / max) * 100}%`, background: tone }}
            />
          </div>
          {r.note && <p className="mt-0.5 text-[10.5px] text-slate-400">{r.note}</p>}
        </div>
      ))}
    </div>
  );
}

function SavingsBars({ rows }: { rows: SavingsGroup[] }) {
  const max = Math.max(1, ...rows.map((r) => r.missedUsd));
  if (!rows.length) return <Empty>No missed savings in scope.</Empty>;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate text-slate-700">{r.label}</span>
            <span className="shrink-0 font-bold tabular-nums text-amber-700">
              {usd(r.missedUsd)}
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${(r.missedUsd / max) * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-400">
            {count(r.legs)} {r.legs === 1 ? 'leg' : 'legs'} · {usd(r.selectedUsd)} actually paid
          </p>
        </div>
      ))}
    </div>
  );
}

/* ═══ Band 4 · the audited reveal ════════════════════════════════════════════ */

/**
 * One traveller's row, with the identity documents behind a button.
 *
 * The dashboard never receives a passport number, a date of birth or a mobile. Pressing Reveal
 * calls a server action that checks the caller is an admin, writes a row to `travel_pii_reveals`
 * naming the actor, the booking, the traveller and the fields, and only then reads the values.
 * The button says what it will do before it does it, because an audit trail nobody was warned
 * about is a trap rather than a control.
 */
function TravellerRow({ traveller }: { traveller: TravellerRecord }) {
  const [state, setState] = useState<'idle' | 'loading' | 'shown' | 'error'>('idle');
  const [documents, setDocuments] = useState<IdentityDocuments | null>(null);
  const [error, setError] = useState('');

  async function reveal() {
    setState('loading');
    setError('');
    const res = await revealTravellerIdentity(traveller.recordId);
    if (res.success) {
      setDocuments(res.documents);
      setState('shown');
    } else {
      setError(res.error);
      setState('error');
    }
  }

  return (
    <tr className="border-b border-slate-100 last:border-b-0 align-top">
      <td className="px-3 py-2.5">
        {/* Linked on the employee id, not the name: names repeat and are spelled more than one
            way in this feed, and the id is what every booking actually carries. A record with
            no id has no page to open, so it stays plain text rather than offering a dead link. */}
        {traveller.employeeId ? (
          <Link
            href={`/supply-chain-analytics/traveller/${encodeURIComponent(traveller.employeeId)}`}
            className="font-medium text-[#307c4c] underline-offset-2 hover:underline"
          >
            {traveller.name}
          </Link>
        ) : (
          <div className="font-medium text-slate-900">{traveller.name}</div>
        )}
        <div className="text-[11px] text-slate-400">
          {traveller.email ?? 'No email on file'}
          {traveller.employeeId && ` · ${traveller.employeeId}`}
        </div>
      </td>
      <td className="px-3 py-2.5 text-slate-600">{traveller.nationality ?? '—'}</td>
      <td className="px-3 py-2.5 tabular-nums text-slate-600">{count(traveller.trips)}</td>
      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-900">
        {usd(traveller.spendUsd)}
      </td>
      <td className="px-3 py-2.5 tabular-nums text-slate-600">
        {traveller.passportExpiry ? formatDate(traveller.passportExpiry) : '—'}
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500">
        {traveller.ticketNumber ?? '—'}
      </td>
      <td className="px-3 py-2.5">
        {state === 'shown' && documents ? (
          <div className="space-y-0.5 text-[11.5px]">
            <div>
              <span className="text-slate-400">Passport</span>{' '}
              <span className="font-mono text-slate-800">{documents.passportNumber ?? '—'}</span>
            </div>
            <div>
              <span className="text-slate-400">Born</span>{' '}
              <span className="text-slate-800">
                {documents.dateOfBirth ? formatDate(documents.dateOfBirth) : '—'}
              </span>
            </div>
            <div>
              <span className="text-slate-400">Mobile</span>{' '}
              <span className="text-slate-800">{documents.mobile ?? '—'}</span>
            </div>
            <p className="pt-0.5 text-[10px] text-slate-400">
              Logged against {documents.bookingCode}.
            </p>
          </div>
        ) : (
          <div>
            <button
              type="button"
              onClick={reveal}
              disabled={state === 'loading'}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-700 transition-colors hover:border-[#307c4c]/40 hover:text-[#307c4c] disabled:opacity-50"
            >
              {state === 'loading' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
              Reveal
            </button>
            {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ═══ The dashboard ══════════════════════════════════════════════════════════ */

export default function TravelAnalyticsClient({
  data: initial,
}: {
  data: TravelAnalyticsData | null;
}) {
  const [travellerFilter, setTravellerFilter] = useState('');

  /* The filtered payload replaces the server's, and the server's is what we fall back to. The
     filters are applied THERE, in loadTravelAnalytics, for the reason the filter bar explains:
     folding them again in the browser would be a second implementation of every band. */
  const [data, setData] = useState<TravelAnalyticsData | null>(initial);
  const [pending, startTransition] = useTransition();
  const [filterError, setFilterError] = useState('');

  const applyFilters = useCallback((next: TravelFilters) => {
    startTransition(async () => {
      const fresh = await getTravelAnalytics(next);
      /* A null here means the grant went away mid-session, not that the filter matched nothing
         — an empty match still returns a payload. Keeping the old data and saying so beats
         replacing the board with the no-access card over one failed round trip. */
      if (!fresh) {
        setFilterError('Could not apply that filter. The board below is unchanged.');
        return;
      }
      setFilterError('');
      setData(fresh);
    });
  }, []);

  const travellers = useMemo(() => {
    const rows = data?.admin?.travellers ?? [];
    const q = travellerFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.email ?? '').toLowerCase().includes(q) ||
        (t.nationality ?? '').toLowerCase().includes(q),
    );
  }, [data, travellerFilter]);

  if (!data) {
    return (
      <div className={`${CARD} mx-auto mt-10 max-w-md p-10 text-center`}>
        <ShieldAlert className="mx-auto mb-4 h-8 w-8 text-slate-300" />
        <p className="font-semibold text-slate-900">No Travel Portal access</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          Travel analytics is granted separately from platform admin. An administrator can add a
          grant under Admin → Supply Chain Analytics → Travel Access.
        </p>
      </div>
    );
  }

  const { headline, finance, optimisation, admin } = data;
  const scopeLabel =
    data.countries === null ? 'All countries' : data.countries.join(' · ') || 'No country';
  const adherence =
    optimisation && optimisation.selectedSegments > 0
      ? (optimisation.cheapestAlsoSelected / optimisation.selectedSegments) * 100
      : null;

  return (
    <div className="space-y-8">
      {/* ── Who is looking, and at what ── */}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold uppercase tracking-wide text-slate-600">
          {data.role}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">{scopeLabel}</span>
        <span className="text-slate-400">
          {count(data.bookingsInScope)} bookings in scope · generated{' '}
          {new Date(data.generatedAt).toLocaleString('en-GB')}
        </span>
      </div>

      <TravelFilterBar
        options={data.filterOptions}
        applied={data.appliedFilters}
        onChange={applyFilters}
        busy={pending}
        showing={data.bookingsInScope}
        total={data.bookingsBeforeFilters}
      />
      {filterError && <p className="text-[12px] font-semibold text-[#B71C1C]">{filterError}</p>}

      {/* ══ Band 1 · Headline ══ */}
      <Band
        number={1}
        title="Headline"
        blurb="Everything in scope, at a glance. Spend is summed over every booking; averages are not."
      >
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi
            label="Total spend"
            value={usd(headline.spend.totalUsd)}
            note={`Across ${count(headline.spend.bookings)} bookings`}
          />
          <Kpi label="Bookings" value={count(headline.spend.bookings)} />
          <Kpi label="Travellers" value={count(headline.travellers)} note="Distinct employees" />
          <Kpi
            label="Average ticket"
            value={usd(headline.spend.averageTicketUsd)}
            note={`Over the ${count(headline.spend.priced)} that carry a price`}
          />
          <Kpi
            label="Pending approval"
            value={count(headline.pendingApprovals)}
            tone={headline.pendingApprovals > 0 ? 'warn' : 'default'}
          />
          <Kpi
            label="Missed savings"
            value={usd(headline.missedSavingsUsd)}
            note={`Measured on ${count(headline.savingsCoveredBookings)} bookings`}
            tone={headline.missedSavingsUsd > 0 ? 'warn' : 'default'}
          />
        </div>

        {headline.spend.zeroValued > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{finance.note}</span>
          </div>
        )}
      </Band>

      {/* ══ Band 2 · Finance ══ */}
      <Band number={2} title="Finance" blurb="Where the money went, and who it is charged to.">
        <SpendOverTime
          days={finance.byDay}
          note="Bars are spend; the line is the number of bookings. They diverge wherever the feed priced a batch at $0."
        />

        {/* Four charts that all answered "where did the money go" are now one, because the
            comparison between them is the interesting part and scrolling between two charts to
            make it was not working. */}
        <SpendByDimension
          byCountry={finance.byCountry}
          byCostCentre={finance.byCostCentre}
          bySegment={finance.bySegment}
          byCompany={finance.byCompany}
          costCentresBeyondTop={finance.costCentresBeyondTop}
          note="Country is resolved from the cost-centre mapping; segment padding from the feed is trimmed before grouping."
        />

        <TravelMap data={data.map} aspect fit="mena" />

        <TravelTypes band={data.travelTypes} />

        <BookingChannels band={data.channels} />

        <Card title="Average ticket by cabin class">
          <SpendBars rows={finance.byCabinClass} emptyText="No cabin classes in scope." />
        </Card>

        {/* Rejected requests. The user asked that finance see these; the heading and the colour
            are doing the work of making sure nobody reads them as spend. */}
        <Card
          title="Rejected requests"
          subtitle={`${count(finance.rejected.length)} requests were rejected, for a would-be ${usd(finance.rejectedSpendUsd)}. This is NOT spend — no money left the business on these.`}
        >
          {finance.rejected.length === 0 ? (
            <Empty>Nothing was rejected in scope.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="px-3 py-2 font-semibold">Employee</th>
                    <th className="px-3 py-2 font-semibold">Route</th>
                    <th className="px-3 py-2 font-semibold">Country</th>
                    <th className="px-3 py-2 font-semibold">Requested</th>
                    <th className="px-3 py-2 font-semibold">Departure</th>
                    <th className="px-3 py-2 text-right font-semibold">Amount (not spent)</th>
                  </tr>
                </thead>
                <tbody>
                  {finance.rejected.map((r) => (
                    <tr key={r.code} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-900">{r.employeeName ?? '—'}</div>
                        <div className="font-mono text-[10.5px] text-slate-400">{r.code}</div>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{r.route}</td>
                      <td className="px-3 py-2 text-slate-600">{r.country ?? 'Not mapped'}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(r.createdAt)}</td>
                      <td className="px-3 py-2 text-slate-600">{formatDate(r.departureDate)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-400 line-through">
                        {usd(r.amountUsd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Band>

      {/* ══ Band 3 · Optimisation ══ */}
      {optimisation && (
        <Band
          number={3}
          title="Compliance and optimisation"
          blurb="What the policy says, what was booked, and who is holding things up."
        >
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi
              label="Cheapest-fare adherence"
              value={adherence === null ? '—' : `${adherence.toFixed(1)}%`}
              note={`${count(optimisation.cheapestAlsoSelected)} of ${count(optimisation.selectedSegments)} booked segments were also the cheapest offered`}
              tone={adherence !== null && adherence < 50 ? 'warn' : 'default'}
            />
            <Kpi
              label="Avg. time to decide"
              value={days(optimisation.averageDecisionDays)}
              note={`${count(optimisation.decidedCount)} decided · worst ${days(optimisation.worstDecisionDays)}`}
            />
            <Kpi
              label="Still pending"
              value={count(optimisation.pendingCount)}
              note={`Average age ${days(optimisation.averagePendingDays)} · oldest ${days(optimisation.oldestPendingDays)}`}
              tone={optimisation.pendingCount > 0 ? 'warn' : 'default'}
            />
            <Kpi
              label="Policy violations"
              value={count(optimisation.violationTotals.reduce((n, v) => n + v.bookings, 0))}
              note={`Across ${count(optimisation.violationTypes.length)} policy types`}
              tone="warn"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card
              title="Lead time"
              subtitle={`Days between booking and departure. Red is inside the ${optimisation.advanceThresholdDays}-day advance-booking rule; amber is the bookings created after their flight had already gone.`}
            >
              <LeadTimeHistogram
                data={optimisation.leadTime}
                thresholdDays={optimisation.advanceThresholdDays}
              />
            </Card>
            <Card
              title="Policy violations over time"
              subtitle="By the month the booking was raised."
            >
              {optimisation.violationTypes.length === 0 ? (
                <Empty>No violations in scope.</Empty>
              ) : (
                <ViolationsOverTimeChart
                  data={optimisation.violationsByMonth}
                  types={optimisation.violationTypes}
                />
              )}
            </Card>
            <Card title="Violations by type" subtitle="Bookings affected, and what they cost.">
              <CountBars
                rows={optimisation.violationTotals.map((v) => ({
                  label: v.description,
                  value: v.bookings,
                  note: `${usd(v.spendUsd)} of spend on these bookings`,
                }))}
                unit="bookings"
                tone="#dc2626"
              />
            </Card>
            <Card
              title="Carrier mix"
              subtitle="Segments actually booked. The unnamed carrier is a gap in the feed, not an airline."
            >
              <CarrierMixChart data={optimisation.carrierMix} />
            </Card>
            <Card
              title="Missed savings by carrier"
              subtitle="Where a cheaper fare was on offer and not taken."
            >
              <SavingsBars rows={optimisation.missedSavingsByCarrier} />
            </Card>
            <Card title="Missed savings by route">
              <SavingsBars rows={optimisation.missedSavingsByRoute} />
            </Card>
            <Card
              title="Approval ageing"
              subtitle="Per approval step, not per booking — a booking can carry several approvers."
            >
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Decided
                  </p>
                  <CountBars
                    rows={optimisation.decidedAgeing.map((b) => ({
                      label: b.label,
                      value: b.count,
                    }))}
                    unit="steps"
                  />
                </div>
                <div>
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Still waiting
                  </p>
                  <CountBars
                    rows={optimisation.pendingAgeing.map((b) => ({
                      label: b.label,
                      value: b.count,
                    }))}
                    unit="steps"
                    tone="#f59e0b"
                  />
                </div>
              </div>
            </Card>
            <Card
              title="Approver bottlenecks"
              subtitle="Named approvers with steps still waiting on them, longest first."
            >
              <ApproverList rows={optimisation.approverBottlenecks} />
            </Card>
          </div>
        </Band>
      )}

      {/* ══ Band 4 · Traveller data ══ */}
      {admin && (
        <Band
          number={4}
          title="Travellers and data quality"
          blurb="Admin only. Identity documents are revealed one record at a time, and every reveal is logged."
        >
          {admin.expiringPassports.length > 0 && (
            <Card
              title="Passports expiring within six months"
              subtitle="Many destinations refuse entry inside six months of expiry, so these are a travel block, not a reminder."
            >
              <div className="flex flex-wrap gap-2">
                {admin.expiringPassports.map((p) => (
                  <span
                    key={p.recordId}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] ${
                      p.daysLeft < 0 ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-900'
                    }`}
                  >
                    <span className="font-semibold">{p.name}</span>
                    <span className="tabular-nums">
                      {p.daysLeft < 0
                        ? `expired ${Math.abs(p.daysLeft)} d ago`
                        : `${p.daysLeft} d left`}
                    </span>
                    <span className="text-[10.5px] opacity-70">{formatDate(p.expiry)}</span>
                  </span>
                ))}
              </div>
            </Card>
          )}

          <Card
            title="Traveller directory"
            subtitle="One row per person. Share of spend splits a booking evenly between the travellers on it, so a family of five on one reservation is not counted five times. Passport number, date of birth and mobile are not on this page — pressing Reveal writes an audit row naming you, the booking and the fields, and only then fetches them."
          >
            <input
              value={travellerFilter}
              onChange={(e) => setTravellerFilter(e.target.value)}
              placeholder="Filter by name, email or nationality…"
              className="mb-3 w-full max-w-sm rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#307c4c]"
            />
            {travellers.length === 0 ? (
              <Empty>
                {admin.travellers.length === 0
                  ? 'The traveller feed covers none of the bookings in scope.'
                  : 'No traveller matches that filter.'}
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400">
                      <th className="px-3 py-2 font-semibold">Traveller</th>
                      <th className="px-3 py-2 font-semibold">Nationality</th>
                      <th className="px-3 py-2 font-semibold">Trips</th>
                      <th className="px-3 py-2 text-right font-semibold">Share of spend</th>
                      <th className="px-3 py-2 font-semibold">Passport expiry</th>
                      <th className="px-3 py-2 font-semibold">Ticket</th>
                      <th className="px-3 py-2 font-semibold">Identity documents</th>
                    </tr>
                  </thead>
                  <tbody>
                    {travellers.map((t) => (
                      <TravellerRow key={t.recordId} traveller={t} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <QualityPanel flags={admin.quality} />
        </Band>
      )}
    </div>
  );
}

function ApproverList({ rows }: { rows: ApproverBottleneck[] }) {
  if (!rows.length) return <Empty>Nothing is waiting on an approver.</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.pending));
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-slate-800">{r.name}</span>
            <span className="shrink-0 font-bold tabular-nums text-amber-700">
              {count(r.pending)} waiting
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-amber-500"
              style={{ width: `${(r.pending / max) * 100}%` }}
            />
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-400">
            Oldest {days(r.oldestDays)} · average {days(r.averageDays)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * The data-quality panel.
 *
 * "Keep everything, flag it" was the instruction, and this is the second half of it. Nothing
 * counted here has been removed from any other figure on the page, and each row says what it
 * does to the numbers above — a bare count with no consequence attached just invites a reader
 * to decide the data is broken and stop.
 */
function QualityPanel({ flags }: { flags: QualityFlag[] }) {
  const firing = flags.filter((f) => f.count > 0).length;
  return (
    <Card
      title="Data quality"
      subtitle={`${firing} of ${flags.length} checks have something to report. Nothing listed here is filtered out of the figures above; it is described so the figures can be read correctly.`}
    >
      <div className="divide-y divide-slate-100">
        {flags.map((f) => (
          <div key={f.id} className="flex gap-4 py-3 first:pt-0 last:pb-0">
            <span
              className={`mt-0.5 inline-flex h-7 min-w-[2.75rem] shrink-0 items-center justify-center rounded-lg px-2 text-[13px] font-bold tabular-nums ${
                f.count > 0 ? 'bg-amber-50 text-amber-800' : 'bg-slate-50 text-slate-400'
              }`}
            >
              {count(f.count)}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">{f.label}</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-slate-500">{f.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
