'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getActiveSoaCycle,
  getSoaCountrySchedule,
  getSoaCountryStatusChanges,
  setSoaCountryDeadlines,
  setSoaCountryStatus,
  type CountrySchedule,
  type CountryScheduleRow,
  type CountryStatusChange,
} from '@/app/actions/soa/cycles';
import { COUNTRY_STATUS_OPTIONS } from '@/lib/soa/deadlines';

const BRAND = '#2A7E4F';

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  COUNTRY_STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

const STATUS_TONE: Record<string, string> = {
  not_started: 'bg-slate-100 text-slate-500 border-slate-200',
  in_progress: 'bg-sky-50 text-sky-700 border-sky-200',
  requests_sent: 'bg-sky-50 text-sky-700 border-sky-200',
  reminders_sent: 'bg-amber-50 text-amber-800 border-amber-200',
  consolidating: 'bg-violet-50 text-violet-700 border-violet-200',
  handed_off: 'bg-[#2A7E4F]/10 text-[#2A7E4F] border-[#2A7E4F]/20',
};

const dayLabel = (iso: string) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

/** What the row currently holds in the inputs, which may differ from what is saved. */
interface Draft {
  submission: string;
  close: string;
  status: string;
  reason: string;
}

const draftOf = (r: CountryScheduleRow): Draft => ({
  /* The effective date, not the override, so an inheriting row shows the date it is actually
     working to rather than an empty box. Whether it is an override is carried separately. */
  submission: r.submissionDeadline,
  close: r.cycleDeadline,
  status: r.status ?? '',
  reason: '',
});

/**
 * The per-country schedule: deadlines and status, one row each.
 *
 * Sits under the cycle table, which keeps the cycle-wide control. The two are deliberately
 * both present and do different jobs: moving the cycle moves everybody who has not been given
 * their own dates, and moving a country moves only that country. An admin extending one
 * country should not have to tell the other twelve they have longer.
 *
 * Status is here rather than on its own screen because it answers the same question the dates
 * do — where does this country stand in the quarter — and because the thing it is for, undoing
 * a handoff, is usually followed immediately by extending that country's deadline so it has
 * somewhere to put the work.
 */
