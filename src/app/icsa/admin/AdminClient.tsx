'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import {
  addIcsaChampion,
  decideIcsaExtension,
  removeIcsaChampion,
} from '@/app/actions/icsa/cycles';
import { searchIcsaDirectory, type DirectoryPerson } from '@/app/actions/icsa/directory';
import { ICSA_COUNTRIES, fmtDate } from '@/lib/icsa/model';
import type { Champion } from '@/lib/icsa/queries';
import { BTN, BTN_QUIET, BTN_SM, Banner, CARD, INPUT, LABEL, TD, TH } from '../components/ui';

export function ChampionsPanel({ champions }: { champions: Champion[] }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [person, setPerson] = useState<DirectoryPerson | null>(null);
  const [country, setCountry] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function find(value: string) {
    setQ(value);
    setPerson(null);
    if (value.trim().length < 2) return setResults([]);
    const res = await searchIcsaDirectory({ q: value });
    setResults(res.people.slice(0, 8));
  }

  async function add() {
    if (!person) return;
    setBusy(true);
    setError(null);
    const res = await addIcsaChampion({ email: person.email, name: person.name, country });
    setBusy(false);
    if (!res.success) return setError(res.error ?? 'Could not appoint them.');
    setPerson(null);
    setQ('');
    setCountry('');
    router.refresh();
  }

  return (
    <div className={`${CARD} p-5`}>
      <h2 className="font-bold text-slate-800">Champions</h2>
      <p className="mt-1 text-sm text-slate-500">
        A champion runs a country inside each cycle: nominates respondents, chases, reviews, and
        closes once the threshold is met. One person can champion several countries.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_200px_auto]">
        <div className="relative">
          <label className={LABEL} htmlFor="ch-q">
            Person
          </label>
          <input
            id="ch-q"
            className={INPUT}
            value={person ? `${person.name} (${person.email})` : q}
            placeholder="Search by name or email"
            onChange={(e) => find(e.target.value)}
            autoComplete="off"
          />
          {!person && results.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {results.map((r) => (
                <li key={r.email}>
                  <button
                    className="w-full px-3 py-2 text-left text-sm hover:bg-[#307c4c]/5"
                    onClick={() => {
                      setPerson(r);
                      setResults([]);
                    }}
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="block text-xs text-slate-500">
                      {r.email} · {r.jobTitle ?? ''} · {r.country ?? ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <label className={LABEL} htmlFor="ch-country">
            Country
          </label>
          <select
            id="ch-country"
            className={INPUT}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option value="">Choose…</option>
            {ICSA_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className={BTN} disabled={busy || !person || !country} onClick={add}>
            Appoint
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              {['Country', 'Champion', 'Appointed', ''].map((h) => (
                <th key={h} className={TH}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {champions.length === 0 && (
              <tr>
                <td className={TD} colSpan={4}>
                  No champions yet.
                </td>
              </tr>
            )}
            {champions.map((c) => (
              <tr key={c.id}>
                <td className={`${TD} font-semibold`}>{c.country}</td>
                <td className={TD}>
                  {c.name ?? c.email}
                  <p className="text-xs text-slate-500">{c.email}</p>
                </td>
                <td className={TD}>
                  {fmtDate(c.createdAt)}
                  <p className="text-xs text-slate-500">by {c.createdBy}</p>
                </td>
                <td className={`${TD} text-right`}>
                  <button
                    className="text-slate-400 hover:text-red-600"
                    aria-label={`Remove ${c.name ?? c.email} as ${c.country} champion`}
                    onClick={async () => {
                      if (!confirm(`Remove ${c.name ?? c.email} as champion for ${c.country}?`))
                        return;
                      const res = await removeIcsaChampion(c.id);
                      if (!res.success) setError(res.error ?? 'Could not remove.');
                      router.refresh();
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export interface PendingExtension {
  id: number;
  country: string;
  cycleLabel: string;
  requestedBy: string;
  requestedDeadline: string;
  currentDeadline: string;
  reason: string;
  requestedAt: string;
}

export function ExtensionsPanel({ requests }: { requests: PendingExtension[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);

  async function decide(id: number, approve: boolean) {
    setBusy(id);
    setError(null);
    const res = await decideIcsaExtension(id, approve, notes[id] ?? '');
    setBusy(null);
    if (!res.success) return setError(res.error ?? 'Could not record the decision.');
    router.refresh();
  }

  return (
    <div className={`${CARD} p-5`}>
      <h2 className="font-bold text-slate-800">Extension requests</h2>
      <p className="mt-1 text-sm text-slate-500">
        Approving moves that country&apos;s deadline. A country already force-closed at its old
        deadline is reopened.
      </p>
      {error && (
        <div className="mt-3">
          <Banner tone="error">{error}</Banner>
        </div>
      )}
      {!requests.length ? (
        <p className="mt-4 text-sm text-slate-500">Nothing waiting.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {requests.map((r) => (
            <div key={r.id} className="rounded-xl border border-slate-200 p-4">
              <p className="font-semibold text-slate-800">
                {r.country} · {r.cycleLabel}: {fmtDate(r.currentDeadline)} →{' '}
                {fmtDate(r.requestedDeadline)}
              </p>
              <p className="mt-1 text-sm text-slate-600">“{r.reason}”</p>
              <p className="mt-1 text-xs text-slate-500">
                Requested by {r.requestedBy} on {fmtDate(r.requestedAt)}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  className={`${INPUT} max-w-sm`}
                  placeholder="Note (required to refuse)"
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                />
                <button
                  className={`${BTN} ${BTN_SM}`}
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, true)}
                >
                  Approve
                </button>
                <button
                  className={`${BTN_QUIET} ${BTN_SM}`}
                  disabled={busy === r.id}
                  onClick={() => decide(r.id, false)}
                >
                  Refuse
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
