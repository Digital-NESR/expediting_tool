'use client';

/* ─────────────────────────────────────────────────────────────
   SOA Consolidation · Managers.

   A manager sees the corporate rollup across countries. Unlike a
   champion or a viewer, the role is APPOINTED here and is never
   self-requested — the same arrangement as ProcureGuard's approvers
   and the Laptop approver matrix.

   An appointment is (person, country), and the country may be NULL,
   meaning every country. The two are shown as separate groups on
   purpose: an all-countries appointment keeps covering a country that
   is added next quarter, and a per-country one does not, so an admin
   scanning this list must be able to tell them apart at a glance.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSoaCountries,
  getSoaManagers,
  removeSoaManager,
  setSoaManager,
  type SoaCountryOption,
  type SoaGrantRow,
} from '@/app/actions/soa/access';
import { type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

/** Appointments for one scope: either every country, or one named country. */
interface ManagerGroup {
  key: string;
  label: string;
  allCountries: boolean;
  managers: SoaGrantRow[];
}

export default function SoaManagersClient() {
  const [managers, setManagers] = useState<SoaGrantRow[]>([]);
  const [countries, setCountries] = useState<SoaCountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  // Appointment form: a person from the directory, plus the country they manage.
  const [person, setPerson] = useState<EmployeeDirectoryEntry | null>(null);
  const [country, setCountry] = useState('');
  const picker = usePickerAnchor();

  const reload = useCallback(async () => {
    const rows = await getSoaManagers();
    setManagers(rows);
    setLastRefreshed(new Date());
  }, []);

  useEffect(() => {
    Promise.all([getSoaManagers(), getSoaCountries()])
      .then(([rows, countryOptions]) => {
        setManagers(rows);
        setCountries(countryOptions);
        setLastRefreshed(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  /* All-countries first, then one group per country that has an appointment, in the
     countries table's own order so this list reads like the rest of the tool. */
  const groups: ManagerGroup[] = useMemo(() => {
    const all = managers.filter((m) => m.country_id === null);
    const byCountry = new Map<string, SoaGrantRow[]>();
    for (const m of managers) {
      if (m.country_id === null) continue;
      const bucket = byCountry.get(m.country_id);
      if (bucket) bucket.push(m);
      else byCountry.set(m.country_id, [m]);
    }

    const ordered: ManagerGroup[] = [];
    if (all.length) {
      ordered.push({ key: '*', label: 'All countries', allCountries: true, managers: all });
    }
    for (const c of countries) {
      const rows = byCountry.get(c.id);
      if (rows) {
        ordered.push({ key: c.id, label: c.name, allCountries: false, managers: rows });
        byCountry.delete(c.id);
      }
    }
    // A grant whose country is no longer in the countries table still has to be removable.
    for (const [id, rows] of byCountry) {
      ordered.push({ key: id, label: id, allCountries: false, managers: rows });
    }
    return ordered;
  }, [managers, countries]);

  async function appoint() {
    if (!person) return;
    setSaving(true);
    setError('');
    const result = await setSoaManager({
      email: person.email,
      name: person.name,
      countryId: country || null,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? 'Failed to appoint the manager.');
      return;
    }
    setPerson(null);
    setCountry('');
    await reload();
  }

  async function remove(row: SoaGrantRow) {
    const key = `${row.email}|${row.country_id ?? '*'}`;
    setRemoving(key);
    setError('');
    const result = await removeSoaManager({ email: row.email, countryId: row.country_id });
    setRemoving(null);
    if (!result.success) {
      setError(result.error ?? 'Failed to remove the manager.');
      return;
    }
    await reload();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
        <svg className="h-5 w-5 animate-spin text-[#2A7E4F]" viewBox="0 0 24 24" fill="none">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
        <span className="text-sm font-medium">Loading managers...</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-slate-900">Managers by Country</h2>
          <p className="mt-0.5 text-[12px] text-gray-400">
            Last updated:{' '}
            {lastRefreshed
              ? lastRefreshed.toLocaleTimeString('en-GB', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })
              : '-'}
          </p>
        </div>
        <button
          type="button"
          disabled={isRefreshing}
          onClick={async () => {
            setIsRefreshing(true);
            try {
              await reload();
            } finally {
              setIsRefreshing(false);
            }
          }}
          className="rounded-md border border-slate-200 px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
        >
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <p className="text-[12px] text-slate-400">
        Managers see the corporate rollup and are appointed here — they never appear in the access
        request queue. An appointment for{' '}
        <span className="font-semibold text-slate-600">All countries</span> also covers any country
        added later; a per-country one does not.
      </p>

      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* ── Appoint form ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Person
            </label>
            <button
              ref={picker.btnRef}
              type="button"
              onClick={picker.toggle}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:border-[#2A7E4F]/40"
            >
              {person ? (
                <>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#2A7E4F]/10 text-[9px] font-bold text-[#2A7E4F]">
                    {personInitials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{person.name}</span>
                  <span className="min-w-0 truncate text-[11px] text-slate-400">
                    {person.email}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">Search name or email...</span>
              )}
            </button>
            <PickerPortal
              open={picker.open}
              pos={picker.pos}
              onPick={(emp) => {
                picker.close();
                setPerson(emp);
              }}
              onClose={picker.close}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A7E4F]"
            >
              <option value="">All countries</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            disabled={!person || saving}
            onClick={appoint}
            className="rounded-lg bg-[#2A7E4F] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2A7E4F]/90 disabled:opacity-50"
          >
            {saving ? 'Appointing...' : 'Appoint manager'}
          </button>
        </div>
      </div>

      {/* ── Current appointments ── */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Current managers
        </h3>
        {groups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
            No managers appointed yet.
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.key}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm ${
                  group.allCountries ? 'border-[#2A7E4F]/30' : 'border-slate-200'
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-3 px-4 py-2.5 ${
                    group.allCountries ? 'bg-[#2A7E4F]/10' : 'bg-slate-50'
                  }`}
                >
                  <span
                    className={`text-[12px] font-bold ${
                      group.allCountries ? 'text-[#2A7E4F]' : 'text-slate-700'
                    }`}
                  >
                    {group.label}
                  </span>
                  {group.allCountries && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-[#2A7E4F]">
                      Every country, including future ones
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-100">
                  {group.managers.map((m) => {
                    const key = `${m.email}|${m.country_id ?? '*'}`;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[#2A7E4F]/[0.03]"
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#2A7E4F]/10 text-[10px] font-bold text-[#2A7E4F]">
                            {personInitials(m.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-800">
                              {m.name}
                            </p>
                            <p className="truncate text-xs text-slate-400">{m.email}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={removing === key}
                          onClick={() => remove(m)}
                          className="shrink-0 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          {removing === key ? 'Removing...' : 'Remove'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
