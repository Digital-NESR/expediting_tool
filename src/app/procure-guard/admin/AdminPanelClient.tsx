'use client';

import Link from 'next/link';
import ProcureGuardSidebar from '../components/ProcureGuardSidebar';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  createAdminAdhocPayment,
  createAdminAdvancePayment,
  deleteProcureGuardRecord,
  updateProcureGuardNotificationRecipient,
  updateProcureGuardPermission,
} from '@/app/actions/procureGuard';
import {
  ADHOC_STATUS_OPTIONS,
  ADVANCE_STATUS_OPTIONS,
  COUNTRY_OPTIONS,
  PERMISSION_ROLE_OPTIONS,
  PRIORITY_OPTIONS,
  SEGMENT_OPTIONS,
  SPEND_CATEGORY_OPTIONS,
  fmtDateTime,
  getCountryControllerEmail,
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
  ProcureGuardNotificationContact,
  ProcureGuardPermissionProfile,
  ProcureGuardPermissionRole,
  ProcureGuardPermissionRow,
  ProcureGuardPriority,
  ProcureGuardStatus,
} from '@/types/procureGuard';

type TabKey = 'adhoc' | 'advance' | 'activity' | 'permissions' | 'recipients';

const inputClass = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20';
const labelClass = 'block text-xs font-semibold text-slate-500 mb-1';

