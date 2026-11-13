'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { closeIcsaCycle, createIcsaCycle, updateIcsaCycle } from '@/app/actions/icsa/cycles';
import { assignIcsaCountries } from '@/app/actions/icsa/enrollments';
import { FREQUENCIES, FREQUENCY_LABEL, type IcsaFrequency } from '@/lib/icsa/model';
import { BTN, BTN_DANGER, BTN_QUIET, Banner, CARD, INPUT, LABEL } from '../components/ui';

/** Suggest a label and period from the frequency, so the common case is two clicks. */
function suggest(freq: IcsaFrequency): { label: string; start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (freq === 'quarterly') {
    const q = Math.floor(m / 3);
    return {
      label: `Q${q + 1} ${y}`,
      start: iso(new Date(y, q * 3, 1)),
      end: iso(new Date(y, q * 3 + 3, 0)),
    };
  }
  if (freq === 'half-yearly') {
    const h = m < 6 ? 0 : 1;
    return {
      label: `H${h + 1} ${y}`,
      start: iso(new Date(y, h * 6, 1)),
      end: iso(new Date(y, h * 6 + 6, 0)),
    };
  }
  if (freq === 'yearly') return { label: `FY ${y}`, start: `${y}-01-01`, end: `${y}-12-31` };
  if (freq === 'monthly') {
    const name = now.toLocaleString('en-GB', { month: 'short' });
    return {
      label: `${name} ${y}`,
      start: iso(new Date(y, m, 1)),
      end: iso(new Date(y, m + 1, 0)),
    };
  }
  return { label: '', start: '', end: '' };
}

