'use client';

import Link from 'next/link';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import ProcureGuardLogo from '../components/ProcureGuardLogo';
import EmployeeAutocomplete from '../components/EmployeeAutocomplete';
import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  adminGrantProcureGuardDelegation,
  createAdminAdhocPayment,
  createAdminAdvancePayment,
  deleteProcureGuardRecord,
  revokeProcureGuardDelegation,
  testProcureGuardN8nWebhook,
  updateProcureGuardNotificationRecipientGroup,
} from '@/app/actions/procureGuard';
import {
  ADHOC_STATUS_OPTIONS,
  ADVANCE_STATUS_OPTIONS,
  COUNTRY_OPTIONS,
  PRIORITY_OPTIONS,
  SEGMENT_OPTIONS,
  SPEND_CATEGORY_OPTIONS,
  formatProcureGuardStatusLabel,
  fmtDate,
  fmtDateTime,
  getPermissionProfile,
  getStatusBadge,
  usdFmt,
} from '@/lib/procureGuard-utils';
import type {
  AdhocPaymentRequest,
  AdminCreateAdhocPaymentInput,
  AdminCreateAdvancePaymentInput,
  AdvancePaymentRequest,
  ProcureGuardActivityRow,
  ProcureGuardAdminData,
  ProcureGuardDelegation,
  ProcureGuardNotificationContact,
  ProcureGuardPermissionRow,
  ProcureGuardPriority,
  ProcureGuardStatus,
} from '@/types/procureGuard';

type TabKey = 'adhoc' | 'advance' | 'activity' | 'recipients' | 'delegations';
type RecipientPersonGroup = {
  key: string;
  displayName: string;
  email: string;
  rows: ProcureGuardNotificationContact[];
  countries: string[];
  roles: string[];
  requestTypes: string[];
  approvalSteps: string[];
};

const inputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function EmptyOrForbidden() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 p-4">
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-lg font-bold text-slate-900">Admin panel unavailable</p>
        <p className="mt-2 text-sm text-slate-500">Sign in with an account that has ProcureGuard admin access.</p>
        <Link href="/procure-guard" className="mt-5 inline-flex rounded-md bg-[#307c4c] px-4 py-2 text-sm font-bold text-white hover:bg-[#307c4c]">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const badge = getStatusBadge(status);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold whitespace-nowrap ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
}

