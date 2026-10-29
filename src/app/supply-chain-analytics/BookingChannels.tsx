'use client';

import { AlertTriangle } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChannelBand } from '@/lib/travel-analytics/queries';

const COLOURS: Record<string, string> = {
  BTO: '#307c4c',
  OFF: '#C2410C',
  Other: '#64748b',
};

const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const usdExact = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (num: number, den: number) => (den === 0 ? '—' : `${Math.round((num / den) * 100)}%`);

/**
 * Booked in the portal, or booked offline and entered afterwards.
 *
 * `BTO` codes come from the Travel Portal itself; `OFF` codes are trips arranged over email and
 * recorded later. Everything downstream of the portal — the policy engine and the cheapest-fare
 * comparison — only ever sees the portal's own bookings.
 *
 * Which is the whole reason this screen exists, and the reason for the warning it carries. Read
 * naively, the table says the offline channel has no policy violations and no missed savings:
 * a perfect record. It has no record at all. Nothing checked those trips, so nothing could find
 * anything wrong with them, and presenting that as compliance would be the single most
 * misleading number on this board.
 */
export default function BookingChannels({ band }: { band: ChannelBand }) {
  if (band.rows.length === 0) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">How trips were booked</h3>
        <p className="py-8 text-center text-sm text-slate-400">Nothing in scope.</p>
      </section>
    );
  }

  const totalBookings = band.rows.reduce((s, r) => s + r.bookings, 0);
  const unchecked = band.rows.filter((r) => band.uncheckedChannels.includes(r.channel));
  const channels = band.rows.map((r) => r.channel);

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h3 className="text-sm font-bold text-slate-900">How trips were booked</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          BTO is booked in the Travel Portal. OFF is arranged offline over email and entered
          afterwards.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {band.rows.map((row) => {
          const isUnchecked = band.uncheckedChannels.includes(row.channel);
          return (
            <div
              key={row.channel}
              className="rounded-xl border border-slate-200 p-3"
              style={{ borderTopColor: COLOURS[row.channel] ?? '#64748b', borderTopWidth: 3 }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                  {row.channel}
                </span>
                <span className="text-[11px] text-slate-400">
                  {pct(row.bookings, totalBookings)} of trips
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-slate-600">{row.label}</p>
              <p className="mt-2 text-xl font-bold tabular-nums text-slate-900">
                {usd(row.spendUsd)}
              </p>
              <dl className="mt-2 space-y-1 text-[12px]">
                <Row label="Bookings" value={row.bookings.toLocaleString()} />
                <Row
                  label="Average ticket"
                  value={row.averageTicketUsd === null ? '—' : usdExact(row.averageTicketUsd)}
                  note={`over ${row.pricedBookings} priced`}
                />
                <Row
                  label="Policy flags"
                  value={isUnchecked ? 'Not checked' : row.flaggedBookings.toLocaleString()}
                  muted={isUnchecked}
                />
                <Row
                  label="Savings analysed"
                  value={
                    row.savingsCovered === 0
                      ? 'None'
                      : `${row.savingsCovered} · ${usd(row.missedSavingsUsd)} missed`
                  }
                  muted={row.savingsCovered === 0}
                />
              </dl>
            </div>
          );
        })}
      </div>

      {unchecked.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] leading-relaxed text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <strong>
              {unchecked.map((r) => r.channel).join(' and ')} shows zero policy violations and zero
              savings analysis — because nothing examined {unchecked.length === 1 ? 'it' : 'them'}.
            </strong>{' '}
            The policy engine and the cheapest-fare comparison run inside the Travel Portal, so a
            trip booked outside it is never tested. That is{' '}
            {unchecked.reduce((s, r) => s + r.bookings, 0)} of {totalBookings} bookings and{' '}
            {usd(unchecked.reduce((s, r) => s + r.spendUsd, 0))} of spend with no compliance record
            at all. Do not read the empty column as a clean one.
          </span>
        </div>
      )}

      {band.byMonth.length > 1 && (
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Trips per month by channel
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={band.byMonth} margin={{ top: 16, right: 10, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} allowDecimals={false} width={34} />
              <Tooltip />
              <Legend />
              {channels.map((channel, i) => (
                <Bar
                  key={channel}
                  dataKey={`counts.${channel}`}
                  name={channel}
                  stackId="a"
                  fill={COLOURS[channel] ?? '#64748b'}
                  radius={i === channels.length - 1 ? [4, 4, 0, 0] : undefined}
                >
                  <LabelList
                    dataKey={`counts.${channel}`}
                    position="inside"
                    fontSize={10}
                    fill="#ffffff"
                    formatter={(v: unknown) => (Number(v) > 0 ? String(v) : '')}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

function Row({
  label,
  value,
  note,
  muted,
}: {
  label: string;
  value: string;
  note?: string;
  muted?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-slate-500">{label}</dt>
      <dd
        className={`tabular-nums ${muted ? 'italic text-slate-400' : 'font-medium text-slate-800'}`}
      >
        {value}
        {note && <span className="ml-1 font-normal text-slate-400">{note}</span>}
      </dd>
    </div>
  );
}
