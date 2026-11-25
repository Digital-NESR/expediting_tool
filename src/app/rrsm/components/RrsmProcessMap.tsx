'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · the process map, for one country.

   Open to close, with only the steps that country runs (its
   Admin → RRSM settings), each coloured by who does it. Pick a
   country; inside RRSM it starts on the country being viewed.
   With no countries to show (the database could not be read),
   the two validation steps become switches instead.
   ───────────────────────────────────────────────────────────── */

import { useMemo, useState } from 'react';
import { ArrowDown, RotateCcw } from 'lucide-react';
import {
  ACTOR_LABEL,
  describeCountry,
  recurrentSteps,
  rentalSteps,
  type ProcessActor,
  type ProcessSettings,
  type ProcessStep,
} from '@/lib/rrsm/process-map';
import type { ProcessCountry } from '@/lib/rrsm/process-countries';

const ACTOR_TONE: Record<ProcessActor, { chip: string; dot: string; card: string }> = {
  buyer: {
    chip: 'bg-[#e6f1ea] text-[#1d4f31]',
    dot: 'bg-[#307c4c]',
    card: 'border-[#cfe3d6]',
  },
  supplier: {
    chip: 'bg-sky-50 text-sky-800',
    dot: 'bg-sky-600',
    card: 'border-sky-200',
  },
  ops: {
    chip: 'bg-amber-50 text-amber-800',
    dot: 'bg-amber-500',
    card: 'border-amber-200',
  },
  requester: {
    chip: 'bg-violet-50 text-violet-800',
    dot: 'bg-violet-500',
    card: 'border-violet-200',
  },
  sap: {
    chip: 'bg-slate-100 text-slate-600',
    dot: 'bg-slate-400',
    card: 'border-dashed border-slate-300',
  },
};

function Flow({ steps }: { steps: ProcessStep[] }) {
  return (
    <ol className="mt-4">
      {steps.map((s, i) => {
        const tone = ACTOR_TONE[s.actor];
        return (
          <li key={s.title} className="relative">
            <div
              className={`flex gap-3 rounded-xl border bg-white px-4 py-3 ${tone.card} ${
                s.optional ? 'border-dashed' : ''
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11.5px] font-bold text-white ${tone.dot}`}
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[14px] font-semibold text-slate-900">{s.title}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${tone.chip}`}
                  >
                    {ACTOR_LABEL[s.actor]}
                  </span>
                  {s.optional && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-500">
                      only if needed
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11.5px] text-slate-500">{s.where}</div>
                <p className="mt-1 text-[12.5px] leading-relaxed text-slate-600">{s.detail}</p>
                {s.loop && (
                  <p className="mt-1.5 flex items-start gap-1.5 rounded-md bg-red-50 px-2 py-1 text-[12px] leading-relaxed text-red-800">
                    <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {s.loop}
                  </p>
                )}
              </div>
            </div>
            {i < steps.length - 1 && (
              <div className="flex justify-center py-1 text-slate-300" aria-hidden>
                <ArrowDown className="h-4 w-4" />
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export default function RrsmProcessMap({
  countries,
  initialCountry,
}: {
  countries: ProcessCountry[];
  /** The country to start on (inside RRSM, the one being viewed). */
  initialCountry?: string | null;
}) {
  const [code, setCode] = useState<string>(
    countries.find((c) => c.code === initialCountry)?.code ??
      countries.find((c) => c.rentals)?.code ??
      countries[0]?.code ??
      '',
  );
  /* Used only when there is no country list to pick from. */
  const [manual, setManual] = useState<ProcessSettings>({
    supplier: true,
    ops: true,
    rentals: true,
    recurrent: false,
    reminders: false,
  });

  const country = countries.find((c) => c.code === code) ?? null;
  const settings: ProcessSettings = country ?? manual;
  const rentals = useMemo(() => rentalSteps(settings), [settings]);
  const recurrent = useMemo(() => recurrentSteps(settings), [settings]);

  return (
    <div className="my-5 rounded-2xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5">
      {countries.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Country">
          {countries.map((c) => (
            <button
              key={c.code}
              type="button"
              role="tab"
              aria-selected={c.code === code}
              onClick={() => setCode(c.code)}
              className={`rounded-full border px-3 py-1 text-[12.5px] font-semibold transition-colors ${
                c.code === code
                  ? 'border-[#307c4c] bg-[#307c4c] text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-[#307c4c]/40'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-4 text-[13px] text-slate-700">
          {(['supplier', 'ops'] as const).map((k) => (
            <label key={k} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={manual[k]}
                onChange={(e) => setManual({ ...manual, [k]: e.target.checked })}
                className="h-4 w-4 accent-[#307c4c]"
              />
              {k === 'supplier' ? 'Supplier validation' : 'Ops validation'}
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 text-[13px] text-slate-700">
        {country && <b className="text-slate-900">{country.name}: </b>}
        {describeCountry(settings)}
      </div>

      {/* Who does what: the colours on the map. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {(Object.keys(ACTOR_LABEL) as ProcessActor[])
          .filter((a) =>
            [...(settings.rentals ? rentals : []), ...(settings.recurrent ? recurrent : [])].some(
              (s) => s.actor === a,
            ),
          )
          .map((a) => (
            <span
              key={a}
              className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${ACTOR_TONE[a].chip}`}
            >
              {ACTOR_LABEL[a]}
            </span>
          ))}
      </div>

      {settings.rentals && (
        <section className="mt-4">
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Rental equipment · every month, 26th to 25th
          </h4>
          <Flow steps={rentals} />
        </section>
      )}
      {settings.recurrent && (
        <section className="mt-6">
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500">
            Recurrent services · each year, by expiry date
          </h4>
          <Flow steps={recurrent} />
        </section>
      )}
      {!settings.rentals && !settings.recurrent && (
        <p className="mt-4 text-[13px] text-slate-500">
          This country has no module switched on yet.
        </p>
      )}
    </div>
  );
}