export function NewCycleForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const initial = suggest('quarterly');
  const [f, setF] = useState({
    frequency: 'quarterly' as IcsaFrequency,
    label: initial.label,
    periodStart: initial.start,
    periodEnd: initial.end,
    deadline: '',
    thresholdPct: 70,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open) {
    return (
      <button className={BTN} onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Open a cycle
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await createIcsaCycle({ ...f, thresholdPct: Number(f.thresholdPct) });
    setBusy(false);
    if (!res.success) return setError(res.error ?? 'Could not open the cycle.');
    setOpen(false);
    router.push(`/icsa/cycles/${res.data!.id}`);
  }

  return (
    <form onSubmit={submit} className={`${CARD} mb-6 w-full p-5`}>
      <h2 className="font-bold text-slate-800">Open a cycle</h2>
      <p className="mt-1 text-sm text-slate-500">
        A cycle is a single run. When it ends, open the next one here; nothing repeats on its own.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor="c-freq">
            Frequency
          </label>
          <select
            id="c-freq"
            className={INPUT}
            value={f.frequency}
            onChange={(e) => {
              const freq = e.target.value as IcsaFrequency;
              const s = suggest(freq);
              setF({
                ...f,
                frequency: freq,
                label: s.label || f.label,
                periodStart: s.start || f.periodStart,
                periodEnd: s.end || f.periodEnd,
              });
            }}
          >
            {FREQUENCIES.map((x) => (
              <option key={x} value={x}>
                {FREQUENCY_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="c-label">
            Label
          </label>
          <input
            id="c-label"
            className={INPUT}
            value={f.label}
            onChange={(e) => setF({ ...f, label: e.target.value })}
            placeholder="Q1 2027"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="c-thr">
            Completion threshold (%)
          </label>
          <input
            id="c-thr"
            type="number"
            min={1}
            max={100}
            className={INPUT}
            value={f.thresholdPct}
            onChange={(e) => setF({ ...f, thresholdPct: Number(e.target.value) })}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="c-start">
            Period start
          </label>
          <input
            id="c-start"
            type="date"
            className={INPUT}
            value={f.periodStart}
            onChange={(e) => setF({ ...f, periodStart: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="c-end">
            Period end
          </label>
          <input
            id="c-end"
            type="date"
            className={INPUT}
            value={f.periodEnd}
            onChange={(e) => setF({ ...f, periodEnd: e.target.value })}
          />
        </div>
        <div>
          <label className={LABEL} htmlFor="c-dl">
            Cycle deadline
          </label>
          <input
            id="c-dl"
            type="date"
            className={INPUT}
            value={f.deadline}
            onChange={(e) => setF({ ...f, deadline: e.target.value })}
          />
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Champions can close their country once {f.thresholdPct || '…'}% of the people they asked
        have submitted. A country still open after the deadline, without an approved extension, is
        force-closed and everyone who had not submitted is recorded as not completed.
      </p>
      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="mt-4 flex gap-2">
        <button className={BTN} disabled={busy}>
          {busy ? 'Opening…' : 'Open cycle'}
        </button>
        <button type="button" className={BTN_QUIET} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CycleAdminActions({
  cycleId,
  deadline,
  thresholdPct,
}: {
  cycleId: number;
  deadline: string;
  thresholdPct: number;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<'none' | 'edit' | 'close'>('none');
  const [d, setD] = useState(deadline);
  const [t, setT] = useState(thresholdPct);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setError(null);
    const res =
      mode === 'edit'
        ? await updateIcsaCycle(cycleId, { deadline: d, thresholdPct: Number(t), reason })
        : await closeIcsaCycle(cycleId, reason);
    setBusy(false);
    if (!res.success) return setError(res.error ?? 'That did not work.');
    setMode('none');
    setReason('');
    router.refresh();
  }

  if (mode === 'none') {
    return (
      <>
        <button className={BTN_QUIET} onClick={() => setMode('edit')}>
          Change deadline or threshold
        </button>
        <button className={BTN_DANGER} onClick={() => setMode('close')}>
          Close cycle
        </button>
      </>
    );
  }
  return (
    <div className={`${CARD} w-full p-4 sm:w-[420px]`}>
      <h3 className="font-bold text-slate-800">
        {mode === 'edit' ? 'Change the cycle' : 'Close the whole cycle'}
      </h3>
      {mode === 'edit' ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL} htmlFor="e-dl">
              Deadline
            </label>
            <input
              id="e-dl"
              type="date"
              className={INPUT}
              value={d}
              onChange={(e) => setD(e.target.value)}
            />
          </div>
          <div>
            <label className={LABEL} htmlFor="e-thr">
              Threshold (%)
            </label>
            <input
              id="e-thr"
              type="number"
              min={1}
              max={100}
              className={INPUT}
              value={t}
              onChange={(e) => setT(Number(e.target.value))}
            />
          </div>
        </div>
      ) : (
        <p className="mt-2 text-sm text-slate-600">
          Every country still open closes now, and anyone who has not submitted is recorded as not
          completed.
        </p>
      )}
      <label className={`${LABEL} mt-3`} htmlFor="e-reason">
        Reason
      </label>
      <input
        id="e-reason"
        className={INPUT}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button className={mode === 'edit' ? BTN : BTN_DANGER} disabled={busy} onClick={run}>
          {busy ? 'Saving…' : mode === 'edit' ? 'Save' : 'Close cycle'}
        </button>
        <button className={BTN_QUIET} onClick={() => setMode('none')}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export interface AssignableCountry {
  country: string;
  champions: { email: string; name: string | null }[];
}

/**
 * Administrator: put countries into this cycle. Each needs a champion from the Administration
 * page; that champion is emailed and nominates the respondents.
 */
export function AssignCountries({
  cycleId,
  countries,
}: {
  cycleId: number;
  countries: AssignableCountry[];
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn' | 'error'; text: string } | null>(null);
  const ready = countries.filter((c) => c.champions.length);
  const missing = countries.filter((c) => !c.champions.length);
  const chosen = Object.entries(picked);

  async function assign() {
    setBusy(true);
    setMsg(null);
    const res = await assignIcsaCountries(
      cycleId,
      chosen.map(([country, championEmail]) => ({ country, championEmail })),
    );
    setBusy(false);
    if (!res.success) return setMsg({ tone: 'error', text: res.error ?? 'That did not work.' });
    const d = res.data!;
    const parts = [`${d.assigned} ${d.assigned === 1 ? 'country' : 'countries'} added.`];
    if (d.skipped.length) parts.push(`Skipped: ${d.skipped.join('; ')}.`);
    if (d.emailError) parts.push(`Champions were not all emailed: ${d.emailError}`);
    else parts.push('Their champions have been emailed.');
    setMsg({ tone: d.emailError || d.skipped.length ? 'warn' : 'ok', text: parts.join(' ') });
    setPicked({});
    router.refresh();
  }

  return (
    <div className={`${CARD} mb-6 p-5`}>
      <h2 className="font-bold text-slate-800">Assign countries</h2>
      <p className="mt-1 text-sm text-slate-500">
        Tick the countries taking part in this cycle. Each country&apos;s champion is emailed, sees
        the cycle on their Cycles page and chooses the respondents.
      </p>
      {ready.length > 0 ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {ready.map((c) => {
            const on = c.country in picked;
            return (
              <div
                key={c.country}
                className={`rounded-lg border p-3 ${on ? 'border-[#307c4c] bg-[#307c4c]/5' : 'border-slate-200'}`}
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) =>
                      setPicked((prev) => {
                        const next = { ...prev };
                        if (e.target.checked) next[c.country] = c.champions[0].email;
                        else delete next[c.country];
                        return next;
                      })
                    }
                  />
                  {c.country}
                </label>
                {c.champions.length === 1 ? (
                  <p className="mt-1 pl-6 text-xs text-slate-500">
                    Champion: {c.champions[0].name || c.champions[0].email}
                  </p>
                ) : (
                  <select
                    aria-label={`Champion for ${c.country}`}
                    className={`${INPUT} mt-2 py-1.5 text-xs`}
                    value={picked[c.country] ?? c.champions[0].email}
                    disabled={!on}
                    onChange={(e) =>
                      setPicked((prev) => ({ ...prev, [c.country]: e.target.value }))
                    }
                  >
                    {c.champions.map((ch) => (
                      <option key={ch.email} value={ch.email}>
                        {ch.name || ch.email}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="mt-3 text-sm text-slate-500">
          Every country with a champion is already in this cycle.
        </p>
      )}
      {missing.length > 0 && (
        <p className="mt-3 text-xs text-slate-500">
          No champion yet, so they cannot be added: {missing.map((c) => c.country).join(', ')}. Add
          champions on the Administration page.
        </p>
      )}
      {msg && (
        <div className="mt-3">
          <Banner tone={msg.tone}>{msg.text}</Banner>
        </div>
      )}
      {ready.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button className={BTN} disabled={busy || !chosen.length} onClick={assign}>
            {busy
              ? 'Assigning…'
              : chosen.length
                ? `Assign ${chosen.length} ${chosen.length === 1 ? 'country' : 'countries'}`
                : 'Assign countries'}
          </button>
          {ready.length > 1 && (
            <button
              type="button"
              className={BTN_QUIET}
              onClick={() =>
                setPicked(
                  chosen.length === ready.length
                    ? {}
                    : Object.fromEntries(
                        ready.map((c) => [c.country, picked[c.country] ?? c.champions[0].email]),
                      ),
                )
              }
            >
              {chosen.length === ready.length ? 'Clear' : 'Select all'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