function EmptyOrForbidden() {
  return (
    <div className="min-h-[100dvh] bg-slate-50 p-6">
      <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${badge.className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {badge.label}
    </span>
  );
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
      cc_email: getCountryControllerEmail(form.country),
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
        setError(result.error ?? 'Failed to create adhoc payment.');
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
        <h2 className="text-sm font-bold text-slate-900">Add Adhoc Payment</h2>
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
          <select className={inputClass} value={form.segment} onChange={e => update('segment', e.target.value)}>
            {SEGMENT_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Spend Category">
          <select className={inputClass} value={form.spendCategory} onChange={e => update('spendCategory', e.target.value)}>
            {SPEND_CATEGORY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => update('status', e.target.value as ProcureGuardStatus)}>
            {ADHOC_STATUS_OPTIONS.map(item => <option key={item}>{item}</option>)}
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
      cc_email: getCountryControllerEmail(form.country),
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
          <select className={inputClass} value={form.segment} onChange={e => update('segment', e.target.value)}>
            {SEGMENT_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Spend Category">
          <select className={inputClass} value={form.spendCategory} onChange={e => update('spendCategory', e.target.value)}>
            {SPEND_CATEGORY_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select className={inputClass} value={form.status} onChange={e => update('status', e.target.value as ProcureGuardStatus)}>
            {ADVANCE_STATUS_OPTIONS.map(item => <option key={item}>{item}</option>)}
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
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No adhoc payment records.</td></tr>
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
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No advance payment records.</td></tr>
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


const CAPABILITY_LABELS: Array<[keyof Omit<ProcureGuardPermissionProfile, 'role' | 'label' | 'description' | 'accessView'>, string]> = [
  ['canViewAll', 'View all requests'],
  ['canCreateRequests', 'Create requests'],
  ['canManageData', 'Add/edit admin data'],
  ['canManagePermissions', 'Change permissions'],
  ['canDeleteRecords', 'Delete records'],
  ['canMarkPaid', 'Mark approved requests paid'],
  ['canReject', 'Reject active requests'],
  ['canReviewAdhocScm', 'Adhoc: SCM review'],
  ['canReviewAdhocDirector', 'Adhoc: Supply Chain Director approval'],
  ['canReviewAdvanceCountryController', 'Advance: Country Controller approval'],
  ['canReviewAdvanceSupplyChainDirector', 'Advance: Supply Chain Director approval'],
  ['canReviewAdvanceTreasuryDirector', 'Advance: Treasury Director approval'],
  ['canReviewAdvanceCorporateController', 'Advance: Corporate Controller approval'],
  ['canReviewAdvanceCfo', 'Advance: CFO approval'],
];

function RoleCapabilities({ role }: { role: ProcureGuardPermissionRole }) {
  const profile = getPermissionProfile(role);
  const enabled = CAPABILITY_LABELS.filter(([key]) => Boolean(profile[key]));
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-bold text-slate-900">{profile.label}</p>
      <p className="mt-1 text-xs text-slate-500">{profile.description}</p>
      <p className="mt-2 inline-flex rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-600">
        {profile.accessView} view
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {enabled.length === 0 ? (
          <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-500">No elevated permissions</span>
        ) : enabled.map(([, label]) => (
          <span key={label} className="rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-2 py-1 text-[11px] font-semibold text-[#307c4c]">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function PermissionEditor({ row, onDone }: { row?: ProcureGuardPermissionRow; onDone: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(row?.email ?? '');
  const [name, setName] = useState(row?.name ?? '');
  const [role, setRole] = useState<ProcureGuardPermissionRole>(row?.role ?? 'Requester');
  const [country, setCountry] = useState(row?.country ?? '');
  const [segment, setSegment] = useState(row?.segment ?? '');
  const [error, setError] = useState('');

  function save() {
    setError('');
    startTransition(async () => {
      const result = await updateProcureGuardPermission({ email, name, role, country, segment });
      if (!result.success) {
        setError(result.error ?? 'Permission update failed.');
        return;
      }
      onDone(`Permission saved for ${email}.`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(180px,1fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)_auto] lg:items-end">
        <Field label="Email">
          <input className={inputClass} value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@nesr.local" />
        </Field>
        <Field label="Name">
          <input className={inputClass} value={name} onChange={e => setName(e.target.value)} placeholder="Manager name" />
        </Field>
        <Field label="Permission Level">
          <select className={inputClass} value={role} onChange={e => setRole(e.target.value as ProcureGuardPermissionRole)}>
            {PERMISSION_ROLE_OPTIONS.map(item => <option key={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Country Scope">
          <select className={inputClass} value={country} onChange={e => setCountry(e.target.value)}>
            <option value="">All countries</option>
            {COUNTRY_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <Field label="Segment Scope">
          <select className={inputClass} value={segment} onChange={e => setSegment(e.target.value)}>
            <option value="">All segments</option>
            {SEGMENT_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </Field>
        <button type="button" disabled={isPending || !email.trim()} onClick={save} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#307c4c]/80 disabled:opacity-60">
          {isPending ? 'Saving' : 'Save'}
        </button>
      </div>
      {error && <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      <div className="mt-4">
        <RoleCapabilities role={role} />
      </div>
    </div>
  );
}

function PermissionsPanel({ rows, actor, isFullAdmin, onDone }: { rows: ProcureGuardPermissionRow[]; actor: ProcureGuardAdminData['actor']; isFullAdmin: boolean; onDone: (message: string) => void }) {
  const visibleRows = isFullAdmin
    ? rows
    : rows.filter(row => row.email.toLowerCase() === actor.email.toLowerCase());

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-bold text-slate-900">Current Permission Level</p>
        <p className="mt-1 text-xs text-slate-500">
          Your signed-in user is <span className="font-semibold text-slate-700">{actor.email}</span>.
          {isFullAdmin
            ? ' Change rows below to manage ProcureGuard approval access.'
            : ' Your role controls which ProcureGuard pages and actions are available.'}
        </p>
        <div className="mt-4">
          <RoleCapabilities role={actor.role} />
        </div>
      </div>

      {isFullAdmin && <PermissionEditor onDone={onDone} />}

      <div className="space-y-3">
        {visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">No permission records yet.</div>
        ) : visibleRows.map(row => (
          <PermissionEditor key={`${row.email}-${row.id}`} row={row} onDone={onDone} />
        ))}
      </div>
    </div>
  );
}
function RecipientEditor({ row, onDone }: { row: ProcureGuardNotificationContact; onDone: (message: string) => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [displayName, setDisplayName] = useState(row.display_name ?? '');
  const [email, setEmail] = useState(row.email ?? '');
  const [error, setError] = useState('');

  function save() {
    setError('');
    startTransition(async () => {
      const result = await updateProcureGuardNotificationRecipient({
        id: row.id,
        display_name: displayName,
        email,
      });
      if (!result.success) {
        setError(result.error ?? 'Recipient update failed.');
        return;
      }
      onDone(`Notification recipient saved for ${row.country} ${row.notification_role}.`);
      router.refresh();
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(130px,0.8fr)_minmax(110px,0.6fr)_minmax(190px,1fr)_minmax(190px,1fr)_minmax(180px,1fr)_minmax(220px,1.2fr)_auto] xl:items-end">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Country</p>
          <p className="mt-2 text-sm font-bold text-slate-900">{row.country}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Type</p>
          <p className="mt-2 text-sm font-bold capitalize text-slate-900">{row.request_type}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Role</p>
          <p className="mt-2 text-sm font-bold text-slate-900">{row.notification_role}</p>
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Approval Step</p>
          <p className="mt-2 text-sm font-bold text-slate-900">{row.approval_status || 'General notification'}</p>
        </div>
        <Field label="Display Name">
          <input className={inputClass} value={displayName} onChange={e => setDisplayName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className={inputClass} type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </Field>
        <button type="button" disabled={isPending || !displayName.trim() || !email.trim()} onClick={save} className="rounded-lg bg-[#307c4c] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#307c4c]/80 disabled:opacity-60">
          {isPending ? 'Saving' : 'Save'}
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
  const countries = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.country))).sort()], [rows]);
  const roles = useMemo(() => ['All', ...Array.from(new Set(rows.map(row => row.notification_role))).sort()], [rows]);
  const filtered = rows.filter(row =>
    (country === 'All' || row.country === country) &&
    (requestType === 'All' || row.request_type === requestType) &&
    (role === 'All' || row.notification_role === role)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-bold text-slate-900">Notification Recipients</p>
            <p className="mt-1 text-xs text-slate-500">Change the person/email assigned to each ProcureGuard approval role. These are used for the people contacted panel and n8n email routing.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:min-w-[580px]">
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

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">No notification recipients match these filters.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(row => <RecipientEditor key={row.id} row={row} onDone={onDone} />)}
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
            <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No activity records.</td></tr>
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
              <td className="px-4 py-3 text-slate-900">{row.action}</td>
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

export default function AdminPanelClient({ data, embedded = false }: { data: ProcureGuardAdminData | null; embedded?: boolean }) {
  const [tab, setTab] = useState<TabKey>('permissions');
  const [notice, setNotice] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const counts = useMemo(() => {
    if (!data) return { adhoc: 0, advance: 0, activity: 0, permissions: 0, recipients: 0 };
    return {
      adhoc: data.adhoc.length,
      advance: data.advance.length,
      activity: data.activity.length,
      permissions: data.permissions.length,
      recipients: data.notification_recipients.length,
    };
  }, [data]);

  if (!data) return <EmptyOrForbidden />;

  const isFullAdmin = data.actor.permissions.accessView === 'admin';
  const tabItems = (isFullAdmin ? [
    { key: 'permissions', label: 'Change User Roles', count: counts.permissions, description: 'Switch local users between requester, manager, finance, and admin roles.' },
    { key: 'recipients', label: 'Email Recipients', count: counts.recipients, description: 'Update who receives approval notifications for each role and country.' },
    { key: 'adhoc', label: 'Adhoc Payments', count: counts.adhoc, description: 'Review and remove adhoc test records.' },
    { key: 'advance', label: 'Advance Payments', count: counts.advance, description: 'Review and remove advance test records.' },
    { key: 'activity', label: 'Activity Log', count: counts.activity, description: 'See meaningful approval activity.' },
  ] : [
    { key: 'permissions', label: 'Change User Roles', count: counts.permissions, description: 'Review your ProcureGuard permission level.' },
  ]) as ReadonlyArray<{ key: TabKey; label: string; count: number; description: string }>;

  return (
    <div className={`${embedded ? '' : 'min-h-[100dvh]'} bg-white text-slate-900`}>
      {!embedded && <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} pendingCount={data.stats.pending_review} accessView={data.actor.permissions.accessView} />}
      {!embedded && <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3">
          <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#307c4c] text-xs font-black text-white">PG</div>
          <div>
            <p className="text-sm font-bold leading-tight">{isFullAdmin ? 'ProcureGuard Admin' : 'ProcureGuard Access'}</p>
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
        {isFullAdmin && <section className="grid grid-cols-1 gap-3 md:grid-cols-4">
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
        </section>}

        {notice && (
          <div className="mt-4 rounded-md border border-[#307c4c]/20 bg-[#307c4c]/10 px-4 py-3 text-sm font-semibold text-[#307c4c]">
            {notice}
          </div>
        )}

        {isFullAdmin && <section className="mt-5 grid grid-cols-1 gap-4">
          <AdhocForm actor={data.actor} onDone={setNotice} />
          <AdvanceForm actor={data.actor} onDone={setNotice} />
        </section>}

        <section className="mt-6">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-black uppercase tracking-wide text-[#307c4c]">Admin Controls</p>
              <h2 className="text-xl font-black text-slate-950">{isFullAdmin ? 'Data, roles, and notification routing' : 'Your ProcureGuard access'}</h2>
            </div>
            <p className="max-w-xl text-sm text-slate-500">
              {isFullAdmin
                ? 'Use the larger tiles below to change test roles or update who gets emailed for each approval step.'
                : 'This panel shows the ProcureGuard permission assigned to your SSO account.'}
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
            {isFullAdmin && tab === 'adhoc' && <AdhocTable rows={data.adhoc} onDone={setNotice} />}
            {isFullAdmin && tab === 'advance' && <AdvanceTable rows={data.advance} onDone={setNotice} />}
            {isFullAdmin && tab === 'activity' && <ActivityTable rows={data.activity} onDone={setNotice} />}
            {tab === 'permissions' && <PermissionsPanel rows={data.permissions} actor={data.actor} isFullAdmin={isFullAdmin} onDone={setNotice} />}
            {isFullAdmin && tab === 'recipients' && <NotificationRecipientsPanel rows={data.notification_recipients} onDone={setNotice} />}
          </div>
        </section>
      </main>
    </div>
  );
}




