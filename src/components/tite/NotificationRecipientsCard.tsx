'use client';

import { useState } from 'react';
import { getCountryStakeholders, saveNotificationContacts } from '@/app/actions/tite';
import type { Shipment, NotificationContact, CountryStakeholder } from '@/types/tite';

/* ─── Helpers ────────────────────────────────────────────────── */

function roleGroup(role: string | null): string {
  if (!role) return 'Additional';
  const r = role.toLowerCase();
  if (r.includes('supply chain')) return 'Supply Chain';
  if (r.includes('logistics'))    return 'Logistics';
  if (r === 'creator')            return 'Creator';
  return 'Additional';
}

function RoleBadge({ role }: { role: string | null }) {
  const r = role?.toLowerCase() ?? '';
  let cls = 'bg-slate-100 text-slate-600 border-slate-200';
  if (r.includes('supply chain'))  cls = 'bg-blue-50 text-blue-700 border-blue-200';
  else if (r.includes('logistics')) cls = 'bg-cyan-50 text-cyan-700 border-cyan-200';
  else if (r === 'creator')         cls = 'bg-green-50 text-green-700 border-green-200';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${cls}`}>
      {role || 'Recipient'}
    </span>
  );
}

function LockedPill({ name, sub }: { name: string; sub?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-50 border border-green-200 text-green-800 whitespace-nowrap">
      <svg className="w-3 h-3 text-green-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
      {name}
      {sub && <span className="text-green-600 font-normal">— {sub}</span>}
    </span>
  );
}

const INP = 'w-full border border-slate-200 rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20 focus:border-[#006B0C] bg-white placeholder:text-slate-400';

type EditableContact = {
  name: string;
  email: string;
  role: string;
  notify_60_days: boolean;
  notify_30_days: boolean;
  notify_14_days: boolean;
  notify_7_days:  boolean;
  notify_2_days:  boolean;
  notify_1_day:   boolean;
  notify_0_day:   boolean;
  notify_overdue: boolean;
};

const NOTIFY_FIELDS: { key: keyof EditableContact; label: string }[] = [
  { key: 'notify_60_days', label: '60 days' },
  { key: 'notify_30_days', label: '30 days' },
  { key: 'notify_14_days', label: '14 days' },
  { key: 'notify_7_days',  label: '7 days' },
  { key: 'notify_2_days',  label: '2 days' },
  { key: 'notify_1_day',   label: '1 day' },
  { key: 'notify_0_day',   label: 'Day of expiry (0)' },
  { key: 'notify_overdue', label: 'Overdue (daily)' },
];

const ALL_NOTIFY_TRUE: Pick<EditableContact,
  'notify_60_days'|'notify_30_days'|'notify_14_days'|'notify_7_days'|
  'notify_2_days'|'notify_1_day'|'notify_0_day'|'notify_overdue'
> = {
  notify_60_days: true, notify_30_days: true, notify_14_days: true, notify_7_days: true,
  notify_2_days: true, notify_1_day: true, notify_0_day: true, notify_overdue: true,
};

/* ─── Component ──────────────────────────────────────────────── */

export default function NotificationRecipientsCard({
  shipment,
  notificationContacts,
}: {
  shipment:             Shipment;
  notificationContacts: NotificationContact[];
}) {
  const [editing,             setEditing]             = useState(false);
  const [stakeholders,        setStakeholders]        = useState<CountryStakeholder[]>([]);
  const [stakeholdersLoading, setStakeholdersLoading] = useState(false);
  const [additionalEdits,     setAdditionalEdits]     = useState<EditableContact[]>([]);
  const [saving,              setSaving]              = useState(false);
  const [error,               setError]               = useState('');
  const [saved,               setSaved]               = useState(false);

  /* ── Enter edit mode ── */
  async function handleEditClick() {
    setEditing(true);
    setError('');
    setSaved(false);
    setStakeholdersLoading(true);
    try {
      const data = await getCountryStakeholders(shipment.country || '');
      setStakeholders(data);
      const stakeholderEmails = new Set(data.map(s => s.email));
      // Pre-populate additional contacts from existing contacts (non-stakeholder, non-creator)
      const extras = notificationContacts.filter(
        c => !stakeholderEmails.has(c.email) && c.role !== 'Creator',
      );
      setAdditionalEdits(extras.map(c => ({
        name:           c.name ?? '',
        email:          c.email,
        role:           c.role ?? '',
        notify_60_days: c.notify_60_days,
        notify_30_days: c.notify_30_days,
        notify_14_days: c.notify_14_days,
        notify_7_days:  c.notify_7_days,
        notify_2_days:  c.notify_2_days,
        notify_1_day:   c.notify_1_day,
        notify_0_day:   c.notify_0_day,
        notify_overdue: c.notify_overdue,
      })));
    } catch {
      setStakeholders([]);
      setAdditionalEdits([]);
    } finally {
      setStakeholdersLoading(false);
    }
  }

  /* ── Save ── */
  async function handleSave() {
    setError('');

    // Basic email validation
    for (const c of additionalEdits) {
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
        setError(`Invalid email address: ${c.email}`);
        return;
      }
    }

    const creatorContact = notificationContacts.find(c => c.role === 'Creator');
    const combined = [
      ...stakeholders.map(s => ({ email: s.email, name: s.name, role: s.role })),
      ...(creatorContact
        ? [{ email: creatorContact.email, name: creatorContact.name ?? '', role: 'Creator' }]
        : []),
      ...additionalEdits.filter(c => c.email.trim()),
    ];

    setSaving(true);
    try {
      const result = await saveNotificationContacts({ shipmentId: shipment.id, contacts: combined });
      if (result.success) {
        setSaved(true);
        setEditing(false);
        // Reload page to reflect new contacts
        window.location.reload();
      } else {
        setError(result.error || 'Failed to save.');
      }
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setError('');
    setStakeholders([]);
    setAdditionalEdits([]);
  }

  /* ── VIEW mode ── */
  if (!editing) {
    // Group contacts for display
    const groups: Record<string, NotificationContact[]> = {};
    for (const c of notificationContacts) {
      const g = roleGroup(c.role);
      if (!groups[g]) groups[g] = [];
      groups[g].push(c);
    }
    const groupOrder = ['Supply Chain', 'Logistics', 'Creator', 'Additional'];

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Notification Recipients</h3>
            <p className="text-[11px] text-slate-400 mt-0.5">Notified on alert status changes</p>
          </div>
          <button
            onClick={handleEditClick}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 transition-colors"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
        </div>

        <div className="p-4">
          {notificationContacts.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-2">No recipients configured.</p>
          ) : (
            <div className="space-y-3">
              {groupOrder.map(g => {
                const contacts = groups[g];
                if (!contacts?.length) return null;
                return (
                  <div key={g}>
                    <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      {g}
                    </p>
                    <div className="space-y-1.5">
                      {contacts.map(c => (
                        <div key={c.id} className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-medium text-slate-800 truncate">{c.name || '—'}</p>
                            <p className="text-[11px] text-slate-400 truncate">{c.email}</p>
                          </div>
                          {c.role && <RoleBadge role={c.role} />}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── EDIT mode ── */
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Edit Recipients</h3>
          <p className="text-[11px] text-slate-400 mt-0.5">Locked recipients cannot be removed</p>
        </div>
        <button onClick={handleCancel} className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors">
          Cancel
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">

        {/* Locked defaults */}
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Default recipients {shipment.country ? `for ${shipment.country}` : ''}
          </p>
          {stakeholdersLoading ? (
            <p className="text-xs text-slate-400">Loading…</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {/* Creator */}
              {notificationContacts.find(c => c.role === 'Creator') && (
                <LockedPill
                  name={notificationContacts.find(c => c.role === 'Creator')!.name ?? 'Creator'}
                  sub="Creator"
                />
              )}
              {/* Stakeholders */}
              {stakeholders.map(s => (
                <LockedPill key={s.id} name={s.name} sub={s.role} />
              ))}
              {stakeholders.length === 0 && !notificationContacts.find(c => c.role === 'Creator') && (
                <p className="text-xs text-slate-400">No locked recipients.</p>
              )}
            </div>
          )}
        </div>

        {/* Additional recipients */}
        <div>
          <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Additional Recipients
          </p>

          {additionalEdits.length === 0 && (
            <p className="text-xs text-slate-400 mb-2">No additional recipients yet.</p>
          )}

          {additionalEdits.map((c, i) => (
            <div key={i} className="rounded-lg border border-slate-200 p-3 mb-2 flex flex-col gap-2">
              <div className="grid grid-cols-[1fr_1.5fr_6rem_2rem] gap-2 items-center">
                <input
                  className={INP}
                  placeholder="Name"
                  value={c.name}
                  onChange={e => setAdditionalEdits(prev => prev.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                />
                <input
                  type="email"
                  className={INP}
                  placeholder="email@company.com"
                  value={c.email}
                  onChange={e => setAdditionalEdits(prev => prev.map((x, j) => j === i ? { ...x, email: e.target.value } : x))}
                />
                <input
                  className={INP}
                  placeholder="Role"
                  value={c.role}
                  onChange={e => setAdditionalEdits(prev => prev.map((x, j) => j === i ? { ...x, role: e.target.value } : x))}
                />
                <button
                  type="button"
                  onClick={() => setAdditionalEdits(prev => prev.filter((_, j) => j !== i))}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Notify at</p>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {NOTIFY_FIELDS.map(f => (
                    <label key={f.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 rounded accent-[#006B0C]"
                        checked={c[f.key] as boolean}
                        onChange={e => setAdditionalEdits(prev =>
                          prev.map((x, j) => j === i ? { ...x, [f.key]: e.target.checked } : x)
                        )}
                      />
                      <span className="text-xs text-slate-600">{f.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setAdditionalEdits(prev => [...prev, { name: '', email: '', role: '', ...ALL_NOTIFY_TRUE }])}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-[#006B0C] hover:underline mt-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            + Add recipient
          </button>
        </div>

        {error && (
          <p className="text-xs text-red-600 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
            </svg>
            {error}
          </p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          style={{ background: '#006B0C' }}
        >
          {saving && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          Save Changes
        </button>
      </div>
    </div>
  );
}
