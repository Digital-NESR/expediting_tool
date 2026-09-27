'use client';

/* ─────────────────────────────────────────────────────────────
   SOA Consolidation · Country Team.

   Champions and Accounts Payable contacts for every country, in one
   list because they are read together: the champion chases the
   vendors, and the AP contacts are copied on every letter and pick
   the cycle up once it closes. A country with three champions and no
   AP contact is exactly the thing this screen exists to show.

   Both roles can also arrive through the access-request flow; these
   are the same rows, so somebody approved yesterday appears here
   today and can be removed here too.

   An AP contact is often not a person. Half of them are shared
   mailboxes — invoices.ksa@nesr.com, financeteam.kuwait@nesr.com —
   which nobody owns and nobody could ever request access for, so the
   form takes a typed address as well as a directory pick.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getSoaCountries,
  getSoaCountryTeam,
  removeSoaCountryUser,
  setSoaCountryUser,
  type AppointableRole,
  type SoaCountryOption,
  type SoaGrantRow,
} from '@/app/actions/soa/access';
import { type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

const BRAND = '#2A7E4F';

type TeamRole = Extract<AppointableRole, 'champion' | 'ap'>;

const ROLE_LABEL: Record<TeamRole, string> = {
  champion: 'Champion',
  ap: 'Accounts Payable',
};

interface CountryTeam {
  id: string;
  name: string;
  champions: SoaGrantRow[];
  aps: SoaGrantRow[];
}

export default function SoaCountryTeamClient() {
  const [rows, setRows] = useState<SoaGrantRow[]>([]);
  const [countries, setCountries] = useState<SoaCountryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [role, setRole] = useState<TeamRole>('champion');
  const [country, setCountry] = useState('');
  const [person, setPerson] = useState<EmployeeDirectoryEntry | null>(null);
  // A shared mailbox has no directory record, so it is typed in instead of picked.
  const [manual, setManual] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [manualName, setManualName] = useState('');
  const picker = usePickerAnchor();
  // Destructured here rather than reached through `picker` inside the JSX: the lint rule reads a
  // member access in render as reading a ref's value.
  const { btnRef: pickerButtonRef } = picker;

  const reload = useCallback(async () => {
    const [team, list] = await Promise.all([getSoaCountryTeam(), getSoaCountries()]);
    setRows(team);
    setCountries(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const teams = useMemo<CountryTeam[]>(
    () =>
      countries.map((c) => ({
        id: c.id,
        name: c.name,
        champions: rows.filter((r) => r.country_id === c.id && r.role === 'champion'),
        aps: rows.filter((r) => r.country_id === c.id && r.role === 'ap'),
      })),
    [countries, rows],
  );

  const gaps = teams.filter((t) => !t.champions.length || !t.aps.length);

  async function add() {
    setError('');
    const email = manual ? manualEmail.trim() : (person?.email ?? '');
    const name = manual ? manualName.trim() : (person?.name ?? '');
    if (!country) return setError('Choose a country.');
    if (!email) return setError(manual ? 'Enter the mailbox address.' : 'Choose a person.');
    if (manual && !name) return setError('Give the mailbox a name — it appears in the audit trail.');

    setSaving(true);
    const res = await setSoaCountryUser({ email, name, countryId: country, role });
    setSaving(false);
    if (!res.success) return setError(res.error ?? 'Could not save.');

    setPerson(null);
    setManualEmail('');
    setManualName('');
    await reload();
  }

  async function remove(row: SoaGrantRow) {
    const key = `${row.email}|${row.country_id}|${row.role}`;
    setRemoving(key);
    const res = await removeSoaCountryUser({
      email: row.email,
      countryId: row.country_id ?? '',
      role: row.role as TeamRole,
    });
    setRemoving(null);
    if (!res.success) return setError(res.error ?? 'Could not remove.');
    await reload();
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading the country team…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Country Team</h2>
        <p className="mt-1 text-sm text-slate-500">
          Champions run a country&rsquo;s cycle. Accounts Payable contacts are copied on every
          vendor letter and review the cycle once it closes. Both can also be granted through
          Access Approvals — this is the same list.
        </p>
      </div>

      {gaps.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <strong>
            {gaps.length} {gaps.length === 1 ? 'country is' : 'countries are'} incomplete.
          </strong>{' '}
          A country with no AP contact cannot send — the letter tells the vendor where to reply and
          there would be nothing to put there. A country with no champion has nobody to run it.
        </div>
      )}

      {/* ── Appoint ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Role
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as TeamRole)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2A7E4F]"
            >
              <option value="champion">Champion</option>
              <option value="ap">Accounts Payable</option>
            </select>
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
              <option value="">Choose…</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {manual ? 'Shared mailbox' : 'Person'}
              </label>
              <button
                type="button"
                onClick={() => setManual((m) => !m)}
                className="text-[11px] font-semibold hover:underline"
                style={{ color: BRAND }}
              >
                {manual ? 'Pick a person' : 'Use a shared mailbox'}
              </button>
            </div>

            {manual ? (
              <div className="space-y-2">
                <input
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  placeholder="invoices.ksa@nesr.com"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#2A7E4F]"
                />
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Invoices KSA"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#2A7E4F]"
                />
              </div>
            ) : (
              <>
                <button
                  ref={pickerButtonRef}
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
              </>
            )}
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
            {saving ? 'Saving…' : `Add ${ROLE_LABEL[role]}`}
          </button>
          {error && <span className="text-[13px] text-red-600">{error}</span>}
        </div>
      </div>

      {/* ── The team, country by country ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {teams.map((t) => (
          <div key={t.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
            <div className="flex items-baseline gap-2">
              <span className="text-[13px] font-semibold text-slate-900">{t.name}</span>
              <span className="font-mono text-[10px] text-slate-400">{t.id}</span>
            </div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <TeamColumn
                label="Champions"
                empty="No champion — nobody can run this country's cycle."
                rows={t.champions}
                removing={removing}
                onRemove={remove}
              />
              <TeamColumn
                label="Accounts Payable"
                empty="No AP contact — sending is blocked for this country."
                rows={t.aps}
                removing={removing}
                onRemove={remove}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TeamColumn({
  label,
  empty,
  rows,
  removing,
  onRemove,
}: {
  label: string;
  empty: string;
  rows: SoaGrantRow[];
  removing: string | null;
  onRemove: (row: SoaGrantRow) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      {rows.length === 0 ? (
        <div className="text-[12px] text-amber-700">{empty}</div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {rows.map((r) => {
            const key = `${r.email}|${r.country_id}|${r.role}`;
            return (
              <span
                key={key}
                className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11.5px] text-slate-700"
                title={r.email}
              >
                <span className="max-w-[190px] truncate">{r.name}</span>
                <button
                  type="button"
                  disabled={removing === key}
                  onClick={() => onRemove(r)}
                  className="font-bold text-slate-400 hover:text-red-600 disabled:opacity-40"
                  aria-label={`Remove ${r.name}`}
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
