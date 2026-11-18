'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · dashboard.

   Where the month stands, for one country, and a way into
   whatever needs doing. Every figure links to the page that acts
   on it, so the dashboard is never a dead end.

   Cards the reader's role cannot act on are still shown, but
   their link goes nowhere they would be refused: an Ops validator
   sees how many lines await a PO without being sent to a page
   they cannot use.
   ───────────────────────────────────────────────────────────── */

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowRight, CalendarClock, ClipboardCheck, Library, Receipt, Send } from 'lucide-react';
import type { RrsmOverview, RrsmScope } from '@/app/actions/rrsm/overview';
import { STAGE_LABEL, periodLabel, type CycleStage } from '@/lib/rrsm/cycle';
import { meetsNeed, rrsmHref, type RrsmNeed } from '@/lib/rrsm/nav';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';

const STAGE_ORDER: CycleStage[] = [
  'awaiting_supplier',
  'submitted',
  'returned',
  'validated',
  'closed',
];

const STAGE_BAR: Record<CycleStage, string> = {
  awaiting_supplier: 'bg-slate-300',
  submitted: 'bg-amber-400',
  returned: 'bg-red-400',
  validated: 'bg-[#6AAF8E]',
  closed: 'bg-[#1d4f31]',
};

export default function RrsmDashboardClient({
  scope,
  overview,
}: {
  scope: RrsmScope;
  overview: RrsmOverview | null;
}) {
  const money = useMemo(
    () => new Intl.NumberFormat('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
    [],
  );

  if (!scope.country || !overview) {
    return (
      <RrsmShell scope={scope} title="Dashboard">
        <RrsmNoCountry />
      </RrsmShell>
    );
  }

  const country = scope.country;
  const href = (path: string) => rrsmHref(path, country.code);
  const can = (need: RrsmNeed) => meetsNeed(need, scope);
  const { cycle, suppliers, renewals, register } = overview;

  return (
    <RrsmShell
      scope={scope}
      title="Dashboard"
      subtitle={
        cycle
          ? `${periodLabel(new Date(cycle.period + 'T00:00:00Z'))} cycle for ${country.name}, ${cycle.opensOn} to ${cycle.closesOn}.`
          : `No cycle has been opened for ${country.name} yet.`
      }
    >
      {/* ── the month ─────────────────────────────────────────── */}
      {cycle ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                This cycle
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                {money.format(cycle.value)}{' '}
                <span className="text-sm font-semibold text-slate-400">{country.currency}</span>
              </p>
              <p className="mt-0.5 text-[13px] text-slate-500">
                {cycle.lines} lines from {suppliers.inCycle} suppliers
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Closed
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-[#1d4f31]">
                {cycle.lines ? Math.round((cycle.byStage.closed / cycle.lines) * 100) : 0}%
              </p>
            </div>
          </div>

          {/* Progress through the stages, as one bar. */}
          {cycle.lines > 0 && (
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
              {STAGE_ORDER.map((s) =>
                cycle.byStage[s] ? (
                  <div
                    key={s}
                    className={STAGE_BAR[s]}
                    style={{ width: `${(cycle.byStage[s] / cycle.lines) * 100}%` }}
                    title={`${STAGE_LABEL[s]}: ${cycle.byStage[s]}`}
                  />
                ) : null,
              )}
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
            {STAGE_ORDER.map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-[12.5px] text-slate-600">
                <span className={`h-2 w-2 rounded-full ${STAGE_BAR[s]}`} />
                {STAGE_LABEL[s]}
                <b className="font-semibold text-slate-900">{cycle.byStage[s]}</b>
              </span>
            ))}
          </div>
        </section>
      ) : (
        <RrsmEmpty
          title={`Nothing open for ${country.name}`}
          body={
            scope.canValidate
              ? 'Open the month from Ops validation. It copies every asset still on hire from last month, with today’s rates.'
              : 'Ops open the cycle. There is nothing to put on a PO until they have.'
          }
          action={
            scope.canValidate ? (
              <Link
                href={href('/rrsm/validation')}
                className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#2b6f44]"
              >
                Go to Ops validation <ArrowRight className="h-4 w-4" />
              </Link>
            ) : undefined
          }
        />
      )}

      {/* ── what needs doing ──────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={Send}
          label="Supplier invitations"
          value={cycle ? suppliers.notInvited + suppliers.waiting : 0}
          detail={
            cycle
              ? `${suppliers.notInvited} not sent · ${suppliers.waiting} waiting · ${suppliers.submitted} submitted`
              : 'No cycle open'
          }
          href={can('validate') ? href('/rrsm/suppliers') : null}
          tone={cycle && suppliers.notInvited ? 'warn' : 'plain'}
        />
        <Tile
          icon={ClipboardCheck}
          label="To validate"
          value={cycle ? cycle.byStage.submitted + cycle.byStage.returned : 0}
          detail={
            cycle
              ? `${cycle.byStage.submitted} submitted · ${cycle.byStage.returned} returned · ${cycle.byStage.awaiting_supplier} still with suppliers`
              : 'No cycle open'
          }
          href={can('validate') ? href('/rrsm/validation') : null}
          tone={cycle && cycle.byStage.returned ? 'warn' : 'plain'}
        />
        <Tile
          icon={Receipt}
          label="Awaiting a PO"
          value={cycle ? cycle.awaitingPo : 0}
          detail={
            cycle
              ? `${cycle.byStage.validated - cycle.awaitingPo} validated with a PO, ready to close`
              : 'No cycle open'
          }
          href={can('buy') ? href('/rrsm/purchasing') : null}
          tone="plain"
        />
        <Tile
          icon={CalendarClock}
          label="Renewals pending"
          value={renewals.pending}
          detail={`${renewals.overdue} past their end date · ${renewals.dueSoon} within 30 days`}
          href={href('/rrsm/renewals')}
          tone={renewals.overdue ? 'danger' : renewals.dueSoon ? 'warn' : 'plain'}
        />
      </div>

      {/* ── the register, in one line ─────────────────────────── */}
      <Link
        href={href('/rrsm/register')}
        className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm transition-colors hover:border-[#307c4c]/30"
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#307c4c]/[0.08] text-[#307c4c]">
          <Library className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">Service register</p>
          <p className="text-[13px] text-slate-500">
            {register.activeLines} lines on hire with {register.suppliers} suppliers ·{' '}
            {register.offHire} off hire
          </p>
        </div>
        <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#307c4c]" />
      </Link>
    </RrsmShell>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  detail,
  href,
  tone,
}: {
  icon: typeof Send;
  label: string;
  value: number;
  detail: string;
  /** Null when the reader's role cannot act on it: the figure shows, the link does not. */
  href: string | null;
  tone: 'plain' | 'warn' | 'danger';
}) {
  const valueTone =
    tone === 'danger' && value
      ? 'text-red-600'
      : tone === 'warn' && value
        ? 'text-amber-600'
        : 'text-slate-900';

  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#307c4c]/[0.08] text-[#307c4c]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {href && (
          <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#307c4c]" />
        )}
      </div>
      <p className="mt-3 text-[12.5px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-0.5 text-3xl font-bold tracking-tight ${valueTone}`}>{value}</p>
      <p className="mt-1 text-[12px] leading-snug text-slate-500">{detail}</p>
    </>
  );

  const cls =
    'group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors';
  return href ? (
    <Link href={href} className={`${cls} hover:border-[#307c4c]/30`}>
      {body}
    </Link>
  ) : (
    <div className={cls} title="Not part of your role in this country">
      {body}
    </div>
  );
}
