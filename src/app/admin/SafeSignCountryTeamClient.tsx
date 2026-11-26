'use client';

/* ─────────────────────────────────────────────────────────────
   SafeSign · Country Team.

   SafeSign runs per country, like SOA Consolidation: a sender only
   sees the dashboard, suppliers and communications of the countries
   they are on here. Admins (ADMIN_EMAILS / SAFESIGN_ADMIN_EMAILS)
   are not listed: they have every country and pick one from the
   dropdown in the tool.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  addSafeSignCountryUser,
  getSafeSignCountryTeam,
  removeSafeSignCountryUser,
  type CountryMember,
} from '@/app/actions/safesign/admin';
import type { Country } from '@/lib/safesign/access';
import { type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

const BRAND = '#307c4c';

export default function SafeSignCountryTeamClient() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [members, setMembers] = useState<CountryMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [country, setCountry] = useState('');
  const [person, setPerson] = useState<EmployeeDirectoryEntry | null>(null);
  const picker = usePickerAnchor();
  const { btnRef: pickerButtonRef } = picker;

  const reload = useCallback(async () => {
    try {
      const r = await getSafeSignCountryTeam();
      setCountries(r.countries);
      setMembers(r.members);
    } catch {
      setError('Could not load the country team.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const teams = useMemo(
    () => countries.map((c) => ({ ...c, members: members.filter((m) => m.countryId === c.id) })),
    [countries, members],
  );

  async function add() {
    setError('');
    if (!country) return setError('Choose a country.');
    if (!person) return setError('Choose a person.');
    setSaving(true);
    const r = await addSafeSignCountryUser({ email: person.email, name: person.name, countryId: country });
    setSaving(false);
    if (!r.success) return setError(r.error ?? 'Could not save.');
    setPerson(null);
    await reload();
  }

  async function remove(m: CountryMember) {
    const key = `${m.email}|${m.countryId}`;
    setRemoving(key);
    const r = await removeSafeSignCountryUser({ email: m.email, countryId: m.countryId });
    setRemoving(null);
    if (!r.success) return setError(r.error ?? 'Could not remove.');
    await reload();
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading the country team…</div>;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Country Team</h2>
        <p className="mt-1 text-sm text-slate-500">
          Senders send communications to suppliers. Each one sees only the countries they are
          on here: that country&rsquo;s dashboard, supplier library and communications. Someone in
          two countries switches between them with the dropdown in ComplyConnect. Administrators see
          every country and are not listed.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Country
            </label>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]"
            >
              <option value="">Choose…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Sender
            </label>
            <button
              ref={pickerButtonRef}
              type="button"
              onClick={picker.toggle}
              className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition-colors hover:border-[#307c4c]/40"
            >
              {person ? (
                <>
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#307c4c]/10 text-[9px] font-bold text-[#307c4c]">
                    {personInitials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-800">{person.name}</span>
                </>
              ) : (
                <span className="text-slate-400">Search name or email…</span>
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
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={add}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: BRAND }}
          >
            {saving ? 'Saving…' : 'Add sender'}
          </button>
          {error && <span className="text-[13px] text-red-600">{error}</span>}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {teams.map((t) => (
          <div key={t.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-semibold text-slate-900">{t.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{t.id}</span>
            </div>
            <div className="mt-2">
              {t.members.length === 0 ? (
                <div className="text-[12px] text-slate-400">No senders yet.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {t.members.map((m) => {
                    const key = `${m.email}|${m.countryId}`;
                    return (
                      <span
                        key={key}
                        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] text-slate-700"
                        title={`${m.email} · added by ${m.addedBy}`}
                      >
                        <span className="max-w-[190px] truncate">{m.name || m.email}</span>
                        <button
                          type="button"
                          disabled={removing === key}
                          onClick={() => remove(m)}
                          className="font-bold text-slate-400 hover:text-red-600 disabled:opacity-40"
                          aria-label={`Remove ${m.name || m.email} from ${t.name}`}
                        >
                          ×
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
