'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from '../../components/LaptopShell';
import { createLaptopRequest, updateLaptopRequest, uploadLaptopDocument } from '@/app/actions/laptopProcurement';
import {
  COUNTRY_OPTIONS,
  DEVICE_TYPE_OPTIONS,
  REQUEST_TYPE_OPTIONS,
} from '@/lib/laptopProcurement-utils';
import {
  getCompaniesForRequestorCountry,
  getCompanyByCode,
  getCostCenterFor,
  getDepartmentsForCompany,
} from '@/lib/laptopCostCenterMapping';
import type { EmployeeDirectoryDefaults } from '@/app/actions/employeeDirectory';
import type {
  CreateLaptopRequestInput,
  LaptopAccessView,
  LaptopRequest,
} from '@/types/laptopProcurement';

const LBL = 'mb-2 block text-sm font-semibold text-slate-900';
const INP = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';
const ERR = 'w-full rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-200';
const LOCKED_INP = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-500 shadow-sm outline-none cursor-not-allowed';
const DISPLAY_INP = 'w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

// Display-only labels — the option's value (and everything downstream: DB column,
// approval routing) stays the plain REQUEST_TYPE_OPTIONS string.
const REQUEST_TYPE_LABELS: Record<string, string> = {
  'New Employee': 'New Employee (form for HR only)',
  'Upgrade/Replacement': 'Upgrade/Replacement (for self)',
  'Unit': 'for Unit',
};

