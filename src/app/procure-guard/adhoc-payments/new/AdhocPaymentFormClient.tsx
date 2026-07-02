'use client';

import { useEffect, useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import ProcureGuardSidebar from '../../components/ProcureGuardSidebar';
import ProcureGuardNotificationContactsPanel from '../../components/ProcureGuardNotificationContactsPanel';
import ProcureGuardLogo from '../../components/ProcureGuardLogo';
import ProcureGuardHomeButton from '../../components/ProcureGuardHomeButton';
import ProcureGuardHero from '../../components/ProcureGuardHero';
import { createAdhocPayment, getProcureGuardNotificationPreview, updateAdhocPaymentRequest, uploadProcureGuardDocument } from '@/app/actions/procureGuard';
import {
  COUNTRY_OPTIONS,
  CURRENCY_OPTIONS,
  SEGMENT_OPTIONS,
  SPEND_CATEGORY_OPTIONS,
  toUsd,
  usdEquivalentFmt,
} from '@/lib/procureGuard-utils';
import type { AdhocPaymentRequest, CreateAdhocPaymentInput, ProcureGuardAccessView, ProcureGuardNotificationContact } from '@/types/procureGuard';

const LBL = 'block text-sm font-semibold text-slate-800 mb-2';
const INP = 'w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20 placeholder:text-slate-400';
const ERR = 'w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-red-500 focus:ring-2 focus:ring-red-100 placeholder:text-slate-400';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ADHOC_EMAIL_TEST_ROLES = ['SCM Manager', 'Supply Chain Director', 'Requester Updates'];

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div data-field-error={error ? 'true' : undefined}>
      <label className={LBL}>{required && <span className="mr-2">*</span>}{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  );
}

function fileBaseName(name: string) {
  return name.replace(/\.[^/.]+$/, '').trim() || 'Attachment';
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function parseNotificationEmails(value: string): string[] {
  return [...new Set(value.split(/[\s,;]+/).map(email => email.trim().toLowerCase()).filter(Boolean))];
}

function invalidNotificationEmails(value: string): string[] {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return parseNotificationEmails(value).filter(email => !emailPattern.test(email));
}

function initialRoleTestRecipients(editRequest: AdhocPaymentRequest | undefined, requesterEmail: string) {
  const overrides = editRequest?.email_test_recipient_overrides ?? {};
  return Object.fromEntries(
    ADHOC_EMAIL_TEST_ROLES.map(role => [
      role,
      (overrides[role]?.length ? overrides[role] : [requesterEmail]).join('\n'),
    ]),
  );
}

function roleTestRecipientOverrides(values: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(([role, emails]) => [role, parseNotificationEmails(emails)] as const)
      .filter(([, emails]) => emails.length > 0),
  );
}

