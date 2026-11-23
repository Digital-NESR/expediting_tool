'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Recurrent services dashboard.

   Where a country's annual contracts stand: what has expired,
   what is coming up, what the requesters have decided and the
   buyer still has to renew, and who owes a decision.

   Every figure drills down: a tile, a month's bar, a row or a
   single number in the breakdowns opens a pop-up listing the
   services behind it, and each of those opens the service.

   Computed from the same rows the register shows, so the two
   can never disagree.
   ───────────────────────────────────────────────────────────── */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  ArrowRight,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Clock,
  Repeat,
  Send,
  X,
} from 'lucide-react';
import type { RecurrentBoard, RecurrentRow } from '@/app/actions/rrsm/recurrent';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';
import { rrsmHref } from '@/lib/rrsm/nav';
import { DECISION_LABEL, RECURRENT_STATUS_LABEL, type RecurrentStatus } from '@/lib/rrsm/recurrent';

const BRAND = '#307c4c';

const STATUS_TONE: Record<RecurrentStatus, string> = {
  active: 'bg-[#e6f1ea] text-[#1d4f31]',
  due: 'bg-amber-50 text-amber-800',
  expired: 'bg-red-50 text-red-700',
  awaiting_buyer: 'bg-sky-50 text-sky-800',
  cancelled: 'bg-slate-100 text-slate-500',
  no_expiry: 'bg-slate-100 text-slate-500',
};

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
function monthLabel(key: string, long = false): string {
  return new Date(key + '-01T00:00:00Z').toLocaleDateString('en-GB', {
    month: long ? 'long' : 'short',
    year: long ? 'numeric' : '2-digit',
    timeZone: 'UTC',
  });
}

/** What the pop-up shows: a heading and the services behind the figure that was clicked. */
interface Drill {
  title: string;
  rows: RecurrentRow[];
}

interface Group {
  name: string;
  all: RecurrentRow[];
  expired: RecurrentRow[];
  due: RecurrentRow[];
  withBuyer: RecurrentRow[];
}

const byExpiry = (a: RecurrentRow, b: RecurrentRow) =>
  (a.contractExpiry || '9999').localeCompare(b.contractExpiry || '9999');