function Field({ label, required, error, hint, children }: { label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div data-field-error={error ? 'true' : undefined}>
      <label className={LBL}>{required && <span className="mr-1 text-red-500">*</span>}{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-slate-400">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-semibold text-red-700">{error}</p>}
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

function AttachmentPicker({ files, onFilesSelected }: { files: File[]; onFilesSelected: (files: File[]) => void }) {
  const inputId = useId();
  return (
    <div className="min-h-44 rounded-2xl border border-slate-200 bg-white p-4">
      <input id={inputId} type="file" multiple className="sr-only" onChange={e => onFilesSelected(Array.from(e.target.files || []))} />
      <div className="flex flex-col gap-3">
        <label htmlFor={inputId} className="inline-flex w-fit cursor-pointer items-center justify-center rounded-lg border border-[#307c4c]/30 bg-white px-4 py-2 text-xs font-bold text-[#307c4c] shadow-sm transition hover:border-[#307c4c]/60 hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#307c4c]/25">
          Choose files
        </label>
        <p className="text-xs leading-relaxed text-slate-500">Attach supporting documents (quotes, photos, approvals) up to 10 MB each.</p>
      </div>
      {files.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">There is nothing attached.</p>
      ) : (
        <div className="mt-4 space-y-2">
          {files.map(file => (
            <div key={`${file.name}-${file.size}`} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 shadow-sm">
              <span className="min-w-0 truncate font-semibold text-slate-900">{file.name}</span>
              <span className="shrink-0 text-slate-400">{fmtBytes(file.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function LaptopRequestFormClient({
  requesterName,
  accessView,
  editRequest,
  directoryDefaults,
}: {
  requesterName: string;
  requesterEmail: string;
  accessView: LaptopAccessView;
  editRequest?: LaptopRequest;
  directoryDefaults?: EmployeeDirectoryDefaults | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');

  const [requestType, setRequestType] = useState(editRequest?.request_type ?? '');
  // No longer collected from the requester — always defaults to Normal for new
  // requests, and preserves whatever an existing request already had on edit.
  const priority = editRequest?.priority ?? 'Normal';
  const [employeeId, setEmployeeId] = useState(editRequest?.employee_id ?? '');
  const [country, setCountry] = useState(editRequest?.country ?? '');
  const [department, setDepartment] = useState(editRequest?.department ?? '');
  const [computerFor, setComputerFor] = useState(editRequest?.computer_for ?? '');
  const [computerForEmployeeId, setComputerForEmployeeId] = useState(editRequest?.computer_for_employee_id ?? '');
  const [companyCode, setCompanyCode] = useState(editRequest?.company_code ?? '');
  const [companyName, setCompanyName] = useState(editRequest?.company_name ?? '');
  const [costCenter, setCostCenter] = useState(editRequest?.cost_center ?? '');
  const [typeOfDevice, setTypeOfDevice] = useState(editRequest?.type_of_device ?? '');
  const [specialRequirements, setSpecialRequirements] = useState(editRequest?.special_requirements ?? '');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

  const isEditMode = Boolean(editRequest);
  const detailHref = editRequest ? `/laptop-procurement/requests/${editRequest.id}` : '/laptop-procurement/requests';

  // "Computer For" only applies to New Employee requests (HR names the new hire);
  // Unit requests name the unit instead, via the same underlying field; self-service
  // Upgrade/Replacement requests need neither since the requester is the recipient.
  const isNewEmployee = requestType === 'New Employee';
  const isUnit = requestType === 'Unit';
  const isSelfRequest = requestType === 'Upgrade/Replacement' || isUnit;

  // Companies available in the Cost Allocation dropdown for New Employee, filtered by
  // the requestor's own country (from the Excel-derived mapping in laptopCostCenterMapping).
  const availableCompanies = getCompaniesForRequestorCountry(country);
  // Departments (and their cost centers) available for whichever company is currently
  // selected — drives both the New Employee "Computer For" department dropdown and the
  // Cost Center auto-fill.
  const availableDepartments = getDepartmentsForCompany(companyCode);

  // Self-service requests (Upgrade/Replacement, Unit) are for the requester's own
  // record, so the directory can fill in what it already knows instead of the requester
  // retyping it — and, since it's their own record, Cost Allocation can be fully
  // resolved and locked too. New Employee requests only get the requestor's own
  // employee ID auto-filled; the new hire's details and the company they should be
  // allocated to are picked manually. Country is always chosen manually — the
  // directory's country values don't reliably line up with COUNTRY_OPTIONS, so
  // auto-filling it risked silently picking the wrong one. Never overwrites a field
  // the requester has already typed into.
  function handleRequestTypeChange(value: string) {
    setRequestType(value);
    if (isEditMode || !directoryDefaults) return;
    const willBeSelfRequest = value === 'Upgrade/Replacement' || value === 'Unit';

    const nextEmployeeId = !employeeId.trim() && directoryDefaults.employeeId ? directoryDefaults.employeeId : employeeId;
    if (nextEmployeeId !== employeeId) setEmployeeId(nextEmployeeId);
    if (!willBeSelfRequest) return;

    const nextDepartment = !department.trim() && directoryDefaults.department ? directoryDefaults.department : department;
    const nextCompanyCode = !companyCode.trim() && directoryDefaults.companyCode ? directoryDefaults.companyCode : companyCode;
    if (nextDepartment !== department) setDepartment(nextDepartment);
    if (nextCompanyCode !== companyCode) setCompanyCode(nextCompanyCode);

    const company = getCompanyByCode(nextCompanyCode);
    if (company) setCompanyName(company.name);

    const nextCostCenter = costCenter.trim() ? costCenter : (getCostCenterFor(nextCompanyCode, nextDepartment) ?? directoryDefaults.costCenter ?? '');
    if (nextCostCenter !== costCenter) setCostCenter(nextCostCenter);
  }

  // Requestor's department is editable for self-service requests (auto-filled, but the
  // directory can be wrong) — re-derive Cost Center whenever it changes, since it's
  // looked up by company + department.
  function handleSelfDepartmentChange(value: string) {
    setDepartment(value);
    const cc = getCostCenterFor(companyCode, value);
    if (cc) setCostCenter(cc);
  }

  // New Employee's "Computer For" department drives Cost Center directly, since the
  // company was already chosen in Cost Allocation.
  function handleComputerForDepartmentChange(value: string) {
    setDepartment(value);
    setCostCenter(getCostCenterFor(companyCode, value) ?? '');
  }

  // Company Name and Company Code are two views of the same underlying company record
  // (keyed by code) — selecting either one fills both, per the 1-1 mapping. Changing
  // company invalidates whatever department/cost center was picked for the old one.
  function handleCompanyChange(code: string) {
    setCompanyCode(code);
    const company = getCompanyByCode(code);
    setCompanyName(company?.name ?? '');
    setDepartment('');
    setCostCenter('');
  }

  function handleCountryChange(value: string) {
    setCountry(value);
    if (!isNewEmployee) return;
    const validCodes = new Set(getCompaniesForRequestorCountry(value).map(c => c.code));
    if (companyCode && !validCodes.has(companyCode)) {
      setCompanyCode('');
      setCompanyName('');
      setDepartment('');
      setCostCenter('');
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!requestType) e.requestType = 'Type of request is required.';
    if (!employeeId.trim()) e.employeeId = 'Employee ID is required.';
    if (!country) e.country = 'Country is required.';
    if (isNewEmployee) {
      if (!computerFor.trim()) e.computerFor = "Employee's name is required.";
      if (!department.trim()) e.department = 'Department is required.';
    }
    if (isUnit && !computerFor.trim()) e.computerFor = 'Unit Name / ID is required.';
    if (isSelfRequest && !department.trim()) e.department = 'Department is required.';
    if (!companyCode.trim()) e.companyCode = 'Company Code is required.';
    if (!companyName.trim()) e.companyName = 'Company Name is required.';
    if (!costCenter.trim()) e.costCenter = 'Cost Center is required.';
    if (!typeOfDevice) e.typeOfDevice = 'Type of device is required.';
    if (!specialRequirements.trim()) e.specialRequirements = 'Special requirements / justification is required.';
    if (selectedFiles.some(file => file.size > MAX_FILE_BYTES)) e.attachments = 'Each file must be 10 MB or smaller.';
    return e;
  }

  async function uploadFiles(requestId: number) {
    for (const file of selectedFiles) {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('request_id', String(requestId));
      fd.append('document_type', 'request_attachment');
      fd.append('custom_name', fileBaseName(file.name));
      const uploaded = await uploadLaptopDocument(fd);
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

    const payload: CreateLaptopRequestInput = {
      priority: priority as CreateLaptopRequestInput['priority'],
      request_type: requestType,
      employee_id: employeeId,
      country,
      computer_for: computerFor,
      computer_for_employee_id: computerForEmployeeId,
      department,
      company_code: companyCode,
      company_name: companyName,
      cost_center: costCenter,
      type_of_device: typeOfDevice,
      special_requirements: specialRequirements,
    };

    startTransition(async () => {
      const result = editRequest
        ? await updateLaptopRequest(editRequest.id, payload)
        : await createLaptopRequest(payload);
      if (result.success && result.data?.id) {
        const uploadError = await uploadFiles(result.data.id);
        if (uploadError) {
          setBanner(`${result.reference_number || 'Request'} was ${isEditMode ? 'updated' : 'created'}, but an attachment failed: ${uploadError}`);
          return;
        }
        router.push(`/laptop-procurement/requests/${result.data.id}`);
        router.refresh();
      } else {
        setBanner(result.error ?? `Failed to ${isEditMode ? 'update' : 'submit'} request.`);
      }
    });
  }

  return (
    <LaptopShell
      title={isEditMode ? 'Edit Laptop / Desktop Request' : 'New Laptop / Desktop Request'}
      subtitle="Routes through IT review → Country Manager, then IT Director → SC Director only if a new device is procured"
      accessView={accessView}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {banner && <div className="rounded-2xl border border-red-300 bg-red-100 px-4 py-3 text-sm font-semibold text-red-900">{banner}</div>}

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Request</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            <Field label="Type of Request" required error={errors.requestType}>
              <select className={errors.requestType ? ERR : INP} value={requestType} onChange={e => handleRequestTypeChange(e.target.value)}>
                <option value="">Select request type</option>
                {REQUEST_TYPE_OPTIONS.map(item => <option key={item} value={item}>{REQUEST_TYPE_LABELS[item] ?? item}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Requestor Details</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
            <Field label="Requestor Name">
              <input className={DISPLAY_INP} value={requesterName} disabled />
            </Field>
            <Field label="Employee ID" required error={errors.employeeId}>
              <input className={errors.employeeId ? ERR : INP} value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
            </Field>
            <Field label="Country" required error={errors.country}>
              <select className={errors.country ? ERR : INP} value={country} onChange={e => handleCountryChange(e.target.value)}>
                <option value="">Find Country</option>
                {COUNTRY_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            {isSelfRequest && (
              <Field label="Department" required error={errors.department}>
                <input className={errors.department ? ERR : INP} value={department} onChange={e => handleSelfDepartmentChange(e.target.value)} />
              </Field>
            )}
            {isUnit && (
              <Field label="Unit Name / ID" required error={errors.computerFor}>
                <input
                  className={errors.computerFor ? ERR : INP}
                  value={computerFor}
                  onChange={e => setComputerFor(e.target.value)}
                  placeholder="Enter the unit's name or ID"
                />
              </Field>
            )}
          </div>
        </section>

        {isNewEmployee && (
          <section className={`${GLASS} p-5 sm:p-6`}>
            <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Computer For Details</h2>
            <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
              <Field label="Name" required error={errors.computerFor}>
                <input
                  className={errors.computerFor ? ERR : INP}
                  value={computerFor}
                  onChange={e => setComputerFor(e.target.value)}
                  placeholder="Enter the new employee's name"
                />
              </Field>
              <Field label="Employee ID">
                <input
                  className={INP}
                  value={computerForEmployeeId}
                  onChange={e => setComputerForEmployeeId(e.target.value)}
                  placeholder="If available"
                />
              </Field>
            </div>
          </section>
        )}

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Cost Allocation</h2>
          {isSelfRequest && (
            <p className="mb-4 text-xs text-slate-400">Auto-filled from your employee record — locked.</p>
          )}
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
            {isSelfRequest ? (
              <>
                <Field label="Company Code" required error={errors.companyCode}>
                  <input className={LOCKED_INP} value={companyCode} disabled readOnly />
                </Field>
                <Field label="Company Name" required error={errors.companyName}>
                  <input className={LOCKED_INP} value={companyName} disabled readOnly />
                </Field>
                <Field label="Cost Center" required error={errors.costCenter}>
                  <input className={LOCKED_INP} value={costCenter} disabled readOnly />
                </Field>
              </>
            ) : (
              <>
                <Field
                  label="Company Name"
                  required
                  error={errors.companyName}
                  hint={!country ? 'Select Country in Requestor Details first.' : undefined}
                >
                  <select className={errors.companyName ? ERR : INP} value={companyCode} disabled={!country} onChange={e => handleCompanyChange(e.target.value)}>
                    <option value="">{country ? 'Find Company Name' : 'Select country first'}</option>
                    {availableCompanies.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </Field>
                <Field label="Company Code" required error={errors.companyCode}>
                  <select className={errors.companyCode ? ERR : INP} value={companyCode} disabled={!country} onChange={e => handleCompanyChange(e.target.value)}>
                    <option value="">{country ? 'Find Company Code' : 'Select country first'}</option>
                    {availableCompanies.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
                  </select>
                </Field>
                <Field
                  label="Department"
                  required
                  error={errors.department}
                  hint={!companyCode ? 'Select Company Name above first.' : undefined}
                >
                  <select
                    className={errors.department ? ERR : INP}
                    value={department}
                    disabled={!companyCode}
                    onChange={e => handleComputerForDepartmentChange(e.target.value)}
                  >
                    <option value="">{companyCode ? 'Select department' : 'Select company first'}</option>
                    {availableDepartments.map(d => <option key={d.department} value={d.department}>{d.department}</option>)}
                  </select>
                </Field>
                <Field label="Cost Center" required error={errors.costCenter}>
                  <input className={LOCKED_INP} value={costCenter} disabled readOnly placeholder="Auto-filled once Department is chosen above" />
                </Field>
              </>
            )}
          </div>
        </section>

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Requested Device</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            <Field label="Type of Device" required error={errors.typeOfDevice}>
              <select
                className={errors.typeOfDevice ? ERR : INP}
                value={typeOfDevice}
                onChange={e => setTypeOfDevice(e.target.value)}
              >
                <option value="">Select device type</option>
                {DEVICE_TYPE_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-6">
            <Field label="Special Requirements / Reason / Justification" required error={errors.specialRequirements}>
              <textarea className={`${errors.specialRequirements ? ERR : INP} min-h-40 resize-none`} value={specialRequirements} onChange={e => setSpecialRequirements(e.target.value)} placeholder="Describe the need, any special configuration, and the justification for this request." />
            </Field>
          </div>
        </section>

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Attachments</h2>
          <Field label="Supporting Documents" error={errors.attachments}>
            <AttachmentPicker files={selectedFiles} onFilesSelected={setSelectedFiles} />
          </Field>
        </section>

        <div className="flex flex-col justify-end gap-3 sm:flex-row">
          <button disabled={isPending} className={`${CTA} px-10 disabled:opacity-60`}>
            {isPending ? (isEditMode ? 'Saving...' : 'Submitting...') : (isEditMode ? 'Save Changes' : 'Submit')}
          </button>
          <button type="button" onClick={() => router.push(detailHref)} className="rounded-lg border border-red-300 bg-red-50 px-8 py-2.5 text-sm font-bold text-red-800 transition hover:bg-red-100">
            Cancel
          </button>
        </div>
      </form>
    </LaptopShell>
  );
}
