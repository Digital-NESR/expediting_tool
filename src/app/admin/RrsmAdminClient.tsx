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
  setRrsmCountrySteps,
  setRrsmCountryModules,
  setRrsmUser,
  type RrsmCountryRow,
  type RrsmTeamRow,
} from '@/app/actions/rrsm/admin';
import { describeSteps } from '@/lib/rrsm/steps';
import type { EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

const BRAND = '#307c4c';

type Role = RrsmTeamRow['role'];

const ROLE_LABEL: Record<Role, string> = {
  buyer: 'Buyer',
  ops: 'Ops validator',
  admin: 'Central admin',
  requester: 'Service requester',
};

const ROLE_HELP: Record<Role, string> = {
  buyer: 'Converts validated lines into a PO and records the ERP number.',
  ops: 'Confirms what was actually used — headcount, units, days. Never value.',
  admin: 'Runs the register and the cycle for the country.',
  requester:
    'Decides whether their own recurrent services are renewed. Sees only the services where they are the requester-validator.',
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
  const [notice, setNotice] = useState('');
  /* A step change waiting for the admin to say whether this month's lines move too. */
  const [stepDraft, setStepDraft] = useState<{
    code: string;
    steps: { supplier: boolean; ops: boolean };
  } | null>(null);

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

  async function toggleModule(c: RrsmCountryRow, key: 'rentals' | 'recurrent') {
    setBusy('modules:' + c.code);
    setError('');
    setNotice('');
    const next = {
      rentals: key === 'rentals' ? !c.rentalsEnabled : c.rentalsEnabled,
      recurrent: key === 'recurrent' ? !c.recurrentEnabled : c.recurrentEnabled,
    };
    const r = await setRrsmCountryModules(c.code, next);
    if (!r.success) setError(r.error ?? 'That did not work.');
    else await reload();
    setBusy(null);
  }

  async function saveSteps(apply: boolean) {
    if (!stepDraft) return;
    setBusy('steps:' + stepDraft.code);
    setError('');
    setNotice('');
    const r = await setRrsmCountrySteps(stepDraft.code, stepDraft.steps, apply);
    if (!r.success) {
      setError(r.error ?? 'That did not work.');
    } else {
      const name = countries.find((c) => c.code === stepDraft.code)?.name ?? stepDraft.code;
      setNotice(
        apply
          ? `${name}: ${describeSteps(stepDraft.steps)}. ${r.moved ?? 0} line${r.moved === 1 ? '' : 's'} in this month's cycle moved on.`
          : `${name}: ${describeSteps(stepDraft.steps)}, from the next cycle.`,
      );
      setStepDraft(null);
      await reload();
    }
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
          it cannot be switched on with nobody assigned to it. Each country also chooses its
          validation steps: some skip the supplier&rsquo;s confirmation, some skip Ops, some go
          straight to the PO.{' '}
          <b className="text-slate-700">
            {liveCount} of {countries.length}
          </b>{' '}
          live.
        </p>
      </div>

      {notice && !error && (
        <div className="flex items-start gap-2 rounded-lg border border-[#a9d3bb] bg-[#e6f1ea] px-3.5 py-2.5 text-[13px] text-[#1d4f31]">
          <Check className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

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

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                      Modules
                    </span>
                    {(
                      [
                        ['rentals', 'Monthly rentals', c.rentalsEnabled],
                        ['recurrent', 'Recurrent services', c.recurrentEnabled],
                      ] as const
                    ).map(([key, label, on]) => (
                      <button
                        key={key}
                        type="button"
                        role="switch"
                        aria-checked={on}
                        disabled={busy === 'modules:' + c.code}
                        onClick={() => void toggleModule(c, key)}
                        title={`${label}: ${on ? 'on' : 'off'}. Click to switch ${on ? 'off' : 'on'}.`}
                        className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${
                          on
                            ? 'bg-[#e6f1ea] text-[#1d4f31] hover:bg-[#d6e8de]'
                            : 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200'
                        }`}
                      >
                        {on ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                        {label}
                      </button>
                    ))}
                  </div>
                  {c.rentalsEnabled && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                        Rentals steps
                      </span>
                      {(
                        [
                          ['supplier', 'Supplier validation', c.supplierValidation],
                          ['ops', 'Ops validation', c.opsValidation],
                        ] as const
                      ).map(([key, label, on]) => {
                        const draft = stepDraft?.code === c.code ? stepDraft.steps : null;
                        const value = draft ? draft[key] : on;
                        return (
                          <button
                            key={key}
                            type="button"
                            role="switch"
                            aria-checked={value}
                            onClick={() => {
                              const base = draft ?? {
                                supplier: c.supplierValidation,
                                ops: c.opsValidation,
                              };
                              const steps = { ...base, [key]: !value };
                              setNotice('');
                              setStepDraft(
                                steps.supplier === c.supplierValidation &&
                                  steps.ops === c.opsValidation
                                  ? null
                                  : { code: c.code, steps },
                              );
                            }}
                            title={`${label}: ${value ? 'on' : 'off'}. Click to switch ${value ? 'off' : 'on'}.`}
                            className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                              value
                                ? 'bg-[#e6f1ea] text-[#1d4f31] hover:bg-[#d6e8de]'
                                : 'bg-slate-100 text-slate-400 line-through hover:bg-slate-200'
                            } ${draft && draft[key] !== on ? 'ring-2 ring-amber-300' : ''}`}
                          >
                            {value ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {c.rentalsEnabled && (
                    <span className="text-[11px] text-slate-400">
                      {describeSteps(
                        stepDraft?.code === c.code
                          ? stepDraft.steps
                          : { supplier: c.supplierValidation, ops: c.opsValidation },
                      )}
                    </span>
                  )}
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

                {stepDraft?.code === c.code && (
                  <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                    <span className="mr-auto">
                      Change {c.name} to <b>{describeSteps(stepDraft.steps)}</b>?
                      {((c.supplierValidation && !stepDraft.steps.supplier) ||
                        (c.opsValidation && !stepDraft.steps.ops)) &&
                        ' Lines already waiting on a step you are switching off can move on now.'}
                    </span>
                    {((c.supplierValidation && !stepDraft.steps.supplier) ||
                      (c.opsValidation && !stepDraft.steps.ops)) && (
                      <button
                        type="button"
                        onClick={() => void saveSteps(true)}
                        disabled={busy !== null}
                        className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                        style={{ background: BRAND }}
                      >
                        Save, and move this month&rsquo;s lines on
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void saveSteps(false)}
                      disabled={busy !== null}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700 disabled:opacity-40"
                    >
                      {(c.supplierValidation && !stepDraft.steps.supplier) ||
                      (c.opsValidation && !stepDraft.steps.ops)
                        ? 'Save, from the next cycle'
                        : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setStepDraft(null)}
                      className="px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:underline"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