export default function RecurrentDashboardClient({ board }: { board: RecurrentBoard }) {
  const title = 'Dashboard';
  const [drill, setDrill] = useState<Drill | null>(null);

  const data = useMemo(() => {
    const live = board.rows.filter((r) => r.storedStatus === 'active').sort(byExpiry);
    const expired = live.filter((r) => r.status === 'expired');
    const due = live.filter((r) => r.status === 'due');
    const withBuyer = live.filter((r) => r.status === 'awaiting_buyer');
    const cancelled = board.rows.filter((r) => r.storedStatus === 'cancelled');
    const noExpiry = live.filter((r) => r.status === 'no_expiry');

    /* The next twelve months of expiries, by month, including the current one. */
    const now = new Date();
    const months: { key: string; rows: RecurrentRow[] }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      months.push({ key: d.toISOString().slice(0, 7), rows: [] });
    }
    for (const r of live) {
      if (!r.contractExpiry || (r.daysLeft ?? -1) < 0) continue;
      months.find((x) => x.key === monthKey(r.contractExpiry))?.rows.push(r);
    }

    const group = (key: (r: RecurrentRow) => string): Group[] => {
      const map = new Map<string, Group>();
      for (const r of live) {
        const k = key(r) || '—';
        const g = map.get(k) ?? { name: k, all: [], expired: [], due: [], withBuyer: [] };
        g.all.push(r);
        if (r.status === 'expired') g.expired.push(r);
        if (r.status === 'due') g.due.push(r);
        if (r.status === 'awaiting_buyer') g.withBuyer.push(r);
        map.set(k, g);
      }
      return [...map.values()].sort(
        (a, b) =>
          b.expired.length + b.due.length - (a.expired.length + a.due.length) ||
          b.all.length - a.all.length,
      );
    };

    const values = new Map<string, number>();
    const valuedRows = live.filter((r) => r.annualValue !== null);
    for (const r of valuedRows) {
      const cur = r.currency || '—';
      values.set(cur, (values.get(cur) ?? 0) + (r.annualValue ?? 0));
    }

    return {
      live,
      expired,
      due,
      withBuyer,
      cancelled,
      noExpiry,
      months,
      byDepartment: group((r) => r.department),
      byRequester: group((r) => r.requesterName || r.requesterEmail),
      values: [...values.entries()],
      valuedRows,
    };
  }, [board.rows]);

  if (!board.country) {
    return (
      <RrsmShell scope={board} title={title}>
        <RrsmNoCountry />
      </RrsmShell>
    );
  }
  const country = board.country;
  const href = (path: string) => rrsmHref(path, country.code);
  /** A service's own page: the register, with that service's drawer open. */
  const serviceHref = (id: number) => `${href('/rrsm/recurrent')}&service=${id}`;
  const maxMonth = Math.max(1, ...data.months.map((m) => m.rows.length));
  const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
  const compact = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
  });
  const open = (t: string, rows: RecurrentRow[]) => rows.length && setDrill({ title: t, rows });

  return (
    <RrsmShell
      scope={board}
      title={title}
      subtitle={`Recurrent services for ${country.name}: annual contracts, subscriptions and AMCs, and where their renewals stand. Click any figure to see the services behind it.`}
    >
      {!country.recurrentReminders && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] text-amber-900">
          <BellOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Reminders are switched off for {country.name}, so requesters are not being emailed.
            Correct the expiry dates, then switch reminders on in Admin → RRSM.
          </span>
        </div>
      )}

      {!board.rows.length ? (
        <RrsmEmpty
          title="No recurrent services yet"
          body="Add services on the Recurrent services page."
          action={
            <Link
              href={href('/rrsm/recurrent')}
              className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white"
              style={{ background: BRAND }}
            >
              Go to Recurrent services <ArrowRight className="h-4 w-4" />
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Tile
              icon={Repeat}
              label="Active services"
              value={data.live.length}
              detail={`${data.cancelled.length} cancelled`}
              tone="plain"
              onClick={() => open('Active services', data.live)}
            />
            <Tile
              icon={AlertTriangle}
              label="Expired"
              value={data.expired.length}
              detail="Past their expiry, not renewed"
              tone="danger"
              onClick={() => open('Expired', data.expired)}
            />
            <Tile
              icon={CalendarClock}
              label="Due ≤ 90 days"
              value={data.due.length}
              detail="Requester should decide"
              tone="warn"
              onClick={() => open('Due in the next 90 days', data.due)}
            />
            <Tile
              icon={Send}
              label="With buyer"
              value={data.withBuyer.length}
              detail="Decided, to be renewed"
              tone="info"
              onClick={() => open('Decided, waiting for the buyer', data.withBuyer)}
            />
            <Tile
              icon={CheckCircle2}
              label="Annual value"
              value={null}
              amounts={[...data.values]
                .sort((a, b) => b[1] - a[1])
                .map(([c, v]) => [compact.format(v), c, money.format(v)])}
              detail={
                data.valuedRows.length
                  ? `Recorded on ${data.valuedRows.length} of ${data.live.length}`
                  : 'Not recorded yet'
              }
              tone="plain"
              onClick={() => open('Services with an annual value', data.valuedRows)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Expiring in the next 12 months" icon={Clock}>
              <div className="flex h-40 items-end gap-1.5 pt-2">
                {data.months.map((m) => {
                  const n = m.rows.length;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      disabled={!n}
                      onClick={() => open(`Expiring in ${monthLabel(m.key, true)}`, m.rows)}
                      title={`${monthLabel(m.key, true)}: ${n} service${n === 1 ? '' : 's'}`}
                      className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1 disabled:cursor-default"
                    >
                      <span className="text-[10.5px] font-semibold text-slate-600">{n || ''}</span>
                      <span
                        className={`block w-full rounded-t transition-opacity ${n ? 'group-hover:opacity-80' : ''}`}
                        style={{
                          height: `${Math.round((n / maxMonth) * 104)}px`,
                          minHeight: n ? 4 : 1,
                          background: n ? BRAND : '#e2e8f0',
                        }}
                      />
                      <span className="truncate text-[10px] text-slate-400">
                        {monthLabel(m.key)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {data.noExpiry.length > 0 && (
                <button
                  type="button"
                  onClick={() => open('No expiry date', data.noExpiry)}
                  className="mt-2 text-[11.5px] text-slate-500 underline-offset-2 hover:underline"
                >
                  {data.noExpiry.length} active service(s) have no expiry date.
                </button>
              )}
            </Card>

            <Card title="Decided, waiting for the buyer" icon={Send}>
              {data.withBuyer.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.withBuyer.slice(0, 6).map((r) => (
                    <ServiceLine
                      key={r.id}
                      r={r}
                      href={serviceHref(r.id)}
                      right={r.renewal?.decision ? DECISION_LABEL[r.renewal.decision] : ''}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-slate-400">
                  Nothing waiting on the buyer.
                </p>
              )}
              <SeeAll
                n={data.withBuyer.length}
                shown={6}
                onClick={() => open('Decided, waiting for the buyer', data.withBuyer)}
              />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title={`Due in the next 90 days (${data.due.length})`} icon={CalendarClock}>
              {data.due.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.due.slice(0, 8).map((r) => (
                    <ServiceLine
                      key={r.id}
                      r={r}
                      href={serviceHref(r.id)}
                      right={`in ${r.daysLeft} d`}
                      tone="warn"
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-slate-400">
                  Nothing due in the next 90 days.
                </p>
              )}
              <SeeAll
                n={data.due.length}
                shown={8}
                onClick={() => open('Due in the next 90 days', data.due)}
              />
            </Card>
            <Card title={`Expired (${data.expired.length})`} icon={AlertTriangle}>
              {data.expired.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.expired.slice(0, 8).map((r) => (
                    <ServiceLine
                      key={r.id}
                      r={r}
                      href={serviceHref(r.id)}
                      right={`${-(r.daysLeft ?? 0)} d ago`}
                      tone="danger"
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-slate-400">Nothing expired.</p>
              )}
              <SeeAll
                n={data.expired.length}
                shown={8}
                onClick={() => open('Expired', data.expired)}
              />
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="By department" groups={data.byDepartment} onOpen={open} />
            <Breakdown title="By requester-validator" groups={data.byRequester} onOpen={open} />
          </div>
        </>
      )}

      {drill && (
        <ServicesModal
          drill={drill}
          serviceHref={serviceHref}
          money={money}
          onClose={() => setDrill(null)}
        />
      )}
    </RrsmShell>
  );
}

function SeeAll({ n, shown, onClick }: { n: number; shown: number; onClick: () => void }) {
  if (n <= shown) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1d4f31] hover:underline"
    >
      See all {n} <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  amounts = [],
  detail,
  tone,
  onClick,
}: {
  icon: typeof Repeat;
  label: string;
  value: number | null;
  /** Money per currency, largest first, as [short, currency, exact]: the first is the headline. */
  amounts?: [string, string, string][];
  detail: string;
  tone: 'plain' | 'warn' | 'danger' | 'info';
  onClick: () => void;
}) {
  const valueTone =
    value && tone === 'danger'
      ? 'text-red-600'
      : value && tone === 'warn'
        ? 'text-amber-600'
        : value && tone === 'info'
          ? 'text-sky-700'
          : 'text-slate-900';
  return (
    <button
      type="button"
      onClick={onClick}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-[#307c4c]/30"
    >
      <div className="flex items-center justify-between">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#307c4c]/[0.08] text-[#307c4c]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <ArrowRight className="h-4 w-4 text-slate-300 transition-colors group-hover:text-[#307c4c]" />
      </div>
      <p className="mt-3 text-[12.5px] font-semibold text-slate-500">{label}</p>
      {value !== null ? (
        <p className={`mt-0.5 text-3xl font-bold tracking-tight ${valueTone}`}>{value}</p>
      ) : amounts.length ? (
        <>
          <p
            className="mt-0.5 truncate text-3xl font-bold tracking-tight text-slate-900"
            title={`${amounts[0][2]} ${amounts[0][1]}`}
          >
            {amounts[0][0]}
            <span className="ml-1 text-[13px] font-semibold tracking-normal text-slate-400">
              {amounts[0][1]}
            </span>
          </p>
          {amounts.slice(1).map(([n, c, exact]) => (
            <p key={c} className="text-[13px] font-semibold text-slate-600" title={`${exact} ${c}`}>
              + {n} <span className="font-medium text-slate-400">{c}</span>
            </p>
          ))}
        </>
      ) : (
        <p className="mt-0.5 text-3xl font-bold tracking-tight text-slate-300">—</p>
      )}
      <p className="mt-1 text-[12px] leading-snug text-slate-500">{detail}</p>
    </button>
  );
}

function Card({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof Repeat;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900">
        <Icon className="h-4 w-4 text-[#307c4c]" /> {title}
      </h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function ServiceLine({
  r,
  href,
  right,
  tone,
}: {
  r: RecurrentRow;
  href: string;
  right: string;
  tone?: 'warn' | 'danger';
}) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 py-2 text-[13px] hover:bg-slate-50/70">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-800">
            {r.serviceName || r.description}
          </span>
          <span className="block truncate text-[11.5px] text-slate-500">
            {[r.supplierName, r.requesterName].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[11.5px] text-slate-500">{r.contractExpiry}</span>
        <span
          className={`shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${
            tone === 'danger'
              ? 'bg-red-50 text-red-700'
              : tone === 'warn'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-sky-50 text-sky-800'
          }`}
        >
          {right}
        </span>
      </Link>
    </li>
  );
}

/** One breakdown table. The name opens all of that group's services; each number its subset. */
function Breakdown({
  title,
  groups,
  onOpen,
}: {
  title: string;
  groups: Group[];
  onOpen: (title: string, rows: RecurrentRow[]) => void;
}) {
  const cell = (g: Group, rows: RecurrentRow[], what: string, tone: string, pad = 'px-2') => (
    <td className={`${pad} py-1.5 text-right`}>
      {rows.length ? (
        <button
          type="button"
          onClick={() => onOpen(`${g.name} · ${what}`, rows)}
          className={`rounded px-1.5 py-0.5 font-mono font-semibold hover:bg-slate-100 ${tone}`}
        >
          {rows.length}
        </button>
      ) : (
        <span className="px-1.5 font-mono text-slate-300">0</span>
      )}
    </td>
  );
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-100 px-4 py-3 text-[13.5px] font-semibold text-slate-900">
        {title}
      </h2>
      <table className="w-full table-fixed text-[13px]">
        <colgroup>
          <col />
          <col className="w-16" />
          <col className="w-20" />
          <col className="w-16" />
          <col className="w-24" />
        </colgroup>
        <thead>
          <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
            <th className="px-4 py-2 text-left font-semibold">Name</th>
            <th className="px-2 py-2 text-right font-semibold">Active</th>
            <th className="px-2 py-2 text-right font-semibold">Expired</th>
            <th className="px-2 py-2 text-right font-semibold">Due</th>
            <th className="px-3 py-2 text-right font-semibold">With buyer</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.name} className="border-t border-slate-100 hover:bg-slate-50/60">
              <td className="px-4 py-1.5">
                <button
                  type="button"
                  onClick={() => onOpen(g.name, g.all)}
                  className="block w-full truncate text-left text-slate-700 hover:text-[#1d4f31] hover:underline"
                  title={`Show ${g.name}'s ${g.all.length} services`}
                >
                  {g.name}
                </button>
              </td>
              {cell(g, g.all, 'active', 'text-slate-700')}
              {cell(g, g.expired, 'expired', 'text-red-600')}
              {cell(g, g.due, 'due in 90 days', 'text-amber-600')}
              {cell(g, g.withBuyer, 'with buyer', 'text-sky-700', 'px-3')}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** The drill-down: every service behind the figure, each opening the service itself. */
function ServicesModal({
  drill,
  serviceHref,
  money,
  onClose,
}: {
  drill: Drill;
  serviceHref: (id: number) => string;
  money: Intl.NumberFormat;
  onClose: () => void;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 p-4 pt-[8vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={drill.title}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
          <h2 className="text-[15px] font-semibold text-slate-900">
            {drill.title}{' '}
            <span className="font-normal text-slate-400">
              · {drill.rows.length} service{drill.rows.length === 1 ? '' : 's'}
            </span>
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-auto">
          <table className="w-full min-w-[48rem] table-fixed text-[13px]">
            <colgroup>
              <col />
              <col className="w-[12rem]" />
              <col className="w-36" />
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-36" />
            </colgroup>
            <thead className="sticky top-0">
              <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                <th className="px-4 py-2 text-left font-semibold">Service</th>
                <th className="px-3 py-2 text-left font-semibold">Supplier</th>
                <th className="px-3 py-2 text-left font-semibold">Requester</th>
                <th className="px-3 py-2 text-left font-semibold">Expiry</th>
                <th className="px-3 py-2 text-right font-semibold">Value</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {drill.rows.map((r) => (
                <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                  <td className="px-4 py-2">
                    <Link
                      href={serviceHref(r.id)}
                      className="block truncate font-medium text-[#1d4f31] hover:underline"
                      title={r.description}
                    >
                      {r.serviceName || r.description}
                    </Link>
                    <div className="truncate text-[11px] text-slate-400">{r.department || '—'}</div>
                  </td>
                  <td className="truncate px-3 py-2 text-slate-600" title={r.supplierName}>
                    {r.supplierName || '—'}
                  </td>
                  <td className="truncate px-3 py-2 text-slate-600" title={r.requesterEmail}>
                    {r.requesterName || r.requesterEmail || '—'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[12px] text-slate-700">
                    {r.contractExpiry || '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] text-slate-700">
                    {r.annualValue === null ? '—' : `${money.format(r.annualValue)} ${r.currency}`}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${STATUS_TONE[r.status]}`}
                    >
                      {RECURRENT_STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>,
    document.body,
  );
}
