'use client';

import type { ProcureGuardNotificationContact, ProcureGuardStatus } from '@/types/procureGuard';
import { formatProcureGuardStatusLabel } from '@/lib/procureGuard-utils';

type Props = {
  contacts: ProcureGuardNotificationContact[];
  currentStatus?: ProcureGuardStatus | null;
  loading?: boolean;
  emptyText?: string;
};

function activeDecisionStatus(status?: ProcureGuardStatus | null): ProcureGuardStatus | null {
  if (!status) return null;
  if (status === 'Submitted') return 'Under Review';
  if (status === 'Approved' || status === 'Rejected' || status === 'Cancelled') return null;
  return status;
}

export default function ProcureGuardNotificationContactsPanel({
  contacts,
  currentStatus,
  loading = false,
  emptyText = 'Select a country to see who will be contacted.',
}: Props) {
  const currentDecisionStatus = activeDecisionStatus(currentStatus);
  const grouped = contacts.reduce<Record<string, ProcureGuardNotificationContact[]>>((acc, contact) => {
    const key = contact.approval_status || 'Other notifications';
    if (!acc[key]) acc[key] = [];
    acc[key].push(contact);
    return acc;
  }, {});
  const statuses = Object.keys(grouped);

  return (
    <section className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-slate-900">People Getting Contacted</h2>
          <p className="text-xs text-slate-500">Approval notifications for this request route</p>
        </div>
        <span className="w-fit rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
          {loading ? 'Loading' : `${contacts.length} recipient${contacts.length === 1 ? '' : 's'}`}
        </span>
      </div>

      <div className="mt-3">
        {loading ? (
          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">Loading contacts...</p>
        ) : contacts.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">{emptyText}</p>
        ) : (
          <div className="space-y-3">
            {statuses.map(status => {
              const isCurrent = currentDecisionStatus === status;
              return (
                <div key={status} className={`rounded-md border bg-white p-3 ${isCurrent ? 'border-[#307c4c]/40 ring-2 ring-[#307c4c]/10' : 'border-slate-200'}`}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-[0.6875rem] font-bold uppercase tracking-wide text-slate-500">{formatProcureGuardStatusLabel(status)}</p>
                    {isCurrent && <span className="rounded-full bg-[#307c4c]/10 px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-[#307c4c]">Current step</span>}
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {grouped[status].map(contact => (
                      <div key={`${contact.approval_status}-${contact.email}-${contact.id}`} className="min-w-0 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                        <p className="truncate text-[0.78125rem] font-bold text-slate-900">{contact.display_name || contact.email}</p>
                        <p className="truncate text-[0.6875rem] text-slate-500">{contact.email}</p>
                        <p className="mt-1 truncate text-[0.65625rem] font-semibold text-slate-400">{contact.notification_role}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
