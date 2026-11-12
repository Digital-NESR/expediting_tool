'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { closeIcsaCycle, createIcsaCycle, updateIcsaCycle } from '@/app/actions/icsa/cycles';
import { enrollIcsaCountry } from '@/app/actions/icsa/enrollments';
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

export function EnrollButton({ cycleId, country }: { cycleId: number; country: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        className={BTN}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          const res = await enrollIcsaCountry(cycleId, country);
          setBusy(false);
          if (!res.success) return setError(res.error ?? 'Could not enrol.');
          router.push(`/icsa/enrollments/${res.data!.id}`);
        }}
      >
        {busy ? 'Enrolling…' : `Enrol ${country}`}
      </button>
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
