'use client';

import { useId, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import LaptopShell, { CTA, GLASS } from '../../components/LaptopShell';
import { createLaptopRequest, updateLaptopRequest, uploadLaptopDocument } from '@/app/actions/laptopProcurement';
import {
  COUNTRY_OPTIONS,
  DEVICE_TYPE_OPTIONS,
  PRIORITY_OPTIONS,
  REQUEST_TYPE_OPTIONS,
  SEGMENT_OPTIONS,
} from '@/lib/laptopProcurement-utils';
import type {
  CreateLaptopRequestInput,
  LaptopAccessView,
  LaptopDeviceOption,
  LaptopRequest,
} from '@/types/laptopProcurement';

const LBL = 'mb-2 block text-sm font-semibold text-slate-900';
const INP = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#307c4c] focus:ring-2 focus:ring-[#307c4c]/25';
const ERR = 'w-full rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-2 focus:ring-red-200';
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div data-field-error={error ? 'true' : undefined}>
      <label className={LBL}>{required && <span className="mr-1 text-red-500">*</span>}{label}</label>
      {children}
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
  accessView,
  devices,
  editRequest,
  defaultEmployeeId,
}: {
  requesterName: string;
  requesterEmail: string;
  accessView: LaptopAccessView;
  devices: LaptopDeviceOption[];
  editRequest?: LaptopRequest;
  defaultEmployeeId?: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState('');

  const [requestType, setRequestType] = useState(editRequest?.request_type ?? '');
  const [priority, setPriority] = useState(editRequest?.priority ?? 'Normal');
  const [employeeId, setEmployeeId] = useState(editRequest?.employee_id ?? '');
  const [country, setCountry] = useState(editRequest?.country ?? '');
  const [segment, setSegment] = useState(editRequest?.segment ?? '');
  const [department, setDepartment] = useState(editRequest?.department ?? '');
  const [position, setPosition] = useState(editRequest?.position ?? '');
  const [computerFor, setComputerFor] = useState(editRequest?.computer_for ?? '');
  const [companyCode, setCompanyCode] = useState(editRequest?.company_code ?? '');
  const [companyName, setCompanyName] = useState(editRequest?.company_name ?? '');
  const [costCenter, setCostCenter] = useState(editRequest?.cost_center ?? '');
  const [typeOfDevice, setTypeOfDevice] = useState(editRequest?.type_of_device ?? '');
  const [requestedModel, setRequestedModel] = useState(editRequest?.requested_model ?? '');
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

  const modelOptions = useMemo(
    () => [...new Set(devices.filter(d => !typeOfDevice || d.type_of_device === typeOfDevice).map(d => d.model))],
    [devices, typeOfDevice],
  );

  // Self-service requests are for the requester's own device, so their HR employee
  // ID can be pulled from the directory instead of typed in. New Employee requests
  // are on behalf of someone else, so this never applies there.
  function handleRequestTypeChange(value: string) {
    setRequestType(value);
    const willBeSelfRequest = value === 'Upgrade/Replacement' || value === 'Unit';
    if (!isEditMode && willBeSelfRequest && defaultEmployeeId && !employeeId.trim()) {
      setEmployeeId(defaultEmployeeId);
    }
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!requestType) e.requestType = 'Type of request is required.';
    if (isSelfRequest && !employeeId.trim()) e.employeeId = 'Employee ID is required.';
    if (isNewEmployee && !computerFor.trim()) e.computerFor = 'Computer For is required.';
    if (isUnit && !computerFor.trim()) e.computerFor = 'Unit Name is required.';
    if (!country) e.country = 'Country is required.';
    if (!segment) e.segment = 'Segment is required.';
    if (!department.trim()) e.department = 'Department is required.';
    if (!position.trim()) e.position = 'Position is required.';
    if (!companyName.trim()) e.companyName = 'Company Name is required.';
    if (!typeOfDevice) e.typeOfDevice = 'Type of device is required.';
    if (!requestedModel) e.requestedModel = 'Requested model is required.';
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
      segment,
      department,
      position,
      company_code: companyCode,
      company_name: companyName,
      cost_center: costCenter,
      type_of_device: typeOfDevice,
      requested_model: requestedModel,
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
      subtitle="Routes through IT review → Country Manager → IT Director → SC Director"
      accessView={accessView}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {banner && <div className="rounded-2xl border border-red-300 bg-red-100 px-4 py-3 text-sm font-semibold text-red-900">{banner}</div>}

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Request</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-4">
            <Field label="Type of Request" required error={errors.requestType}>
              <select className={errors.requestType ? ERR : INP} value={requestType} onChange={e => handleRequestTypeChange(e.target.value)}>
                <option value="">Select request type</option>
                {REQUEST_TYPE_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Priority">
              <select className={INP} value={priority} onChange={e => setPriority(e.target.value as typeof priority)}>
                {PRIORITY_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Employee ID" required={isSelfRequest} error={errors.employeeId}>
              <input className={errors.employeeId ? ERR : INP} value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
            </Field>
            {!isNewEmployee && !isUnit ? null : (
              <Field label={isUnit ? 'Unit Name' : 'Computer For'} required error={errors.computerFor}>
                <input
                  className={errors.computerFor ? ERR : INP}
                  value={computerFor}
                  onChange={e => setComputerFor(e.target.value)}
                  placeholder={isUnit ? "Enter the unit's name" : "Enter the Employee's Name for the Laptop Request"}
                />
              </Field>
            )}
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
            <Field label="Department" required error={errors.department}>
              <input className={errors.department ? ERR : INP} value={department} onChange={e => setDepartment(e.target.value)} />
            </Field>
            <Field label="Position" required error={errors.position}>
              <input className={errors.position ? ERR : INP} value={position} onChange={e => setPosition(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Cost Allocation</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-3">
            <Field label="Company Code">
              <input className={INP} value={companyCode} onChange={e => setCompanyCode(e.target.value)} />
            </Field>
            <Field label="Company Name" required error={errors.companyName}>
              <input className={errors.companyName ? ERR : INP} value={companyName} onChange={e => setCompanyName(e.target.value)} />
            </Field>
            <Field label="Cost Center">
              <input className={INP} value={costCenter} onChange={e => setCostCenter(e.target.value)} />
            </Field>
          </div>
        </section>

        <section className={`${GLASS} p-5 sm:p-6`}>
          <h2 className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Requested Device</h2>
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 lg:grid-cols-2">
            <Field label="Type of Device" required error={errors.typeOfDevice}>
              <select
                className={errors.typeOfDevice ? ERR : INP}
                value={typeOfDevice}
                onChange={e => { setTypeOfDevice(e.target.value); setRequestedModel(''); }}
              >
                <option value="">Select device type</option>
                {DEVICE_TYPE_OPTIONS.map(item => <option key={item}>{item}</option>)}
              </select>
            </Field>
            <Field label="Model of the Device" required error={errors.requestedModel}>
              <select className={errors.requestedModel ? ERR : INP} value={requestedModel} onChange={e => setRequestedModel(e.target.value)} disabled={!typeOfDevice}>
                <option value="">{typeOfDevice ? 'Select model' : 'Select a device type first'}</option>
                {modelOptions.map(item => <option key={item}>{item}</option>)}
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
