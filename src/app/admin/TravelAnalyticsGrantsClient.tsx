'use client';

/* ─────────────────────────────────────────────────────────────
   Supply Chain Analytics · Travel Access.

   Who may open the Travel Portal board, at which countries, and how much of it they see.
   Three roles, and the difference between them is not cosmetic:

     finance      spend, chargeback and the rejected requests
     management   the above plus compliance, missed savings and named approvers
     admin        the above plus traveller records, and the right to reveal a passport number

   A grant on a country is a grant on the bookings the cost-centre mapping places in that
   country. A grant with no country is every country, which is a different and much larger
   thing — so the form says "All countries" in words rather than leaving the field empty and
   hoping the reader works it out.

   Platform admin is NOT travel access. Being in ADMIN_EMAILS opens this editor and the Power
   BI board; it does not hand over other people's passport expiry dates. The first travel
   admin grants it to themselves here, and that act leaves a row with their name on it.
   ───────────────────────────────────────────────────────────── */

import { useCallback, useEffect, useMemo, useState } from 'react';
import EmployeeAutocomplete from '@/app/procure-guard/components/EmployeeAutocomplete';
import {
  addTravelGrant,
  getTravelGrantsAdminData,
  removeTravelGrant,
} from '@/app/actions/travel-analytics';
import type { TravelGrantRow } from '@/lib/travel-analytics/grants';
import type { TravelRole } from '@/lib/travel-analytics/scope';
import { formatDate } from '@/lib/format';

const BRAND = '#307c4c';

const ROLES: { id: TravelRole; label: string; blurb: string }[] = [
  { id: 'finance', label: 'Finance', blurb: 'Spend, chargeback and rejected requests.' },
  {
    id: 'management',
    label: 'Management',
    blurb: 'Adds compliance, missed savings and named approvers.',
  },
  {
    id: 'admin',
    label: 'Admin',
    blurb: 'Adds traveller records and the audited identity-document reveal. Always all countries.',
  },
];

const ROLE_LABEL: Record<TravelRole, string> = {
  finance: 'Finance',
  management: 'Management',
  admin: 'Admin',
};

const ROLE_STYLE: Record<TravelRole, string> = {
  finance: 'bg-slate-100 text-slate-700',
  management: 'bg-sky-50 text-sky-800',
  admin: 'bg-[#eaf4ef] text-[#1d4f31]',
};

const ALL_COUNTRIES = '__all__';

