'use client';

/*
 * What somebody without an RRSM grant sees: a request for buyer access in a country they pick,
 * and what they have already asked for. An RRSM admin decides in Admin -> RRSM -> Access requests.
 */

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, Clock, Forklift, Loader2, X } from 'lucide-react';
import {
  getRrsmRequestForm,
  requestRrsmAccess,
  type MyRrsmRequest,
  type RrsmRequestableCountry,
} from '@/app/actions/rrsm/access-requests';

const BRAND = '#307c4c';

export default function RrsmRequestAccess() {
  const [countries, setCountries] = useState<RrsmRequestableCountry[] | null>(null);
  const [mine, setMine] = useState<MyRrsmRequest[]>([]);
  const [country, setCountry] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function load() {
    const f = await getRrsmRequestForm();
    setCountries(f.countries);
    setMine(f.mine);
  }
  useEffect(() => {
    let live = true;
    void getRrsmRequestForm().then((f) => {
      if (!live) return;
      setCountries(f.countries);
      setMine(f.mine);
    });
    return () => {
      live = false;
    };
  }, []);

  const pending = mine.filter((m) => m.status === 'pending');

  async function submit() {
    setBusy(true);
    setError('');
    const r = await requestRrsmAccess({ countryCode: country, reason });
    if (!r.success) setError(r.error ?? 'That did not work.');
    else {
      setSent(true);
      setCountry('');
      setReason('');
      await load();
    }
    setBusy(false);
  }

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-50 px-5 py-10 font-sans">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: `${BRAND}1a` }}
          >
            <Forklift className="h-5 w-5" style={{ color: BRAND }} />
          </span>
          <div>
            <h1 className="text-[17px] font-semibold text-slate-900">Request access to RRSM</h1>
            <p className="text-[12.5px] text-slate-500">
              Rental &amp; Recurrent Services Management
            </p>
          </div>
        </div>

        <p className="mt-4 text-[13.5px] leading-relaxed text-slate-600">
          RRSM is granted per country. Ask for <b>buyer</b> access in the country you work in; an
          RRSM administrator will approve it and you will be emailed.
        </p>

        {pending.length > 0 && (
          <div className="mt-4 space-y-1.5">
            {pending.map((p) => (
              <div
                key={p.countryCode}
                className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
              >
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  Buyer access for <b>{p.countryName}</b> requested on {p.requestedAt}, waiting for
                  an admin.
                </span>
              </div>
            ))}
          </div>
        )}
        {mine
          .filter((m) => m.status === 'rejected')
          .slice(0, 2)
          .map((m) => (
            <div
              key={m.countryCode + m.requestedAt}
              className="mt-2 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12.5px] text-red-700"
            >
              <X className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Your request for {m.countryName} ({m.requestedAt}) was not approved.
                {m.decisionNote && <> “{m.decisionNote}”</>}
              </span>
            </div>
          ))}
        {sent && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-[#e6f1ea] px-3 py-2 text-[13px] text-[#1d4f31]">
            <Check className="h-4 w-4" /> Request sent.
          </div>
        )}

        <div className="mt-5 space-y-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Role
            </span>
            <input
              value="Buyer"
              disabled
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13.5px] text-slate-600"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Country
            </span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={!countries}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-[#307c4c]"
            >
              <option value="">{countries ? 'Pick a country…' : 'Loading…'}</option>
              {(countries ?? []).map((c) => (
                <option
                  key={c.code}
                  value={c.code}
                  disabled={pending.some((p) => p.countryCode === c.code)}
                >
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Why (optional)
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="rounded-lg border border-slate-200 px-3 py-2 text-[13.5px] outline-none focus:border-[#307c4c]"
            />
          </label>
          {error && <p className="text-[12.5px] text-red-600">{error}</p>}
          <button
            type="button"
            disabled={!country || busy}
            onClick={() => void submit()}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Request buyer access
          </button>
        </div>

        <Link
          href="/home"
          className="mt-5 block text-center text-[12.5px] text-slate-500 hover:underline"
        >
          Back to applications
        </Link>
      </div>
    </div>
  );
}
