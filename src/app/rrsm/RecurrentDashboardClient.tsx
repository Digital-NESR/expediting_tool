'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Recurrent services dashboard.

   Where a country's annual contracts stand: what has expired,
   what is coming up, what the requesters have decided and the
   buyer still has to renew, and who owes a decision. Every
   figure links to the Recurrent services page.

   Computed from the same rows the register shows, so the two
   can never disagree.
   ───────────────────────────────────────────────────────────── */

import Link from 'next/link';
import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BellOff,
  CalendarClock,
  CheckCircle2,
  Clock,
  Repeat,
  Send,
} from 'lucide-react';
import type { RecurrentBoard, RecurrentRow } from '@/app/actions/rrsm/recurrent';
import RrsmShell, { RrsmEmpty, RrsmNoCountry } from './components/RrsmShell';
import { rrsmHref } from '@/lib/rrsm/nav';
import { DECISION_LABEL } from '@/lib/rrsm/recurrent';

const BRAND = '#307c4c';

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}
function monthLabel(key: string): string {
  return new Date(key + '-01T00:00:00Z').toLocaleDateString('en-GB', {
    month: 'short',
    year: '2-digit',
    timeZone: 'UTC',
  });
}

export default function RecurrentDashboardClient({ board }: { board: RecurrentBoard }) {
  const title = 'Dashboard';

  const data = useMemo(() => {
    const live = board.rows.filter((r) => r.storedStatus === 'active');
    const expired = live.filter((r) => r.status === 'expired');
    const due = live.filter((r) => r.status === 'due');
    const withBuyer = live.filter((r) => r.status === 'awaiting_buyer');
    const cancelled = board.rows.filter((r) => r.storedStatus === 'cancelled');
    const noExpiry = live.filter((r) => r.status === 'no_expiry');

    /* The next twelve months of expiries, by month, including the current one. */
    const now = new Date();
    const months: { key: string; count: number }[] = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1));
      months.push({ key: d.toISOString().slice(0, 7), count: 0 });
    }
    for (const r of live) {
      if (!r.contractExpiry || (r.daysLeft ?? -1) < 0) continue;
      const m = months.find((x) => x.key === monthKey(r.contractExpiry));
      if (m) m.count++;
    }

    const group = (key: (r: RecurrentRow) => string) => {
      const map = new Map<
        string,
        { name: string; total: number; expired: number; due: number; withBuyer: number }
      >();
      for (const r of live) {
        const k = key(r) || '—';
        const g = map.get(k) ?? { name: k, total: 0, expired: 0, due: 0, withBuyer: 0 };
        g.total++;
        if (r.status === 'expired') g.expired++;
        if (r.status === 'due') g.due++;
        if (r.status === 'awaiting_buyer') g.withBuyer++;
        map.set(k, g);
      }
      return [...map.values()].sort(
        (a, b) => b.expired + b.due - (a.expired + a.due) || b.total - a.total,
      );
    };

    const values = new Map<string, number>();
    let valued = 0;
    for (const r of live) {
      if (r.annualValue === null) continue;
      valued++;
      const cur = r.currency || '—';
      values.set(cur, (values.get(cur) ?? 0) + r.annualValue);
    }

    return {
      live,
      expired: [...expired].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
      due: [...due].sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
      withBuyer,
      cancelled,
      noExpiry,
      months,
      byDepartment: group((r) => r.department),
      byRequester: group((r) => r.requesterName || r.requesterEmail),
      values: [...values.entries()],
      valued,
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
  const maxMonth = Math.max(1, ...data.months.map((m) => m.count));
  const money = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });

  return (
    <RrsmShell
      scope={board}
      title={title}
      subtitle={`Recurrent services for ${country.name}: annual contracts, subscriptions and AMCs, and where their renewals stand.`}
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
              href={href('/rrsm/recurrent')}
              tone="plain"
            />
            <Tile
              icon={AlertTriangle}
              label="Expired"
              value={data.expired.length}
              detail="Past their expiry, not renewed"
              href={href('/rrsm/recurrent')}
              tone="danger"
            />
            <Tile
              icon={CalendarClock}
              label="Due ≤ 90 days"
              value={data.due.length}
              detail="Requester should decide"
              href={href('/rrsm/recurrent')}
              tone="warn"
            />
            <Tile
              icon={Send}
              label="With buyer"
              value={data.withBuyer.length}
              detail="Decided, to be renewed"
              href={href('/rrsm/recurrent')}
              tone="info"
            />
            <Tile
              icon={CheckCircle2}
              label="Annual value"
              value={null}
              text={
                data.values.length
                  ? data.values.map(([c, v]) => `${money.format(v)} ${c}`).join(' · ')
                  : '—'
              }
              detail={
                data.valued
                  ? `Recorded on ${data.valued} of ${data.live.length}`
                  : 'Not recorded yet'
              }
              href={href('/rrsm/recurrent')}
              tone="plain"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Expiring in the next 12 months" icon={Clock}>
              <div className="flex h-40 items-end gap-1.5 pt-2">
                {data.months.map((m) => (
                  <div
                    key={m.key}
                    className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
                  >
                    <span className="text-[10.5px] font-semibold text-slate-600">
                      {m.count || ''}
                    </span>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${Math.round((m.count / maxMonth) * 104)}px`,
                        minHeight: m.count ? 4 : 1,
                        background: m.count ? BRAND : '#e2e8f0',
                      }}
                      title={`${monthLabel(m.key)}: ${m.count}`}
                    />
                    <span className="truncate text-[10px] text-slate-400">{monthLabel(m.key)}</span>
                  </div>
                ))}
              </div>
              {data.noExpiry.length > 0 && (
                <p className="mt-2 text-[11.5px] text-slate-500">
                  {data.noExpiry.length} active service(s) have no expiry date.
                </p>
              )}
            </Card>

            <Card title="Decided, waiting for the buyer" icon={Send}>
              {data.withBuyer.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.withBuyer.slice(0, 6).map((r) => (
                    <ServiceLine
                      key={r.id}
                      r={r}
                      href={href('/rrsm/recurrent')}
                      right={r.renewal?.decision ? DECISION_LABEL[r.renewal.decision] : ''}
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-slate-400">
                  Nothing waiting on the buyer.
                </p>
              )}
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
                      href={href('/rrsm/recurrent')}
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
            </Card>
            <Card title={`Expired (${data.expired.length})`} icon={AlertTriangle}>
              {data.expired.length ? (
                <ul className="divide-y divide-slate-100">
                  {data.expired.slice(0, 8).map((r) => (
                    <ServiceLine
                      key={r.id}
                      r={r}
                      href={href('/rrsm/recurrent')}
                      right={`${-(r.daysLeft ?? 0)} d ago`}
                      tone="danger"
                    />
                  ))}
                </ul>
              ) : (
                <p className="py-6 text-center text-[13px] text-slate-400">Nothing expired.</p>
              )}
              {data.expired.length > 8 && (
                <Link
                  href={href('/rrsm/recurrent')}
                  className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1d4f31] hover:underline"
                >
                  See all {data.expired.length} <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Breakdown title="By department" rows={data.byDepartment} />
            <Breakdown title="By requester-validator" rows={data.byRequester} />
          </div>
        </>
      )}
    </RrsmShell>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  text,
  detail,
  href,
  tone,
}: {
  icon: typeof Repeat;
  label: string;
  value: number | null;
  text?: string;
  detail: string;
  href: string;
  tone: 'plain' | 'warn' | 'danger' | 'info';
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
    <Link
      href={href}
      className="group block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-[#307c4c]/30"
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
      ) : (
        <p
          className="mt-1.5 truncate text-[17px] font-bold tracking-tight text-slate-900"
          title={text}
        >
          {text}
        </p>
      )}
      <p className="mt-1 text-[12px] leading-snug text-slate-500">{detail}</p>
    </Link>
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

function Breakdown({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; total: number; expired: number; due: number; withBuyer: number }[];
}) {
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
          <col className="w-20" />
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
          {rows.map((g) => (
            <tr key={g.name} className="border-t border-slate-100">
              <td className="truncate px-4 py-2 text-slate-700" title={g.name}>
                {g.name}
              </td>
              <td className="px-2 py-2 text-right font-mono text-slate-700">{g.total}</td>
              <td
                className={`px-2 py-2 text-right font-mono ${g.expired ? 'font-semibold text-red-600' : 'text-slate-300'}`}
              >
                {g.expired}
              </td>
              <td
                className={`px-2 py-2 text-right font-mono ${g.due ? 'font-semibold text-amber-600' : 'text-slate-300'}`}
              >
                {g.due}
              </td>
              <td
                className={`px-3 py-2 text-right font-mono ${g.withBuyer ? 'font-semibold text-sky-700' : 'text-slate-300'}`}
              >
                {g.withBuyer}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