function activityActionLabel(action: string) {
  return action.replace(/^Status updated to\s+(.+)$/i, (_, status: string) => `Status updated to ${formatProcureGuardStatusLabel(status)}`);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label>
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

function AdhocForm({ actor, onDone }: { actor: ProcureGuardAdminData['actor']; onDone: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const segmentListId = useId();
  const spendCategoryListId = useId();
  const [form, setForm] = useState({
    requisitionNumber: '',
    vendorName: '',
    vendorTaxId: '',
    amount: '',
    country: 'United Arab Emirates (UAE)',
    segment: 'Supply Chain',
    spendCategory: 'Services',
    status: 'Submitted' as ProcureGuardStatus,
    priority: 'Normal' as ProcureGuardPriority,
    requesterName: actor.name,
    requesterEmail: actor.email,
    paymentReason: '',
    justification: '',
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const payload: AdminCreateAdhocPaymentInput = {
      requisition_number: form.requisitionNumber,
      vendor_name: form.vendorName,
      vendor_code: form.vendorTaxId,
      vendor_tax_id: form.vendorTaxId,
      amount: Number(form.amount),
      currency: 'USD',
      country: form.country,
      segment: form.segment,
      spend_category: form.spendCategory,
      spend_value_usd: Number(form.amount),
      requester_notification_emails: [],
      acknowledged: true,
      status: form.status,
      priority: form.priority,
      requested_by_name: form.requesterName,
      requested_by_email: form.requesterEmail,
      payment_reason: form.paymentReason,
      justification: form.justification,
    };

    startTransition(async () => {
      const result = await createAdminAdhocPayment(payload);
      if (!result.success) {
        setError(result.error ?? 'Failed to create adhoc PO.');
        return;
      }
      onDone(`Created ${result.reference_number}.`);
      setForm(prev => ({ ...prev, requisitionNumber: '', vendorName: '', vendorTaxId: '', amount: '', paymentReason: '', justification: '' }));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Add Adhoc PO</h2>
        <button disabled={isPending} className="rounded-md bg-[#307c4c] px-3 py-2 text-xs font-bold text-white hover:bg-[#307c4c] disabled:opacity-60">
          {isPending ? 'Adding' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Requisition">
          <input className={inputClass} value={form.requisitionNumber} onChange={e => update('requisitionNumber', e.target.value)} required />
        </Field>
        <Field label="Vendor">
          <input className={inputClass} value={form.vendorName} onChange={e => update('vendorName', e.target.value)} required />
        </Field>
        <Field label="Vendor Tax ID">
          <input className={inputClass} value={form.vendorTaxId} onChange={e => update('vendorTaxId', e.target.value)} required />
        </Field>
        <Field label="Amount">
          <input className={inputClass} type="number" min="0.01" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} required />
        </Field>
        <Field label="Country">
          <select className={inputClass} value={form.country} onChange={e => update('country', e.target.value)}>
            {COUNTRY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Segment">
          <input className={inputClass} value={form.segment} onChange={e => update('segment', e.target.value)} list={segmentListId} placeholder="Find or enter segment" />
          <datalist id={segmentListId}>
            {SEGMENT_OPTIONS.map(item => <option key={item} value={item} />)}
          </datalist>
        </Field>
        <Field label="Spend Category">
          <input className={inputClass} value={form.spendCategory} onChange={e => update('spendCategory', e.target.value)} list={spendCategoryListId} placeholder="Find or enter category" />
          <datalist id={spendCategoryListId}>
            {SPEND_CATEGORY_OPTIONS.map(item => <option key={item} value={item} />)}
          </datalist>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => update('status', e.target.value as ProcureGuardStatus)}>
            {ADHOC_STATUS_OPTIONS.map(item => <option key={item} value={item}>{formatProcureGuardStatusLabel(item)}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={e => update('priority', e.target.value as ProcureGuardPriority)}>
            {PRIORITY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Requester Email">
          <input className={inputClass} value={form.requesterEmail} onChange={e => update('requesterEmail', e.target.value)} required />
        </Field>
        <div className="md:col-span-2">
          <Field label="Reason">
            <input className={inputClass} value={form.paymentReason} onChange={e => update('paymentReason', e.target.value)} required />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Justification">
            <input className={inputClass} value={form.justification} onChange={e => update('justification', e.target.value)} required />
          </Field>
        </div>
      </div>
    </form>
  );
}

function AdvanceForm({ actor, onDone }: { actor: ProcureGuardAdminData['actor']; onDone: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const segmentListId = useId();
  const spendCategoryListId = useId();
  const [form, setForm] = useState({
    requisitionNumber: '',
    vendorName: '',
    sapVendorId: '',
    amount: '',
    country: 'United Arab Emirates (UAE)',
    segment: 'Supply Chain',
    spendCategory: 'Services',
    paymentTermsDays: '30',
    creditLimitUsd: '0',
    status: 'Submitted' as ProcureGuardStatus,
    priority: 'Normal' as ProcureGuardPriority,
    requesterName: actor.name,
    requesterEmail: actor.email,
    advancePurpose: '',
    justification: '',
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const payload: AdminCreateAdvancePaymentInput = {
      requisition_number: form.requisitionNumber,
      vendor_name: form.vendorName,
      vendor_code: form.sapVendorId,
      sap_vendor_id: form.sapVendorId,
      amount: Number(form.amount),
      currency: 'USD',
      country: form.country,
      segment: form.segment,
      spend_category: form.spendCategory,
      spend_value_usd: Number(form.amount),
      current_payment_terms_days: Number(form.paymentTermsDays),
      current_credit_limit_usd: Number(form.creditLimitUsd),
      requester_notification_emails: [],
      status: form.status,
      priority: form.priority,
      requested_by_name: form.requesterName,
      requested_by_email: form.requesterEmail,
      advance_purpose: form.advancePurpose,
      justification: form.justification,
    };

    startTransition(async () => {
      const result = await createAdminAdvancePayment(payload);
      if (!result.success) {
        setError(result.error ?? 'Failed to create advance payment.');
        return;
      }
      onDone(`Created ${result.reference_number}.`);
      setForm(prev => ({ ...prev, requisitionNumber: '', vendorName: '', sapVendorId: '', amount: '', advancePurpose: '', justification: '' }));
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-bold text-slate-900">Add Advance Payment</h2>
        <button disabled={isPending} className="rounded-md bg-[#307c4c] px-3 py-2 text-xs font-bold text-white hover:bg-[#307c4c] disabled:opacity-60">
          {isPending ? 'Adding' : 'Add'}
        </button>
      </div>
      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
        <Field label="Requisition">
          <input className={inputClass} value={form.requisitionNumber} onChange={e => update('requisitionNumber', e.target.value)} required />
        </Field>
        <Field label="Vendor">
          <input className={inputClass} value={form.vendorName} onChange={e => update('vendorName', e.target.value)} required />
        </Field>
        <Field label="SAP Vendor ID">
          <input className={inputClass} value={form.sapVendorId} onChange={e => update('sapVendorId', e.target.value)} required />
        </Field>
        <Field label="Amount">
          <input className={inputClass} type="number" min="0.01" step="0.01" value={form.amount} onChange={e => update('amount', e.target.value)} required />
        </Field>
        <Field label="Country">
          <select className={inputClass} value={form.country} onChange={e => update('country', e.target.value)}>
            {COUNTRY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Segment">
          <input className={inputClass} value={form.segment} onChange={e => update('segment', e.target.value)} list={segmentListId} placeholder="Find or enter segment" />
          <datalist id={segmentListId}>
            {SEGMENT_OPTIONS.map(item => <option key={item} value={item} />)}
          </datalist>
        </Field>
        <Field label="Spend Category">
          <input className={inputClass} value={form.spendCategory} onChange={e => update('spendCategory', e.target.value)} list={spendCategoryListId} placeholder="Find or enter category" />
          <datalist id={spendCategoryListId}>
            {SPEND_CATEGORY_OPTIONS.map(item => <option key={item} value={item} />)}
          </datalist>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => update('status', e.target.value as ProcureGuardStatus)}>
            {ADVANCE_STATUS_OPTIONS.map(item => <option key={item} value={item}>{formatProcureGuardStatusLabel(item)}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className={inputClass} value={form.priority} onChange={e => update('priority', e.target.value as ProcureGuardPriority)}>
            {PRIORITY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Requester Email">
          <input className={inputClass} value={form.requesterEmail} onChange={e => update('requesterEmail', e.target.value)} required />
        </Field>
        <Field label="Payment Terms">
          <input className={inputClass} type="number" min="0" step="1" value={form.paymentTermsDays} onChange={e => update('paymentTermsDays', e.target.value)} required />
        </Field>
        <Field label="Credit Limit USD">
          <input className={inputClass} type="number" min="0" step="0.01" value={form.creditLimitUsd} onChange={e => update('creditLimitUsd', e.target.value)} required />
        </Field>
        <div className="md:col-span-2">
          <Field label="Purpose">
            <input className={inputClass} value={form.advancePurpose} onChange={e => update('advancePurpose', e.target.value)} required />
          </Field>
        </div>
        <div className="md:col-span-4">
          <Field label="Justification">
            <input className={inputClass} value={form.justification} onChange={e => update('justification', e.target.value)} required />
          </Field>
        </div>
      </div>
    </form>
  );
}

function RowActions({ type, id, label, onDone }: { type: 'adhoc' | 'advance' | 'activity'; id: number; label: string; onDone: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function remove() {
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteProcureGuardRecord(type, id);
      if (result.success) {
        onDone(`Deleted ${label}.`);
        router.refresh();
      } else {
        onDone(result.error ?? `Could not delete ${label}.`);
      }
    });
  }

  return (
    <button
      disabled={isPending}
      onClick={remove}
      className="rounded-md border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-60"
    >
      {isPending ? 'Deleting' : 'Delete'}
    </button>
  );
}

function AdhocTable({ rows, onDone }: { rows: AdhocPaymentRequest[]; onDone: (message: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Reference</th>
            <th className="px-4 py-3 text-left font-semibold">Vendor</th>
            <th className="px-4 py-3 text-left font-semibold">Amount</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Requester</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-5 text-center text-slate-500">No adhoc PO records.</td></tr>
          ) : rows.map(row => (
            <tr key={row.id} className="hover:bg-[#307c4c]/5">
              <td className="px-4 py-3 font-bold text-slate-900">
                <Link href={`/procure-guard/adhoc-payments/${row.id}`} className="hover:text-[#307c4c] hover:underline">
                  {row.reference_number}
                </Link>
              </td>
              <td className="px-4 py-3">
                <p className="font-semibold text-slate-900">{row.vendor_name}</p>
                <p className="text-xs text-slate-500">{row.invoice_number || row.po_number || 'No invoice or PO'}</p>
              </td>
              <td className="px-4 py-3 font-semibold">{usdFmt(row.amount, row.currency)}</td>
              <td className="px-4 py-3"><StatusPill status={row.status} /></td>
              <td className="px-4 py-3 text-slate-600">{row.requested_by_email}</td>
              <td className="px-4 py-3 text-right">
                <RowActions type="adhoc" id={row.id} label={row.reference_number} onDone={onDone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdvanceTable({ rows, onDone }: { rows: AdvancePaymentRequest[]; onDone: (message: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Reference</th>
            <th className="px-4 py-3 text-left font-semibold">Vendor</th>
            <th className="px-4 py-3 text-left font-semibold">Amount</th>
            <th className="px-4 py-3 text-left font-semibold">Status</th>
            <th className="px-4 py-3 text-left font-semibold">Requester</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-5 text-center text-slate-500">No advance payment records.</td></tr>
          ) : rows.map(row => (
            <tr key={row.id} className="hover:bg-[#307c4c]/5">
              <td className="px-4 py-3 font-bold text-slate-900">
                <Link href={`/procure-guard/advance-payments/${row.id}`} className="hover:text-[#307c4c] hover:underline">
                  {row.reference_number}
                </Link>
              </td>
              <td className="px-4 py-3">
                <p className="font-semibold text-slate-900">{row.vendor_name}</p>
                <p className="text-xs text-slate-500">{row.contract_reference || row.po_number || 'No contract or PO'}</p>
              </td>
              <td className="px-4 py-3 font-semibold">{usdFmt(row.amount, row.currency)}</td>
              <td className="px-4 py-3"><StatusPill status={row.status} /></td>
              <td className="px-4 py-3 text-slate-600">{row.requested_by_email}</td>
              <td className="px-4 py-3 text-right">
                <RowActions type="advance" id={row.id} label={row.reference_number} onDone={onDone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function groupRecipientRows(rows: ProcureGuardNotificationContact[]): RecipientPersonGroup[] {
  const groups = new Map<string, ProcureGuardNotificationContact[]>();

  for (const row of rows) {
    const key = row.email?.trim().toLowerCase() || row.display_name?.trim().toLowerCase() || `recipient-${row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return [...groups.entries()]
    .map(([key, groupRows]) => {
      const first = groupRows[0];
      return {
        key,
        displayName: first.display_name,
        email: first.email,
        rows: groupRows.sort((a, b) =>
          a.notification_role.localeCompare(b.notification_role)
          || a.country.localeCompare(b.country)
          || String(a.approval_status ?? '').localeCompare(String(b.approval_status ?? '')),
        ),
        countries: [...new Set(groupRows.map(row => row.country))].sort(),
        roles: [...new Set(groupRows.map(row => row.notification_role))].sort(),
        requestTypes: [...new Set(groupRows.map(row => row.request_type))].sort(),
        approvalSteps: [...new Set(groupRows.map(row => row.approval_status || 'General notification'))].sort(),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName) || a.email.localeCompare(b.email));
}

function RecipientChipList({ label, values }: { label: string; values: string[] }) {
  const visible = values.slice(0, 8);
  const hiddenCount = Math.max(0, values.length - visible.length);

  return (
    <div>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {visible.map(value => (
          <span key={value} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[0.6875rem] font-semibold text-slate-700">
            {value}
          </span>
        ))}
        {hiddenCount > 0 && (
          <span className="rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-2 py-1 text-[0.6875rem] font-bold text-[#307c4c]">
            +{hiddenCount} more
          </span>
        )}
      </div>
    </div>
  );
}

function RecipientPersonEditor({ group, onDone }: { group: RecipientPersonGroup; onDone: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(group.displayName ?? '');
  const [email, setEmail] = useState(group.email ?? '');
  const [error, setError] = useState('');

  function save() {
    setError('');
    startTransition(async () => {
      const result = await updateProcureGuardNotificationRecipientGroup({
        ids: group.rows.map(row => row.id),
        display_name: displayName,
        email,
      });
      if (!result.success) {
        setError(result.error ?? 'Recipient group update failed.');
        return;
      }
      onDone(`Notification recipient saved for ${displayName || email} across ${group.rows.length} assignment${group.rows.length === 1 ? '' : 's'}.`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.5fr)_auto] xl:items-start">
        <div className="space-y-3">
          <div>
            <p className="text-xs font-bold text-slate-900">{group.displayName || 'Unnamed recipient'}</p>
            <p className="mt-1 break-all text-xs text-slate-500">{group.email}</p>
          </div>
          <div className="rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-3 py-2">
            <p className="text-[0.6875rem] font-bold text-[#307c4c]">{group.rows.length} assignment{group.rows.length === 1 ? '' : 's'}</p>
            <p className="mt-0.5 text-[0.6875rem] text-slate-600">{group.countries.length} countr{group.countries.length === 1 ? 'y' : 'ies'} · {group.roles.length} role{group.roles.length === 1 ? '' : 's'}</p>
          </div>
          <Field label="Display Name">
            <input className={inputClass} value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </Field>
          <Field label="Email">
            <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <RecipientChipList label="Roles" values={group.roles} />
          <RecipientChipList label="Countries" values={group.countries} />
          <RecipientChipList label="Request Types" values={group.requestTypes} />
          <RecipientChipList label="Approval Steps" values={group.approvalSteps.map(formatProcureGuardStatusLabel)} />
        </div>

        <button type="button" disabled={isPending || !displayName.trim() || !email.trim()} onClick={save} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#307c4c]/80 disabled:opacity-60">
          {isPending ? 'Saving' : 'Save Person'}
        </button>
      </div>
      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
    </div>
  );
}

function NotificationRecipientsPanel({ rows, onDone }: { rows: ProcureGuardNotificationContact[]; onDone: (message: string) => void }) {
  const [country, setCountry] = useState('All');
  const [requestType, setRequestType] = useState('All');
  const [role, setRole] = useState('All');
  const [personSearch, setPersonSearch] = useState('');
  const [isTestingWebhook, startWebhookTest] = useTransition();
  const [webhookTestResult, setWebhookTestResult] = useState('');
  const countries = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.country))).sort()], [rows]);
  const roles = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.notification_role))).sort()], [rows]);
  const filteredRows = rows.filter(row =>
    (country === 'All' || row.country === country) &&
    (requestType === 'All' || row.request_type === requestType) &&
    (role === 'All' || row.notification_role === role)
  );
  const groups = useMemo(() => groupRecipientRows(filteredRows), [filteredRows]);
  const searchedGroups = groups.filter(group => {
    const q = personSearch.trim().toLowerCase();
    if (!q) return true;
    return group.displayName.toLowerCase().includes(q)
      || group.email.toLowerCase().includes(q)
      || group.roles.some(item => item.toLowerCase().includes(q))
      || group.countries.some(item => item.toLowerCase().includes(q));
  });

  function runWebhookTest() {
    setWebhookTestResult('');
    startWebhookTest(async () => {
      const result = await testProcureGuardN8nWebhook();
      if (result.success && result.data) {
        setWebhookTestResult(`Webhook reached ${result.data.webhookHost}${result.data.webhookPath}: ${result.data.status} ${result.data.statusText || 'OK'}`);
        onDone('ProcureGuard n8n webhook test sent successfully.');
        return;
      }

      const detail = result.data
        ? ` (${result.data.webhookHost}${result.data.webhookPath}: ${result.data.status} ${result.data.statusText})`
        : '';
      setWebhookTestResult(`${result.error || 'Webhook test failed.'}${detail}`);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">Notification Recipients</p>
            <p className="mt-1 text-xs text-slate-500">Grouped by person so shared positions like CFO can be changed once across every assigned country and approval role.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={runWebhookTest}
                disabled={isTestingWebhook}
                className="rounded-md border border-[#307c4c]/30 bg-white px-3 py-2 text-xs font-bold text-[#307c4c] shadow-sm hover:bg-[#307c4c]/5 disabled:opacity-60"
              >
                {isTestingWebhook ? 'Testing n8n...' : 'Test n8n webhook'}
              </button>
              {webhookTestResult && (
                <span className={`rounded-md border px-3 py-2 text-xs font-semibold ${webhookTestResult.startsWith('Webhook reached') ? 'border-[#307c4c]/20 bg-[#307c4c]/10 text-[#307c4c]' : 'border-red-200 bg-red-50 text-red-700'}`}>
                  {webhookTestResult}
                </span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:min-w-[760px] xl:grid-cols-4">
            <Field label="Person">
              <input className={inputClass} value={personSearch} onChange={e => setPersonSearch(e.target.value)} placeholder="Search name, email, role..." />
            </Field>
            <Field label="Country">
              <select className={inputClass} value={country} onChange={e => setCountry(e.target.value)}>
                {countries.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Request Type">
              <select className={inputClass} value={requestType} onChange={e => setRequestType(e.target.value)}>
                <option>All</option>
                <option>adhoc</option>
                <option>advance</option>
                <option>both</option>
              </select>
            </Field>
            <Field label="Role">
              <select className={inputClass} value={role} onChange={e => setRole(e.target.value)}>
                {roles.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
          </div>
        </div>
      </div>

      {searchedGroups.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-center text-sm text-slate-500 shadow-sm">No notification recipients match these filters.</div>
      ) : (
        <div className="space-y-3">
          {searchedGroups.map(group => <RecipientPersonEditor key={group.key} group={group} onDone={onDone} />)}
        </div>
      )}
    </div>
  );
}
function ActivityTable({ rows, onDone }: { rows: ProcureGuardActivityRow[]; onDone: (message: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-semibold">Reference</th>
            <th className="px-4 py-3 text-left font-semibold">Type</th>
            <th className="px-4 py-3 text-left font-semibold">Action</th>
            <th className="px-4 py-3 text-left font-semibold">Actor</th>
            <th className="px-4 py-3 text-left font-semibold">Created</th>
            <th className="px-4 py-3 text-right font-semibold">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-5 text-center text-slate-500">No activity records.</td></tr>
          ) : rows.map(row => (
            <tr key={row.id} className="hover:bg-[#307c4c]/5">
              <td className="px-4 py-3 font-bold text-slate-900">
                {row.request_type === 'adhoc' || row.request_type === 'advance' ? (
                  <Link href={`/procure-guard/${row.request_type === 'adhoc' ? 'adhoc-payments' : 'advance-payments'}/${row.request_id}`} className="hover:text-[#307c4c] hover:underline">
                    {row.reference_number}
                  </Link>
                ) : row.reference_number}
              </td>
              <td className="px-4 py-3 capitalize text-slate-600">{row.request_type}</td>
              <td className="px-4 py-3 text-slate-900">{activityActionLabel(row.action)}</td>
              <td className="px-4 py-3 text-slate-600">{row.actor_email || row.actor_name || 'System'}</td>
              <td className="px-4 py-3 text-slate-500">{fmtDateTime(row.created_at)}</td>
              <td className="px-4 py-3 text-right">
                <RowActions type="activity" id={row.id} label={`activity ${row.id}`} onDone={onDone} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function delegationIsLive(d: ProcureGuardDelegation): boolean {
  return d.is_active && (!d.expires_at || new Date(d.expires_at).getTime() > Date.now());
}

function DelegationsPanel({
  delegations,
  approvers,
  onDone,
}: {
  delegations: ProcureGuardDelegation[];
  approvers: ProcureGuardPermissionRow[];
  onDone: (message: string) => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [delegatorEmail, setDelegatorEmail] = useState('');
  const [delegateEmail, setDelegateEmail] = useState('');
  const [delegateName, setDelegateName] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [error, setError] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    startTransition(async () => {
      const result = await adminGrantProcureGuardDelegation({
        delegatorEmail,
        delegateEmail,
        delegateName,
        expiresAt: expiresAt || null,
      });
      if (result.success) {
        onDone(`Delegated ${delegatorEmail}'s approvals to ${delegateEmail}. Both have been emailed.`);
        setDelegatorEmail('');
        setDelegateEmail('');
        setDelegateName('');
        setExpiresAt('');
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to create delegation.');
      }
    });
  }

  function revoke(id: number, who: string) {
    setError('');
    startTransition(async () => {
      const result = await revokeProcureGuardDelegation(id);
      if (result.success) {
        onDone(`Revoked delegation for ${who}. They've been emailed.`);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to revoke delegation.');
      }
    });
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-bold text-slate-900">Set up a delegation</h3>
        <p className="mt-0.5 text-xs text-slate-500">
          Hand an approver&apos;s authority to a delegate on their behalf. The delegate inherits the approver&apos;s scope until the end date or until you revoke it.
        </p>
        {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Find the delegate in the directory">
              <EmployeeAutocomplete
                placeholder="Search directory by name or email…"
                onSelect={emp => { setDelegateEmail(emp.email); setDelegateName(emp.name); }}
              />
            </Field>
          </div>
          <Field label="Approver (delegator)">
            <select className={inputClass} value={delegatorEmail} onChange={e => setDelegatorEmail(e.target.value)} required>
              <option value="">Select an approver…</option>
              {approvers.map(a => (
                <option key={a.email} value={a.email}>
                  {a.name ? `${a.name} (${a.email})` : a.email} — {a.role}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Delegate email">
            <input type="email" required className={inputClass} value={delegateEmail} onChange={e => setDelegateEmail(e.target.value)} placeholder="colleague@nesr.com" />
          </Field>
          <Field label="Delegate name (optional)">
            <input className={inputClass} value={delegateName} onChange={e => setDelegateName(e.target.value)} placeholder="Full name" />
          </Field>
          <Field label="End date (optional)">
            <input type="date" className={inputClass} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
          </Field>
          <div className="flex items-end">
            <button type="submit" disabled={isPending} className="rounded-lg bg-[#307c4c] px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#307c4c]/85 disabled:opacity-60">
              {isPending ? 'Working…' : 'Create delegation'}
            </button>
          </div>
        </form>
        {approvers.length === 0 && (
          <p className="mt-3 text-xs text-slate-400">No approvers found. Assign approval access from the Access Approvals page first.</p>
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="text-sm font-bold text-slate-900">All delegations</h3>
          <p className="mt-0.5 text-xs text-slate-500">Every delegation across approvers. Revoke any active one to remove the delegate&apos;s access immediately.</p>
        </div>
        {delegations.length === 0 ? (
          <div className="p-4 text-center text-sm text-slate-500">No delegations have been set up.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {delegations.map(d => {
              const live = delegationIsLive(d);
              return (
                <div key={d.id} className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{d.delegator_name || d.delegator_email}</span>
                      <span className="text-slate-300">→</span>
                      <span className="text-sm font-semibold text-slate-900">{d.delegate_name || d.delegate_email}</span>
                      <span className={`rounded-full px-2 py-0.5 text-[0.6875rem] font-semibold ${live ? 'bg-[#307c4c]/10 text-[#307c4c]' : 'bg-slate-100 text-slate-500'}`}>
                        {live ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{d.delegator_email} → {d.delegate_email}</p>
                    <p className="mt-0.5 text-[0.6875rem] text-slate-400">
                      Granted {fmtDate(d.created_at)}
                      {d.expires_at ? ` · ends ${fmtDate(d.expires_at)}` : ''}
                      {d.revoked_at ? ` · revoked ${fmtDate(d.revoked_at)}` : ''}
                    </p>
                  </div>
                  {live && (
                    <button
                      onClick={() => revoke(d.id, d.delegate_name || d.delegate_email)}
                      disabled={isPending}
                      className="shrink-0 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                    >
                      Revoke
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

export default function AdminPanelClient({ data, embedded = false }: { data: ProcureGuardAdminData | null; embedded?: boolean }) {
  const [tab, setTab] = useState<TabKey>('recipients');
  const [notice, setNotice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const counts = useMemo(() => {
    if (!data) return { adhoc: 0, advance: 0, activity: 0, recipients: 0, delegations: 0 };
    return {
      adhoc: data.adhoc.length,
      advance: data.advance.length,
      activity: data.activity.length,
      recipients: data.notification_recipients.length,
      delegations: data.delegations.length,
    };
  }, [data]);

  const approvers = useMemo(
    () => (data?.permissions ?? []).filter(p => getPermissionProfile(p.role).canViewAll),
    [data],
  );

  if (!data) return <EmptyOrForbidden />;

  const isFullAdmin = data.actor.permissions.accessView === 'admin';
  if (!isFullAdmin) return <EmptyOrForbidden />;

  const tabItems = [
    { key: 'recipients', label: 'Email Recipients', count: counts.recipients, description: 'Update who receives approval notifications for each role and country.' },
    { key: 'delegations', label: 'Delegations', count: counts.delegations, description: 'Set up and revoke approval delegations on behalf of approvers.' },
    { key: 'adhoc', label: 'Adhoc POs', count: counts.adhoc, description: 'Review and remove adhoc test records.' },
    { key: 'advance', label: 'Advance Payments', count: counts.advance, description: 'Review and remove advance test records.' },
    { key: 'activity', label: 'Activity Log', count: counts.activity, description: 'See meaningful approval activity.' },
  ] as ReadonlyArray<{ key: TabKey; label: string; count: number; description: string }>;

  return (
    <div className={`${embedded ? '' : 'min-h-[100dvh]'} bg-white text-slate-900`}>
      {!embedded && <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={data.stats.pending_review} accessView={data.actor.permissions.accessView} />}
      {!embedded && <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <ProcureGuardLogo size="md" />
          <div>
            <p className="text-sm font-bold leading-tight">ProcureGuard Admin</p>
            <p className="text-xs text-slate-500">{data.actor.email}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/procure-guard" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#307c4c]/5">
              Dashboard
            </Link>
            <Link href="/procure-guard/analytics" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-[#307c4c]/5">
              Analytics
            </Link>
          </div>
        </div>
      </header>}

      <main className={`${embedded ? '' : 'mx-auto max-w-[1320px] px-4 py-5'}`}>
        <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Adhoc</p>
            <p className="mt-2 text-2xl font-bold">{data.stats.adhoc_total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Advance</p>
            <p className="mt-2 text-2xl font-bold">{data.stats.advance_total}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Pending</p>
            <p className="mt-2 text-2xl font-bold">{data.stats.pending_review}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase text-slate-400">Total USD Eq.</p>
            <p className="mt-2 text-2xl font-bold">{usdFmt(data.stats.total_requested_amount)}</p>
          </div>
        </section>

        {notice && (
          <div className="mt-4 rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#307c4c]">
            {notice}
          </div>
        )}

        <section className="mt-5 grid grid-cols-1 gap-4">
          <AdhocForm actor={data.actor} onDone={setNotice} />
          <AdvanceForm actor={data.actor} onDone={setNotice} />
        </section>

        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-[#307c4c]">Admin Controls</p>
              <h2 className="text-xl font-black text-slate-950">Data and notification routing</h2>
            </div>
            <p className="max-w-xl text-sm text-slate-500">
              Use the tiles below to manage ProcureGuard records, approval notifications, and delegations.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {tabItems.map(item => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`min-h-[118px] rounded-xl border px-4 py-4 text-left shadow-sm transition ${
                  tab === item.key
                    ? 'border-[#307c4c] bg-[#307c4c] text-white shadow-md shadow-[#307c4c]/15'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#307c4c]/40 hover:bg-[#307c4c]/5'
                }`}
              >
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-black ${
                  tab === item.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {item.count}
                </span>
                <span className="mt-3 block text-base font-black leading-tight">{item.label}</span>
                <span className={`mt-2 block text-xs leading-5 ${
                  tab === item.key ? 'text-white/85' : 'text-slate-500'
                }`}>
                  {item.description}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5">
            {tab === 'adhoc' && <AdhocTable rows={data.adhoc} onDone={setNotice} />}
            {tab === 'advance' && <AdvanceTable rows={data.advance} onDone={setNotice} />}
            {tab === 'activity' && <ActivityTable rows={data.activity} onDone={setNotice} />}
            {tab === 'recipients' && <NotificationRecipientsPanel rows={data.notification_recipients} onDone={setNotice} />}
            {tab === 'delegations' && <DelegationsPanel delegations={data.delegations} approvers={approvers} onDone={setNotice} />}
          </div>
        </section>
      </main>
    </div>
  );
}




