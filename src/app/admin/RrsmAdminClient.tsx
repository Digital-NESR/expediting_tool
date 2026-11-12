'use client';

/* ─────────────────────────────────────────────────────────────
   RRSM · Countries & Team.

   Two halves of one decision, on one screen because neither is
   safe to make without the other: a country goes live when there
   is somebody to run it, and a person is appointed to a country
   that may or may not be switched on yet.

   The rollout is phased — nineteen countries are seeded from the
   first migration and every one starts dark — so this screen is
   the only way anything is ever turned on, and the count beside
   each switch is what makes "live with nobody on it" visible
   before it happens rather than after.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, Trash2, UserPlus, X } from 'lucide-react';
import {
  getRrsmCountries,
  getRrsmTeam,
  removeRrsmUser,
  setRrsmCountryLive,
  setRrsmUser,
  type RrsmCountryRow,
  type RrsmTeamRow,
} from '@/app/actions/rrsm/admin';
import type { EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

const BRAND = '#307c4c';

type Role = RrsmTeamRow['role'];

const ROLE_LABEL: Record<Role, string> = {
  buyer: 'Buyer',
  ops: 'Ops validator',
  admin: 'Central admin',
};

const ROLE_HELP: Record<Role, string> = {
  buyer: 'Converts validated lines into a PO and records the ERP number.',
  ops: 'Confirms what was actually used — headcount, units, days. Never value.',
  admin: 'Runs the register and the cycle for the country.',
};

/**
 * Rows supplied instead of fetched, for `/dev-preview/rrsm-admin` only.
 *
 * The screen is behind SSO and behind an admin check, so without this it could only ever ship on
 * the strength of a diff. With `preview` set the component renders the given rows and makes no
 * server call -- which also means the buttons do nothing, because there is no signed-in admin to
 * do them as.
 */
export interface RrsmAdminPreview {
  countries: RrsmCountryRow[];
  team: RrsmTeamRow[];
}