export default function TravelAnalyticsGrantsClient() {
  const [grants, setGrants] = useState<TravelGrantRow[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TravelRole>('finance');
  const [country, setCountry] = useState<string>(ALL_COUNTRIES);

  const reload = useCallback(async () => {
    try {
      const data = await getTravelGrantsAdminData();
      setGrants(data.grants);
      setCountries(data.countries);
    } catch {
      setError('Could not load the grants.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  /* Grouped by person, because the question an admin actually arrives with is "what can this
     one individual see" — and somebody may hold three rows across two roles. */
  const people = useMemo(() => {
    const byEmail = new Map<string, TravelGrantRow[]>();
    for (const g of grants) {
      const rows = byEmail.get(g.email);
      if (rows) rows.push(g);
      else byEmail.set(g.email, [g]);
    }
    return [...byEmail.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [grants]);

  const adminCount = grants.filter((g) => g.role === 'admin').length;

  async function add() {
    setError('');
    const trimmed = email.trim();
    if (!trimmed) return setError('Enter an email address.');

    setSaving(true);
    const res = await addTravelGrant({
      email: trimmed,
      role,
      /* An admin row is always all countries, whatever the picker happens to be showing —
         storing a country on it would create a row that reads like a restriction and is not
         one. The server enforces this too; this is so the UI does not promise otherwise. */
      country: role === 'admin' || country === ALL_COUNTRIES ? null : country,
    });
    setSaving(false);

    if (!res.success) return setError(res.error ?? 'Could not add the grant.');
    setEmail('');
    await reload();
  }

  async function remove(id: number) {
    setError('');
    setRemoving(id);
    const res = await removeTravelGrant(id);
    setRemoving(null);
    if (!res.success) return setError(res.error ?? 'Could not remove the grant.');
    await reload();
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Loading travel access…</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Travel Access</h2>
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-500">
          Who may open the Travel Portal board on Supply Chain Analytics. A grant names a role and a
          country; a grant with no country covers every country. Somebody holding several rows gets
          the strongest role they hold, over the countries attached to that role.
        </p>
      </div>

      {adminCount === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
          <strong>Nobody holds the admin role.</strong> The traveller directory, the expiring
          passports and the data-quality panel are therefore visible to no one, and no identity
          document can be revealed. Being a platform admin is not the same thing — grant it here.
        </div>
      )}

      {countries.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-900">
          <strong>The cost-centre mapping is unreadable.</strong> Country grants cannot be offered
          until it loads, because a country typed by hand that the mapping does not know matches no
          booking and looks exactly like a grant with no travel in it yet.
        </div>
      )}

      {/* ── Grant ── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label
              htmlFor="travel-grant-email"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Email
            </label>
            {/* Searches the Azure AD directory rather than taking a typed address. A grant is
                keyed on the email, so a typo does not fail loudly: it creates a grant that
                simply never matches anyone, and the person it was meant for reports no access
                while the row sits in the table looking correct.

                Controlled, so a colleague who genuinely is not in the directory can still be
                typed in by hand; picking one fills the field exactly as the directory spells
                it. The component lives under procure-guard because that tool needed it first
                and the laptop tool already imports it the same way; it is a generic picker. */}
            <EmployeeAutocomplete
              id="travel-grant-email"
              value={email}
              onChange={setEmail}
              onSelect={(emp) => setEmail(emp.email)}
              placeholder="Search by name or email…"
              inputClassName="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#307c4c]"
            />
          </div>

          <div>
            <label
              htmlFor="travel-grant-role"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Role
            </label>
            <select
              id="travel-grant-role"
              value={role}
              onChange={(e) => setRole(e.target.value as TravelRole)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c]"
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="travel-grant-country"
              className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
            >
              Country
            </label>
            <select
              id="travel-grant-country"
              value={role === 'admin' ? ALL_COUNTRIES : country}
              disabled={role === 'admin'}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#307c4c] disabled:bg-slate-50 disabled:text-slate-400"
            >
              <option value={ALL_COUNTRIES}>All countries</option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
          {ROLES.find((r) => r.id === role)?.blurb}
        </p>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={add}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: BRAND }}
          >
            {saving ? 'Saving…' : 'Grant access'}
          </button>
          {error && <span className="text-[13px] text-red-600">{error}</span>}
        </div>
      </div>

      {/* ── Who has access ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {people.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            Nobody has been granted travel access yet.
          </p>
        ) : (
          people.map(([personEmail, rows]) => (
            <div key={personEmail} className="border-b border-slate-100 px-4 py-3 last:border-b-0">
              <div className="text-[13px] font-semibold text-slate-900">{personEmail}</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {rows.map((g) => (
                  <span
                    key={g.id}
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] ${ROLE_STYLE[g.role]}`}
                    title={`Granted by ${g.createdBy} on ${formatDate(g.createdAt)}`}
                  >
                    <span className="font-semibold">{ROLE_LABEL[g.role]}</span>
                    <span className="opacity-70">{g.country ?? 'All countries'}</span>
                    <button
                      type="button"
                      disabled={removing === g.id}
                      onClick={() => remove(g.id)}
                      className="font-bold opacity-50 transition-opacity hover:text-red-600 hover:opacity-100 disabled:opacity-30"
                      aria-label={`Remove ${ROLE_LABEL[g.role]} on ${g.country ?? 'all countries'} from ${personEmail}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