export default function SoaCountryScheduleClient() {
  /* Resolved here rather than taken as a prop. The cycle table beside this one already loads
     the list and could pass an id down, but then this section would render empty whenever that
     one had not finished, and the two would have to agree about which cycle is active. Only
     the active cycle can be edited, so asking for it directly is both shorter and the thing
     the actions below will enforce anyway. */
  const [cycleId, setCycleId] = useState<number | null>(null);
  const [data, setData] = useState<CountrySchedule | null>(null);
  const [history, setHistory] = useState<CountryStatusChange[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const cycle = await getActiveSoaCycle();
    if (!cycle) {
      setCycleId(null);
      setData(null);
      setLoading(false);
      return;
    }
    setCycleId(cycle.id);
    const [schedule, changes] = await Promise.all([
      getSoaCountrySchedule(cycle.id),
      getSoaCountryStatusChanges(cycle.id),
    ]);
    setData(schedule);
    setHistory(changes);
    setDrafts(Object.fromEntries(schedule.rows.map((r) => [r.countryId, draftOf(r)])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const historyByCountry = useMemo(() => {
    const map = new Map<string, CountryStatusChange[]>();
    for (const h of history) {
      const list = map.get(h.countryId) ?? [];
      list.push(h);
      map.set(h.countryId, list);
    }
    return map;
  }, [history]);

  const rows = data?.rows ?? [];

  const dirtyOf = (r: CountryScheduleRow) => {
    const d = drafts[r.countryId];
    if (!d) return { dates: false, status: false, any: false };
    const dates = d.submission !== r.submissionDeadline || d.close !== r.cycleDeadline;
    const status = Boolean(r.status) && d.status !== r.status;
    return { dates, status, any: dates || status };
  };

  const edit = (countryId: string, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [countryId]: { ...prev[countryId], ...patch } }));

  async function save(r: CountryScheduleRow) {
    const d = drafts[r.countryId];
    const dirty = dirtyOf(r);
    if (!d || !dirty.any) return;
    setSaving(r.countryId);
    setError('');

    if (dirty.dates) {
      const result = await setSoaCountryDeadlines({
        cycleId: cycleId!,
        countryId: r.countryId,
        /* A date equal to the cycle's is stored as "inherits" rather than as an override that
           happens to match. Otherwise the next cycle-wide move would skip this country for no
           reason anyone could see. */
        submissionDeadline:
          d.submission === data?.cycleSubmissionDeadline ? null : d.submission || null,
        cycleDeadline: d.close === data?.cycleCycleDeadline ? null : d.close || null,
        reason: d.reason,
      });
      if (!result.success) {
        setSaving(null);
        return setError(result.error ?? 'Could not move this country.');
      }
    }

    if (dirty.status) {
      const result = await setSoaCountryStatus({
        cycleId: cycleId!,
        countryId: r.countryId,
        status: d.status,
        reason: d.reason,
      });
      if (!result.success) {
        setSaving(null);
        /* The dates may already have saved. Said plainly rather than silently, because the row
           is about to reload showing one half of what was asked for. */
        return setError(
          dirty.dates
            ? `The dates were saved. The status was not: ${result.error ?? 'unknown error'}`
            : (result.error ?? 'Could not change the status.'),
        );
      }
    }

    setSaving(null);
    await load();
  }

  function resetToCycle(r: CountryScheduleRow) {
    if (!data) return;
    edit(r.countryId, {
      submission: data.cycleSubmissionDeadline,
      close: data.cycleCycleDeadline,
    });
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-[15px] font-bold text-slate-900">Deadlines and status by country</h2>
          <p className="mt-1 max-w-[70ch] text-xs leading-relaxed text-slate-500">
            A country inherits the cycle&apos;s two dates until it is given its own. Changing a date
            here moves only that country — its letters, its upload pages, its countdown and its
            handoff gate. Use the cycle&apos;s own dates above to move everybody at once.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-xs font-semibold text-[#B71C1C]">
          {error}
        </p>
      )}

      {!loading && cycleId === null && (
        <p className="px-5 py-8 text-center text-xs text-slate-400">
          No cycle is open, so there is nothing to schedule. Open one above.
        </p>
      )}

      {data && (
        <p className="border-b border-slate-100 bg-slate-50 px-5 py-2 text-[11px] text-slate-500">
          Cycle dates: collection{' '}
          <span className="font-semibold text-slate-700">
            {dayLabel(data.cycleSubmissionDeadline)}
          </span>
          , closing{' '}
          <span className="font-semibold text-slate-700">{dayLabel(data.cycleCycleDeadline)}</span>.
          A row showing anything else has been given its own.
        </p>
      )}

      <div className={`overflow-x-auto ${cycleId === null ? 'hidden' : ''}`}>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-bold">Country</th>
              <th className="px-4 py-2.5 font-bold">Collection deadline</th>
              <th className="px-4 py-2.5 font-bold">Closing deadline</th>
              <th className="px-4 py-2.5 font-bold">Status</th>
              <th className="px-4 py-2.5 font-bold">Why, and save</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {loading ? 'Loading…' : 'No active countries.'}
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const d = drafts[r.countryId];
              const dirty = dirtyOf(r);
              const busy = saving === r.countryId;
              const changes = historyByCountry.get(r.countryId) ?? [];
              const overridden = r.submissionOverride !== null || r.cycleOverride !== null;
              return (
                <tr
                  key={r.countryId}
                  className={`border-b border-slate-100 align-top ${
                    dirty.any ? 'bg-amber-50/40' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <p className="font-bold text-slate-900">{r.countryName}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      {r.enrolled
                        ? `${r.vendorsInChase} in chase · ${r.sentRequests} written to`
                        : 'Not joined to this cycle yet'}
                    </p>
                    {overridden && (
                      <span className="mt-1 inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-800">
                        Own dates
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={d?.submission ?? ''}
                      disabled={busy}
                      onChange={(e) => edit(r.countryId, { submission: e.target.value })}
                      className={`w-[140px] rounded-md border px-2 py-1 text-xs ${
                        r.submissionOverride
                          ? 'border-amber-300 bg-amber-50 text-slate-900'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    />
                    {r.sentRequests > 0 && (
                      <p className="mt-1 w-[150px] text-[10px] leading-snug text-slate-400">
                        {r.sentRequests} letters carry {dayLabel(r.submissionDeadline)}. Later only.
                      </p>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <input
                      type="date"
                      value={d?.close ?? ''}
                      disabled={busy}
                      onChange={(e) => edit(r.countryId, { close: e.target.value })}
                      className={`w-[140px] rounded-md border px-2 py-1 text-xs ${
                        r.cycleOverride
                          ? 'border-amber-300 bg-amber-50 text-slate-900'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    />
                    {overridden && (
                      <button
                        type="button"
                        onClick={() => resetToCycle(r)}
                        disabled={busy}
                        className="mt-1 block text-[10px] font-semibold text-slate-500 underline"
                      >
                        Back to the cycle dates
                      </button>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {r.enrolled ? (
                      <>
                        <select
                          value={d?.status ?? ''}
                          disabled={busy}
                          onChange={(e) => edit(r.countryId, { status: e.target.value })}
                          className={`w-[150px] rounded-md border px-2 py-1 text-xs ${
                            dirty.status
                              ? 'border-amber-300 bg-amber-50'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        >
                          {COUNTRY_STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} title={o.hint}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                        {r.status === 'handed_off' && !dirty.status && (
                          <p className="mt-1 w-[150px] text-[10px] leading-snug text-slate-400">
                            Closed{r.handedOffAt ? ` ${dayLabel(r.handedOffAt.slice(0, 10))}` : ''}.
                            Uploads are shut; pick another status to reopen.
                          </p>
                        )}
                        {dirty.status && r.status === 'handed_off' && (
                          <p className="mt-1 w-[150px] text-[10px] leading-snug font-semibold text-amber-800">
                            Reopens the country. Collected statements are kept; the handoff stays in
                            the evidence trail.
                          </p>
                        )}
                      </>
                    ) : (
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE.not_started}`}
                      >
                        Not joined
                      </span>
                    )}
                    {changes.length > 0 && (
                      <ul className="mt-1.5 w-[170px] space-y-0.5 border-t border-slate-100 pt-1">
                        {changes.slice(0, 2).map((h) => (
                          <li key={h.changedAt} className="text-[10px] leading-snug text-slate-400">
                            {STATUS_LABEL[h.oldStatus] ?? h.oldStatus} →{' '}
                            {STATUS_LABEL[h.newStatus] ?? h.newStatus} by {h.changedBy}
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {dirty.any ? (
                      <div className="w-[230px] space-y-1.5">
                        <textarea
                          rows={2}
                          value={d?.reason ?? ''}
                          disabled={busy}
                          onChange={(e) => edit(r.countryId, { reason: e.target.value })}
                          placeholder="Reopened to chase eleven more suppliers."
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-800 placeholder:text-slate-400"
                        />
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setDrafts((prev) => ({ ...prev, [r.countryId]: draftOf(r) }))
                            }
                            className="flex-1 rounded-md bg-white px-2 py-1.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={busy || (d?.reason.trim().length ?? 0) < 3}
                            onClick={() => void save(r)}
                            className="flex-[2] rounded-md px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
                            style={{ background: BRAND }}
                          >
                            {busy ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                        <p className="text-[10px] leading-snug text-slate-400">
                          Recorded with your name and written into {r.countryName}&apos;s evidence
                          pack.
                        </p>
                      </div>
                    ) : (
                      <span className="text-[11px] text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
