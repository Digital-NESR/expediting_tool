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

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Check, Loader2, UserPlus, X } from 'lucide-react';
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
  ops: 'Not appointed here: a buyer picks the Ops validator for each line and sends it to them.',
  admin: 'Runs the register and the cycle for the country.',
  requester:
    'Not appointed here: anybody a buyer names as requester-validator on a recurrent service gets access to their own services automatically.',
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
  const [showAll, setShowAll] = useState(false);
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
  /* Live countries first; the rest fold away until asked for, which is most of the nineteen. */
  const ordered = [...countries].sort((x, y) => Number(y.live) - Number(x.live));
  const shownCountries = showAll ? ordered : ordered.filter((c) => c.live || c.users > 0);
  const hiddenCount = countries.length - ordered.filter((c) => c.live || c.users > 0).length;

  async function toggleLive(c: RrsmCountryRow) {
    setBusy('country:' + c.code);
    setError('');
    const r = await setRrsmCountryLive(c.code, !c.live);
    if (!r.success) setError(r.error ?? 'That did not work.');
    else await reload();
    setBusy(null);
  }

  async function toggleModule(c: RrsmCountryRow, key: 'rentals' | 'recurrent' | 'reminders') {
    setBusy('modules:' + c.code);
    setError('');
    setNotice('');
    const next = {
      rentals: key === 'rentals' ? !c.rentalsEnabled : c.rentalsEnabled,
      recurrent: key === 'recurrent' ? !c.recurrentEnabled : c.recurrentEnabled,
      reminders: key === 'reminders' ? !c.recurrentReminders : c.recurrentReminders,
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
              {/* Service requesters and Ops validators are not appointed: a buyer naming them on
                  a recurrent service, or sending them lines to validate, is what gives them
                  access (24 Nov 2026). The labels stay for any grant made earlier. */}
              {(Object.keys(ROLE_LABEL) as Role[])
                .filter((r) => r !== 'requester' && r !== 'ops')
                .map((r) => (
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
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[14px] font-semibold text-slate-900">Countries</h3>
          <p className="text-[12px] text-slate-500">
            Switches save as you click, except the rentals steps, which ask first.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[60rem] table-fixed text-[13px]">
              <colgroup>
                <col className="w-[15rem]" />
                <col />
                <col className="w-[6.5rem]" />
                <col className="w-[15rem]" />
                <col className="w-[13rem]" />
              </colgroup>
              <thead>
                <tr className="bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-400">
                  <th className="px-4 py-2.5 text-left font-semibold">Country</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Team</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Live</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Monthly rentals</th>
                  <th className="px-3 py-2.5 text-left font-semibold">Recurrent services</th>
                </tr>
              </thead>
              <tbody>
                {shownCountries.map((c) => {
                  const people = byCountry.get(c.code) ?? [];
                  const draft = stepDraft?.code === c.code ? stepDraft.steps : null;
                  const steps = draft ?? { supplier: c.supplierValidation, ops: c.opsValidation };
                  const switchingOff =
                    !!draft &&
                    ((c.supplierValidation && !draft.supplier) || (c.opsValidation && !draft.ops));
                  const moduleBusy = busy === 'modules:' + c.code;
                  return (
                    <Fragment key={c.code}>
                      <tr
                        className={`border-t border-slate-100 align-top ${c.live ? '' : 'bg-slate-50/40'}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 font-semibold text-slate-800">
                            {c.flag && <span aria-hidden>{c.flag}</span>}
                            <span className="truncate">{c.name}</span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-400">
                            {c.code} · {c.currency}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          {people.length ? (
                            <div className="flex flex-wrap gap-1.5">
                              {people.map((p) => (
                                <span
                                  key={p.id}
                                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100 py-0.5 pl-2 pr-1 text-[11.5px] text-slate-700"
                                  title={`${p.email} · ${ROLE_LABEL[p.role]}`}
                                >
                                  <span className="truncate font-medium">{p.name || p.email}</span>
                                  <span className="shrink-0 text-slate-400">
                                    {ROLE_LABEL[p.role]}
                                  </span>
                                  <button
                                    onClick={() => void remove(p)}
                                    disabled={busy === 'user:' + p.id}
                                    aria-label={`Remove ${p.name || p.email}`}
                                    className="shrink-0 rounded-full p-0.5 text-slate-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                  >
                                    {busy === 'user:' + p.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3" />
                                    )}
                                  </button>
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[12px] text-amber-700">Nobody assigned</span>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <Toggle
                            on={c.live}
                            busy={busy === 'country:' + c.code}
                            disabled={!c.live && c.users === 0}
                            label={c.live ? 'Live' : 'Off'}
                            title={
                              !c.live && c.users === 0
                                ? 'Assign somebody to this country first'
                                : c.live
                                  ? 'Switch the country off'
                                  : 'Switch the country on'
                            }
                            onChange={() => void toggleLive(c)}
                          />
                        </td>

                        <td className="px-3 py-3">
                          <Toggle
                            on={c.rentalsEnabled}
                            busy={moduleBusy}
                            label={c.rentalsEnabled ? 'On' : 'Off'}
                            title="The monthly rentals cycle for this country"
                            onChange={() => void toggleModule(c, 'rentals')}
                          />
                          {c.rentalsEnabled && (
                            <div className="mt-2 space-y-1.5 border-l-2 border-slate-100 pl-3">
                              {(
                                [
                                  ['supplier', 'Supplier validation'],
                                  ['ops', 'Ops validation'],
                                ] as const
                              ).map(([key, label]) => (
                                <Toggle
                                  key={key}
                                  small
                                  on={steps[key]}
                                  changed={
                                    !!draft &&
                                    draft[key] !==
                                      (key === 'supplier' ? c.supplierValidation : c.opsValidation)
                                  }
                                  label={label}
                                  onChange={() => {
                                    const next = { ...steps, [key]: !steps[key] };
                                    setNotice('');
                                    setStepDraft(
                                      next.supplier === c.supplierValidation &&
                                        next.ops === c.opsValidation
                                        ? null
                                        : { code: c.code, steps: next },
                                    );
                                  }}
                                />
                              ))}
                              <div className="text-[11px] text-slate-400">
                                {describeSteps(steps)}
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3">
                          <Toggle
                            on={c.recurrentEnabled}
                            busy={moduleBusy}
                            label={c.recurrentEnabled ? 'On' : 'Off'}
                            title="Annual contracts, subscriptions and AMCs"
                            onChange={() => void toggleModule(c, 'recurrent')}
                          />
                          {c.recurrentEnabled && (
                            <div className="mt-2 border-l-2 border-slate-100 pl-3">
                              {/* Its own switch, off by default: the module can be on while buyers
                                  correct the dates, without mailing requesters about stale expiries. */}
                              <Toggle
                                small
                                on={c.recurrentReminders}
                                busy={moduleBusy}
                                warn={!c.recurrentReminders}
                                label="Email reminders"
                                title={
                                  c.recurrentReminders
                                    ? 'Renewal reminders are emailed (90/60/30/14/7/0 days). Click to stop.'
                                    : 'No reminders are emailed. Click to start them at the next daily run (06:00 UTC).'
                                }
                                onChange={() => void toggleModule(c, 'reminders')}
                              />
                              {!c.recurrentReminders && (
                                <div className="mt-1 text-[11px] text-amber-700">
                                  Nobody is emailed yet
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>

                      {draft && (
                        <tr>
                          <td colSpan={5} className="px-4 pb-3">
                            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                              <span className="mr-auto">
                                Change {c.name}&rsquo;s rentals to <b>{describeSteps(draft)}</b>?
                                {switchingOff &&
                                  ' Lines already waiting on a step you are switching off can move on now.'}
                              </span>
                              {switchingOff && (
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
                                {switchingOff ? 'Save, from the next cycle' : 'Save'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setStepDraft(null)}
                                className="px-2 py-1.5 text-[12px] font-semibold text-slate-500 hover:underline"
                              >
                                Cancel
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {hiddenCount > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-slate-100 px-4 py-2.5 text-[12.5px] font-semibold text-slate-500 hover:bg-slate-50"
            >
              {showAll
                ? 'Hide countries not yet live'
                : `Show ${hiddenCount} countries not yet live`}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

/** An on/off switch with its label, used for every country setting. */
function Toggle({
  on,
  label,
  onChange,
  busy,
  disabled,
  small,
  warn,
  changed,
  title,
}: {
  on: boolean;
  label: string;
  onChange: () => void;
  busy?: boolean;
  disabled?: boolean;
  small?: boolean;
  /** Amber when off, for a setting that is off on purpose but worth noticing. */
  warn?: boolean;
  /** Ringed while it differs from what is saved (the rentals steps ask before saving). */
  changed?: boolean;
  title?: string;
}) {
  const track = small ? 'h-4 w-7' : 'h-5 w-9';
  const knob = small ? 'h-3 w-3' : 'h-4 w-4';
  const shift = small ? 'translate-x-3' : 'translate-x-4';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={title}
      disabled={busy || disabled}
      onClick={onChange}
      className="group inline-flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span
        className={`relative inline-flex shrink-0 items-center rounded-full transition-colors ${track} ${
          on ? 'bg-[#307c4c]' : warn ? 'bg-amber-300' : 'bg-slate-300'
        } ${changed ? 'ring-2 ring-amber-300 ring-offset-1' : ''}`}
      >
        <span
          className={`inline-block transform rounded-full bg-white shadow transition-transform ${knob} ${
            on ? shift : 'translate-x-0.5'
          }`}
        />
      </span>
      <span
        className={`whitespace-nowrap ${small ? 'text-[12px]' : 'text-[12.5px] font-semibold'} ${
          on ? 'text-slate-800' : warn ? 'text-amber-800' : 'text-slate-400'
        }`}
      >
        {busy ? <Loader2 className="inline h-3 w-3 animate-spin" /> : label}
      </span>
    </button>
  );
}