function AttachmentPicker({
  files,
  onFilesSelected,
}: {
  files: File[];
  onFilesSelected: (files: File[]) => void;
}) {
  const inputId = useId();

  return (
    <div className="min-h-44 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input
        id={inputId}
        type="file"
        multiple
        className="sr-only"
        onChange={e => {
          const picked = Array.from(e.target.files || []);
          const merged = [...files];
          for (const f of picked) {
            if (!merged.some(m => m.name === f.name && m.size === f.size)) merged.push(f);
          }
          onFilesSelected(merged);
          e.target.value = ''; // allow re-selecting the same file and adding more later
        }}
      />
      <div className="flex flex-col gap-3">
        <label
          htmlFor={inputId}
          className="inline-flex w-fit cursor-pointer items-center justify-center rounded-md border border-[#307c4c]/30 bg-white px-3.5 py-2 text-xs font-bold text-[#307c4c] shadow-sm transition hover:border-[#307c4c]/60 hover:bg-[#307c4c]/5 focus:outline-none focus:ring-2 focus:ring-[#307c4c]/20"
        >
          Choose files
        </label>
        <p className="text-xs leading-relaxed text-slate-500">Attach supporting documents up to 10 MB each.</p>
      </div>
      {files.length === 0 ? (
        <p className="mt-5 rounded-md border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">There is nothing attached.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {files.map(file => (
            <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 shadow-sm">
              <span className="min-w-0 truncate font-semibold text-slate-900">{file.name}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-slate-400">{fmtBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => onFilesSelected(files.filter(f => !(f.name === file.name && f.size === file.size)))}
                  className="rounded p-0.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  aria-label={`Remove ${file.name}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdhocPaymentFormClient(_props: {
  requesterName: string;
  requesterEmail: string;
  defaultDepartment: string;
  accessView: ProcureGuardAccessView;
  editRequest?: AdhocPaymentRequest;
}) {
  const { accessView, editRequest } = _props;
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');

  const [requisitionNumber, setRequisitionNumber] = useState(editRequest?.requisition_number ?? '');
  const [country, setCountry] = useState(editRequest?.country ?? '');
  const [segment, setSegment] = useState(editRequest?.segment ?? '');
  const [vendorName, setVendorName] = useState(editRequest?.vendor_name ?? '');
  const [vendorTaxId, setVendorTaxId] = useState(editRequest?.vendor_tax_id ?? editRequest?.vendor_code ?? '');
  const [spendCategory, setSpendCategory] = useState(editRequest?.spend_category ?? editRequest?.expense_category ?? '');
  const [amountValue, setAmountValue] = useState(editRequest ? String(editRequest.amount ?? '') : '');
  const [currency, setCurrency] = useState(editRequest?.currency ?? 'USD');
  const [reason, setReason] = useState(editRequest?.payment_reason ?? editRequest?.justification ?? '');
  const [requesterComments, setRequesterComments] = useState(editRequest?.requester_comments ?? editRequest?.notes ?? '');
  const [requesterNotificationEmails, setRequesterNotificationEmails] = useState((editRequest?.requester_notification_emails ?? []).join('\n'));
  const [emailTestMode, setEmailTestMode] = useState(Boolean(editRequest?.email_test_mode));
  const [emailTestRecipients, setEmailTestRecipients] = useState((editRequest?.email_test_recipients?.length ? editRequest.email_test_recipients : [_props.requesterEmail]).join('\n'));
  const [roleTestRecipients, setRoleTestRecipients] = useState<Record<string, string>>(() => initialRoleTestRecipients(editRequest, _props.requesterEmail));
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [acknowledged, setAcknowledged] = useState(Boolean(editRequest?.acknowledged_at));
  const [notificationContacts, setNotificationContacts] = useState<ProcureGuardNotificationContact[]>([]);
  const [contactsLoading, setContactsLoading] = useState(false);

  const isEditMode = Boolean(editRequest);
  const detailHref = editRequest ? `/procure-guard/adhoc-payments/${editRequest.id}` : '/procure-guard/adhoc-payments';

  useEffect(() => {
    let cancelled = false;

    async function loadNotificationContacts() {
      if (!country) {
        if (!cancelled) {
          setNotificationContacts([]);
          setContactsLoading(false);
        }
        return;
      }

      setContactsLoading(true);
      const contacts = await getProcureGuardNotificationPreview({
        requestType: 'adhoc',
        country,
        amount: Number(amountValue) || 0,
        currency,
      });
      if (!cancelled) {
        setNotificationContacts(contacts);
        setContactsLoading(false);
      }
    }

    void loadNotificationContacts();
    return () => { cancelled = true; };
  }, [country, amountValue, currency]);

  function validate() {
    const e: Record<string, string> = {};
    if (!requisitionNumber.trim()) e.requisitionNumber = 'Requisition number is required.';
    if (!country) e.country = 'Country is required.';
    if (!segment) e.segment = 'Segment is required.';
    if (!vendorName.trim()) e.vendorName = 'ADHOC vendor name is required.';
    if (!vendorTaxId.trim()) e.vendorTaxId = 'Vendor tax ID is required.';
    if (!spendCategory) e.spendCategory = 'Spend category is required.';
    if (!amountValue || Number(amountValue) <= 0) e.amountValue = 'Amount must be greater than zero.';
    if (!reason.trim()) e.reason = 'Reason / justification is required.';
    const invalidEmails = invalidNotificationEmails(requesterNotificationEmails);
    if (invalidEmails.length > 0) e.requesterNotificationEmails = `Invalid email: ${invalidEmails[0]}`;
    const invalidTestEmails = invalidNotificationEmails(emailTestRecipients);
    const hasRoleTestRecipients = Object.values(roleTestRecipientOverrides(roleTestRecipients)).some(emails => emails.length > 0);
    if (emailTestMode && parseNotificationEmails(emailTestRecipients).length === 0 && !hasRoleTestRecipients) e.emailTestRecipients = 'Add at least one fallback or role-specific test recipient.';
    if (invalidTestEmails.length > 0) e.emailTestRecipients = `Invalid email: ${invalidTestEmails[0]}`;
    if (emailTestMode) {
      for (const [role, emails] of Object.entries(roleTestRecipients)) {
        const invalidRoleEmails = invalidNotificationEmails(emails);
        if (invalidRoleEmails.length > 0) e[`roleTest-${role}`] = `Invalid email: ${invalidRoleEmails[0]}`;
      }
    }
    if (selectedFiles.some(file => file.size > MAX_FILE_BYTES)) e.attachments = 'Each file must be 10 MB or smaller.';
    if (!acknowledged) e.acknowledged = 'Acknowledgement is required.';
    return e;
  }

  function clearForm() {
    setRequisitionNumber(editRequest?.requisition_number ?? '');
    setCountry(editRequest?.country ?? '');
    setSegment(editRequest?.segment ?? '');
    setVendorName(editRequest?.vendor_name ?? '');
    setVendorTaxId(editRequest?.vendor_tax_id ?? editRequest?.vendor_code ?? '');
    setSpendCategory(editRequest?.spend_category ?? editRequest?.expense_category ?? '');
    setAmountValue(editRequest ? String(editRequest.amount ?? '') : '');
    setCurrency(editRequest?.currency ?? 'USD');
    setReason(editRequest?.payment_reason ?? editRequest?.justification ?? '');
    setRequesterComments(editRequest?.requester_comments ?? editRequest?.notes ?? '');
    setRequesterNotificationEmails((editRequest?.requester_notification_emails ?? []).join('\n'));
    setEmailTestMode(Boolean(editRequest?.email_test_mode));
    setEmailTestRecipients((editRequest?.email_test_recipients?.length ? editRequest.email_test_recipients : [_props.requesterEmail]).join('\n'));
    setRoleTestRecipients(initialRoleTestRecipients(editRequest, _props.requesterEmail));
    setSelectedFiles([]);
    setAcknowledged(Boolean(editRequest?.acknowledged_at));
    setErrors({});
    setBanner('');
  }

  async function uploadFiles(requestId: number) {
    for (const file of selectedFiles) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('request_type', 'adhoc');
      fd.append('request_id', String(requestId));
      fd.append('document_type', 'request_attachment');
      fd.append('custom_name', fileBaseName(file.name));
      const uploaded = await uploadProcureGuardDocument(fd);
      if (!uploaded.success) return uploaded.error || `Upload failed for ${file.name}.`;
    }
    return '';
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBanner('');
    const nextErrors = validate();
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      requestAnimationFrame(() => {
        document.querySelector('[data-field-error="true"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }
    setErrors({});

    const amount = Number(amountValue);
    const payload: CreateAdhocPaymentInput = {
      priority: 'Normal',
      requisition_number: requisitionNumber,
      vendor_name: vendorName,
      vendor_code: vendorTaxId,
      vendor_tax_id: vendorTaxId,
      amount,
      currency,
      country,
      segment,
      spend_category: spendCategory,
      spend_value_usd: toUsd(amount, currency),
      expense_category: spendCategory,
      payment_method: 'Bank Transfer',
      payment_reason: reason,
      justification: reason,
      notes: requesterComments,
      requester_comments: requesterComments,
      requester_notification_emails: parseNotificationEmails(requesterNotificationEmails).filter(email => email !== _props.requesterEmail.toLowerCase()),
      email_test_mode: emailTestMode,
      email_test_recipients: emailTestMode ? parseNotificationEmails(emailTestRecipients) : [],
      email_test_recipient_overrides: emailTestMode ? roleTestRecipientOverrides(roleTestRecipients) : {},
      acknowledged,
    };

    startTransition(async () => {
      const result = editRequest
        ? await updateAdhocPaymentRequest(editRequest.id, payload)
        : await createAdhocPayment(payload);
      if (result.success && result.data?.id) {
        const uploadError = await uploadFiles(result.data.id);
        if (uploadError) {
          setBanner(`${result.reference_number || 'Request'} was ${isEditMode ? 'updated' : 'created'}, but an attachment failed: ${uploadError}`);
          return;
        }
        router.push(`/procure-guard/adhoc-payments/${result.data.id}`);
        router.refresh();
      } else {
        setBanner(result.error ?? `Failed to ${isEditMode ? 'update' : 'submit'} adhoc PO request.`);
      }
    });
  }

  return (
    <div className="min-h-[100dvh] bg-white font-sans text-slate-900">
      <ProcureGuardSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} accessView={accessView} />

      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-100 bg-white/80 px-4 backdrop-blur-md md:px-8">
        <button onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" /></svg>
        </button>
        <ProcureGuardHomeButton />
        <ProcureGuardLogo size="sm" />
        <span className="text-sm font-semibold text-slate-900">{isEditMode ? 'Edit ADHOC Vendor Purchase Exception Request' : 'ADHOC Vendor Purchase Exception Request'}</span>
      </header>

      <main className="flex-1 overflow-y-auto pb-20">
        <div className="mx-auto max-w-[1280px] px-5 pt-6 sm:px-8">
          <ProcureGuardHero
            title={isEditMode ? 'Edit ADHOC Vendor Purchase Exception Request' : 'ADHOC Vendor Purchase Exception Request'}
            subtitle="Complete the required fields below and submit for supply chain review."
          />
        </div>

        <form onSubmit={handleSubmit} className="mx-auto max-w-[1280px] space-y-7 px-5 py-4 sm:px-8">
          {banner && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{banner}</div>}

          <section className="grid grid-cols-1 gap-x-10 gap-y-7 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Field label="Requisition Number" required error={errors.requisitionNumber}>
                <input className={errors.requisitionNumber ? ERR : INP} value={requisitionNumber} onChange={e => setRequisitionNumber(e.target.value)} />
              </Field>
            </div>
            <Field label="Country" required error={errors.country}>
              <select className={errors.country ? ERR : INP} value={country} onChange={e => setCountry(e.target.value)}>
                <option value="">Find Country</option>
                {COUNTRY_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Segment" required error={errors.segment}>
              <select className={errors.segment ? ERR : INP} value={segment} onChange={e => setSegment(e.target.value)}>
                <option value="">Find Segment</option>
                {SEGMENT_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="ADHOC Vendor Name" required error={errors.vendorName}>
              <input className={errors.vendorName ? ERR : INP} value={vendorName} onChange={e => setVendorName(e.target.value)} />
            </Field>
            <Field label="Vendor Tax ID" required error={errors.vendorTaxId}>
              <input className={errors.vendorTaxId ? ERR : INP} value={vendorTaxId} onChange={e => setVendorTaxId(e.target.value)} />
            </Field>
            <Field label="Spend Category" required error={errors.spendCategory}>
              <select className={errors.spendCategory ? ERR : INP} value={spendCategory} onChange={e => setSpendCategory(e.target.value)}>
                <option value="">Find Category</option>
                {SPEND_CATEGORY_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Amount" required error={errors.amountValue}>
              <div className="flex gap-2">
                <select
                  className="w-20 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/20"
                  value={currency}
                  onChange={e => setCurrency(e.target.value)}
                >
                  {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input type="number" min="0.01" step="0.01" className={`${errors.amountValue ? ERR : INP} min-w-0 flex-1`} value={amountValue} onChange={e => setAmountValue(e.target.value)} />
              </div>
              {currency !== 'USD' && Number(amountValue) > 0 && (
                <p className="mt-1.5 text-xs text-slate-400">≈ {usdEquivalentFmt(amountValue, currency)} (used for approval thresholds)</p>
              )}
            </Field>
            <div className="lg:col-span-3">
              <Field label="Reason/ Justification of Exception" required error={errors.reason}>
                <textarea className={`${errors.reason ? ERR : INP} min-h-44 resize-none`} value={reason} onChange={e => setReason(e.target.value)} />
              </Field>
            </div>
            <div>
              <Field label="Attachments" error={errors.attachments}>
                <AttachmentPicker files={selectedFiles} onFilesSelected={setSelectedFiles} />
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Requester Comments">
                <textarea className={`${INP} min-h-28 resize-none`} value={requesterComments} onChange={e => setRequesterComments(e.target.value)} />
              </Field>
            </div>
            <div className="lg:col-span-2">
              <Field label="Additional Request Notifications" error={errors.requesterNotificationEmails}>
                <textarea
                  className={`${errors.requesterNotificationEmails ? ERR : INP} min-h-28 resize-none`}
                  value={requesterNotificationEmails}
                  onChange={e => setRequesterNotificationEmails(e.target.value)}
                  placeholder="Add emails separated by commas, spaces, or new lines"
                />
                <p className="mt-1.5 text-xs text-slate-500">These people will receive requester-side status updates and can view this request.</p>
              </Field>
            </div>
            <div className="lg:col-span-4">
              <ProcureGuardNotificationContactsPanel
                contacts={notificationContacts}
                currentStatus="Submitted"
                loading={contactsLoading}
                emptyText="Select a country to see the approvers who will be contacted."
              />
            </div>
            <div className="lg:col-span-2">
              <Field label="Acknowledgement" required error={errors.acknowledged}>
                <label className="flex items-center gap-3 text-sm text-slate-900">
                  <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className="h-5 w-5 rounded border-slate-300 text-[#307c4c] focus:ring-[#307c4c]/20" />
                  By checking this box, I acknowledge that this is a one-time vendor.
                </label>
              </Field>
            </div>
          </section>

          <div className="flex flex-col justify-end gap-4 sm:flex-row">
            <button disabled={isPending} className="rounded-lg bg-[#307c4c] px-12 py-2.5 text-sm font-bold text-white hover:bg-[#307c4c]/80 disabled:opacity-60">
              {isPending ? (isEditMode ? 'Saving...' : 'Submitting...') : (isEditMode ? 'Save Changes' : 'Submit')}
            </button>
            <button type="button" onClick={clearForm} className="rounded-lg border border-slate-200 bg-white px-12 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50">
              {isEditMode ? 'Reset Form' : 'Clear Form'}
            </button>
            <button type="button" onClick={() => router.push(detailHref)} className="rounded-lg border border-red-200 bg-red-50 px-12 py-2.5 text-sm font-bold text-red-700 transition-colors hover:bg-red-100">
              Cancel
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
