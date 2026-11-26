'use client';

/* ─────────────────────────────────────────────────────────────
   ComplyConnect · Approvers.

   Before a communication is emailed to suppliers it is approved by
   the country's supply chain manager, then by one of the final
   approvers. Seeded from ProcureGuard's approver matrix (Country SCM).
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useState } from 'react';
import {
  addSafeSignApprover,
  getSafeSignApprovers,
  removeSafeSignApprover,
  type ApproverRow,
} from '@/app/actions/safesign/admin';
import type { Country } from '@/lib/safesign/access';
import { type EmployeeDirectoryEntry } from '@/app/actions/employeeDirectory';
import { personInitials, usePickerAnchor, PickerPortal } from './_components/EmployeePicker';

const BRAND = '#307c4c';

function Chip({ a, onRemove, busy }: { a: ApproverRow; onRemove: () => void; busy: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-1 pr-2.5 text-[11.5px] text-slate-700"
      title={a.email}
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#307c4c]/10 text-[9px] font-bold text-[#307c4c]">
        {personInitials(a.name)}
      </span>
      <span className="max-w-[190px] truncate">{a.name}</span>
      <button
        type="button"
        disabled={busy}
        onClick={onRemove}
        className="font-bold text-slate-400 hover:text-red-600 disabled:opacity-40"
        aria-label={`Remove ${a.name}`}
      >
        ×
      </button>
    </span>
  );
}

export default function SafeSignApproversClient() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [approvers, setApprovers] = useState<ApproverRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [target, setTarget] = useState('');
  const [person, setPerson] = useState<EmployeeDirectoryEntry | null>(null);
  const picker = usePickerAnchor();
  const { btnRef: pickerButtonRef } = picker;

  const reload = useCallback(async () => {
    try {
      const r = await getSafeSignApprovers();
      setCountries(r.countries);
      setApprovers(r.approvers);
    } catch {
      setError('Could not load the approvers.');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function add() {
    setError('');
    if (!target) return setError('Choose where they approve.');
    if (!person) return setError('Choose a person.');
    setSaving(true);
    const r = await addSafeSignApprover(
      target === 'final'
        ? { step: 'final', email: person.email, name: person.name }
        : { step: 'scm', countryId: target, email: person.email, name: person.name },
    );
    setSaving(false);
    if (!r.success) return setError(r.error ?? 'Could not save.');
    setPerson(null);
    await reload();
  }

  async function remove(a: ApproverRow) {
    setRemoving(a.id);
    const r = await removeSafeSignApprover(a.id);
    setRemoving(null);
    if (!r.success) return setError(r.error ?? 'Could not remove.');
    await reload();
  }

  if (loading) return <div className="p-6 text-sm text-slate-500">Loading the approvers…</div>;

  const finals = approvers.filter((a) => a.step === 'final');

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Approvers</h2>
        <p className="mt-1 text-sm text-slate-500">
          Every communication is approved before it reaches suppliers: first by the country&rsquo;s
          supply chain manager, then by any one of the final approvers. A rejection comes back to
          the sender by email with the reason. Nobody approves their own communication.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Approves as
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]"
            >
              <option value="">Choose…</option>
              <option value="final">Final approver (every country)</option>
              {countries.map((c) => (
                <option key={c.id} value={c.id}>
                  Country SCM: {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Person
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
            {saving ? 'Saving…' : 'Add approver'}
          </button>
          {error && <span className="text-[13px] text-red-600">{error}</span>}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <p className="text-[13px] font-semibold text-slate-900">Final approval</p>
        <p className="text-[12px] text-slate-500">Any one of them approves, for every country.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {finals.length === 0 ? (
            <span className="text-[12px] text-red-600">Nobody yet: nothing can be approved.</span>
          ) : (
            finals.map((a) => <Chip key={a.id} a={a} busy={removing === a.id} onRemove={() => remove(a)} />)
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            <tr>
              <th className="w-[200px] px-4 py-2.5">Country</th>
              <th className="px-4 py-2.5">Country SCM</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {countries.map((c) => {
              const list = approvers.filter((a) => a.step === 'scm' && a.countryId === c.id);
              return (
                <tr key={c.id}>
                  <td className="px-4 py-3 font-semibold text-slate-800">{c.name}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {list.length === 0 ? (
                        <span className="text-[12px] text-amber-700">No SCM: this country cannot submit for approval.</span>
                      ) : (
                        list.map((a) => <Chip key={a.id} a={a} busy={removing === a.id} onRemove={() => remove(a)} />)
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