export default function RrsmAdminClient({ preview }: { preview?: RrsmAdminPreview } = {}) {
  const [countries, setCountries] = useState<RrsmCountryRow[]>(preview?.countries ?? []);
  const [team, setTeam] = useState<RrsmTeamRow[]>(preview?.team ?? []);
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [role, setRole] = useState<Role>('buyer');
  const [country, setCountry] = useState('');
  const [person, setPerson] = useState<EmployeeDirectoryEntry | null>(null);
  const picker = usePickerAnchor();
  /* Destructured here rather than reached through `picker` inside the JSX: the lint rule reads a
     member access in render as reading a ref's value. Same note as SoaCountryTeamClient. */
  const { btnRef: pickerButtonRef } = picker;

  const reload = useCallback(async () => {
    if (preview) return;
    const [c, t] = await Promise.all([getRrsmCountries(), getRrsmTeam()]);
    setCountries(c);
    setTeam(t);
    setLoading(false);
  }, [preview]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const byCountry = useMemo(() => {
    const m = new Map<string, RrsmTeamRow[]>();
    for (const r of team) {
      const list = m.get(r.countryCode);
      if (list) list.push(r);
      else m.set(r.countryCode, [r]);
    }
    return m;
  }, [team]);

  const liveCount = countries.filter((c) => c.live).length;

  async function toggleLive(c: RrsmCountryRow) {
    setBusy('country:' + c.code);
    setError('');
    const r = await setRrsmCountryLive(c.code, !c.live);
    if (!r.success) setError(r.error ?? 'That did not work.');
    else await reload();
    setBusy(null);
  }

  async function appoint() {
    if (!person || !country) return;
    setBusy('appoint');
    setError('');
    const r = await setRrsmUser({
      email: person.email,
      name: person.name,
      role,
      countryCode: country,
    });
    if (!r.success) {
      setError(r.error ?? 'That did not work.');
    } else {
      setPerson(null);
      await reload();
    }
    setBusy(null);
  }

  async function remove(row: RrsmTeamRow) {
    setBusy('user:' + row.id);
    setError('');
    const r = await removeRrsmUser(row.id);
    if (!r.success) setError(r.error ?? 'That did not work.');
    else await reload();
    setBusy(null);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-[13.5px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading RRSM countries and team…
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-[17px] font-semibold tracking-tight text-slate-900">
          Countries &amp; team
        </h2>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-slate-500">
          RRSM rolls out country by country. A country stays dark until it is switched on here, and
          it cannot be switched on with nobody assigned to it.{' '}
          <b className="text-slate-700">
            {liveCount} of {countries.length}
          </b>{' '}
          live.
        </p>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          <X className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ── appoint ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-[14px] font-semibold text-slate-900">Appoint somebody</h3>
        <p className="mt-0.5 text-[12.5px] text-slate-500">{ROLE_HELP[role]}</p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] outline-none"
            >
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Country
            </span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="min-w-[14rem] rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13.5px] outline-none"
            >
              <option value="">Pick a country…</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.flag ? c.flag + ' ' : ''}
                  {c.name}
                  {c.live ? '' : ' — not live'}
                </option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Person
            </span>
            <button
              ref={pickerButtonRef}
              onClick={picker.toggle}
              className="flex min-w-[16rem] items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[13.5px]"
            >
              {person ? (
                <>
                  <span
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
                    style={{ background: BRAND }}
                  >
                    {personInitials(person.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{person.name}</span>
                </>
              ) : (
                <span className="text-slate-400">Search the directory…</span>
              )}
            </button>
          </div>

          <button
            onClick={() => void appoint()}
            disabled={!person || !country || busy === 'appoint'}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-40"
            style={{ background: BRAND }}
          >
            {busy === 'appoint' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            Appoint
          </button>
        </div>

        <PickerPortal
          open={picker.open}
          pos={picker.pos}
          onPick={(emp) => {
            setPerson(emp);
            picker.close();
          }}
          onClose={picker.close}
        />
      </section>

      {/* ── countries ───────────────────────────────────────── */}
      <section>
        <h3 className="mb-3 text-[14px] font-semibold text-slate-900">Countries</h3>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          {countries.map((c, i) => {
            const people = byCountry.get(c.code) ?? [];
            return (
              <div
                key={c.code}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
                  i ? 'border-t border-slate-100' : ''
                }`}
              >
                <div className="min-w-[13rem] flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-800">
                    {c.flag && <span aria-hidden>{c.flag}</span>}
                    {c.name}
                    <span className="font-mono text-[11px] font-medium text-slate-400">
                      {c.code} · {c.currency}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[12px] text-slate-500">
                    {c.users === 0 ? (
                      <span className="text-amber-700">Nobody assigned</span>
                    ) : (
                      `${c.users} ${c.users === 1 ? 'person' : 'people'}`
                    )}
                  </div>
                </div>

                <div className="flex min-w-0 flex-[2] flex-wrap gap-1.5">
                  {people.map((p) => (
                    <span
                      key={p.id}
                      className="group inline-flex items-center gap-1.5 rounded-full bg-slate-50 py-1 pl-2 pr-1 text-[12px] text-slate-700"
                    >
                      <span className="font-medium">{p.name || p.email}</span>
                      <span className="text-slate-400">{ROLE_LABEL[p.role]}</span>
                      <button
                        onClick={() => void remove(p)}
                        disabled={busy === 'user:' + p.id}
                        aria-label={`Remove ${p.name || p.email}`}
                        className="rounded-full p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                      >
                        {busy === 'user:' + p.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </span>
                  ))}
                </div>

                <button
                  onClick={() => void toggleLive(c)}
                  disabled={busy === 'country:' + c.code || (!c.live && c.users === 0)}
                  title={
                    !c.live && c.users === 0
                      ? 'Assign somebody to this country first'
                      : c.live
                        ? 'Switch off'
                        : 'Switch on'
                  }
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                    c.live
                      ? 'bg-[#e6f1ea] text-[#1d4f31] hover:bg-[#d6e8de]'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {busy === 'country:' + c.code ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : c.live ? (
                    <Check className="h-3 w-3" />
                  ) : null}
                  {c.live ? 'Live' : 'Not live'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
