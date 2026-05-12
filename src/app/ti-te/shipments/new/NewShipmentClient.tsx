'use client';

import { useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import TiteSidebar from '@/components/TiteSidebar';
import DocumentUploadSection from '@/components/tite/DocumentUploadSection';
import { createShipment, uploadShipmentDocument } from '@/app/actions/tite';
import { DOCUMENT_STAGES } from '@/lib/tite-stage-config';
import type { PendingUpload } from '@/lib/tite-stage-config';

/* ─── Constants ──────────────────────────────────────────────── */

const SEGMENTS  = ['E&P', 'Exploration', 'Drilling', 'Production', 'Services', 'Logistics', 'Corporate'];
const COUNTRIES = [
  'Saudi Arabia', 'UAE', 'Kuwait', 'Qatar', 'Oman', 'Bahrain',
  'Egypt', 'Cameroon', 'Algeria', 'Iraq', 'Libya',
  'USA', 'UK', 'Germany', 'France', 'China', 'Singapore', 'India',
];
const MOT_OPTIONS = ['Air', 'Sea', 'Land'];

/* ─── Styles ─────────────────────────────────────────────────── */

const LBL     = 'block text-xs font-semibold text-slate-600 mb-1.5';
const INP     = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20 focus:border-[#006B0C] bg-white placeholder:text-slate-400';
const INP_ERR = 'w-full border border-red-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400/20 focus:border-red-400 bg-white placeholder:text-slate-400';

/* ─── Types ──────────────────────────────────────────────────── */

interface ContactRow { name: string; email: string; role: string; }
interface FormErrors  { [key: string]: string; }

/* ─── Component ──────────────────────────────────────────────── */

export default function NewShipmentClient({
  countryOptions,
  isAdmin,
}: {
  countryOptions: string[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const docsSectionRef = useRef<HTMLDivElement>(null);

  /* form state */
  const [operatingCountry, setOperatingCountry] = useState(countryOptions.length === 1 ? countryOptions[0] : '');
  const [movementType, setMovementType] = useState<'Temporary Import' | 'Temporary Export'>('Temporary Import');
  const [segment,      setSegment]      = useState('');
  const [description,  setDescription]  = useState('');
  const [fromCountry,  setFromCountry]  = useState('');
  const [toCountry,    setToCountry]    = useState('');
  const [mot,          setMot]          = useState('');
  const [invoiceNum,   setInvoiceNum]   = useState('');
  const [invoiceVal,   setInvoiceVal]   = useState('');
  const [bayanNum,     setBayanNum]     = useState('');
  const [awbNum,       setAwbNum]       = useState('');
  const [poNum,        setPoNum]        = useState('');
  const [importDate,   setImportDate]   = useState('');
  const [expiryDate,   setExpiryDate]   = useState('');
  const [showExtended, setShowExtended] = useState(false);
  const [extendedDate, setExtendedDate] = useState('');
  const [depositUsd,   setDepositUsd]   = useState('');
  const [comments,     setComments]     = useState('');
  const [contacts,     setContacts]     = useState<ContactRow[]>([{ name: '', email: '', role: '' }]);

  /* document state */
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [docTypeErrors,  setDocTypeErrors]  = useState<Set<string>>(new Set());

  /* ui state */
  const [errors,      setErrors]      = useState<FormErrors>({});
  const [submitting,  setSubmitting]  = useState(false);
  const [toastMsg,    setToastMsg]    = useState('');
  const [errorBanner, setErrorBanner] = useState('');

  /* stable callback for DocumentUploadSection */
  const handlePendingChange = useCallback((pending: PendingUpload[]) => {
    setPendingUploads(pending);
  }, []);

  /* helpers */
  function clearError(key: string) {
    setErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
  }

  function setExpiry180() {
    if (!importDate) return;
    const d = new Date(importDate);
    d.setDate(d.getDate() + 180);
    setExpiryDate(d.toISOString().slice(0, 10));
    clearError('expiry_date');
  }

  function updateContact(i: number, key: keyof ContactRow, val: string) {
    setContacts(prev => prev.map((c, j) => j === i ? { ...c, [key]: val } : c));
    clearError(`contact_email_${i}`);
  }

  function removeContact(i: number) {
    setContacts(prev => prev.filter((_, j) => j !== i));
  }

  /* validation */
  function validate(): FormErrors {
    const e: FormErrors = {};
    if (!operatingCountry) e.operating_country = 'Operating country is required.';
    if (!expiryDate) e.expiry_date = 'Expiry date is required.';
    contacts.forEach((c, i) => {
      if (c.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) {
        e[`contact_email_${i}`] = 'Invalid email address.';
      }
    });
    return e;
  }

  /* submit */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorBanner('');

    /* Field validation */
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      requestAnimationFrame(() => {
        document.querySelector('[data-field-error="true"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
      return;
    }

    /* Document validation — all required creation doc types must have ≥ 1 pending file */
    const creationConfig = DOCUMENT_STAGES['creation'];
    const missing = new Set<string>();
    for (const dt of creationConfig.documents) {
      if (dt.required && !pendingUploads.some(p => p.docTypeKey === dt.key)) {
        missing.add(dt.key);
      }
    }
    if (missing.size > 0) {
      setDocTypeErrors(missing);
      setErrorBanner('Please attach all required documents before submitting.');
      requestAnimationFrame(() => {
        docsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return;
    }
    setDocTypeErrors(new Set());

    setSubmitting(true);
    try {
      const result = await createShipment({
        movement_type:  movementType,
        segment:        segment        || undefined,
        description:    description    || undefined,
        from_country:   fromCountry    || undefined,
        to_country:     toCountry      || undefined,
        mot:            mot            || undefined,
        invoice_number: invoiceNum     || undefined,
        invoice_value_usd: invoiceVal  ? parseFloat(invoiceVal)  : undefined,
        customs_reference_number: bayanNum || undefined,
        awb_number:     awbNum         || undefined,
        po_number:      poNum          || undefined,
        import_date:    importDate     || undefined,
        expiry_date:    expiryDate     || undefined,
        extended_date:  showExtended && extendedDate ? extendedDate : undefined,
        deposit_usd:    depositUsd     ? parseFloat(depositUsd)  : undefined,
        comments:       comments       || undefined,
        country:        operatingCountry || undefined,
        contacts: contacts.filter(c => c.name || c.email || c.role),
      });

      if (!result) {
        setErrorBanner('Failed to save shipment. Please try again.');
        setSubmitting(false);
        return;
      }

      /* Upload all pending documents */
      for (const p of pendingUploads) {
        try {
          const fd = new FormData();
          fd.append('file',          p.file);
          fd.append('shipment_id',   String(result.id));
          fd.append('stage',         'creation');
          fd.append('document_type', p.docTypeKey);
          fd.append('custom_name',   p.customName);
          await uploadShipmentDocument(fd);
        } catch {
          /* non-fatal — shipment created; docs can be added later */
        }
      }

      setToastMsg('Shipment saved successfully!');
      setTimeout(() => router.push(`/ti-te/shipments/${result.id}`), 1500);
    } catch {
      setErrorBanner('An unexpected error occurred. Please try again.');
      setSubmitting(false);
    }
  }

  /* ── render ── */
  return (
    <div className="min-h-[100dvh] bg-slate-50 font-sans text-slate-900">
      <TiteSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Success toast */}
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 bg-[#006B0C] text-white text-sm font-semibold px-5 py-3.5 rounded-xl shadow-lg">
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          {toastMsg}
        </div>
      )}

      {/* Header */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center gap-3 shrink-0 sticky top-0 z-30">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-lg shrink-0" style={{ background: '#006B0C' }}>
          <span className="text-white font-extrabold text-[10px] tracking-tight">TI·TE</span>
        </div>
        <span className="font-semibold text-slate-900 text-sm">New Shipment</span>
      </header>

      <main className="max-w-[700px] mx-auto px-6 pb-16 pt-10">
        {/* Breadcrumb + title */}
        <div className="mb-6">
          <p className="text-xs text-slate-400 mb-1">
            <button className="hover:underline text-[#006B0C]" onClick={() => router.push('/ti-te/shipments')}>
              Shipment register
            </button>
            {' / '}New shipment
          </p>
          <h1 className="text-2xl font-bold tracking-tight">Add new shipment</h1>
          <p className="text-sm text-slate-500 mt-1">Log a new temporary import or export movement.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>

          {/* Error banner */}
          {errorBanner && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <svg className="w-4 h-4 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-sm text-red-700 font-medium">{errorBanner}</p>
            </div>
          )}

          {/* ── Section 1: Movement Details ── */}
          <Section title="1. Movement Details">
            {/* Operating Country */}
            <div data-field-error={errors.operating_country ? 'true' : undefined}>
              <label className={LBL}>
                Operating country <span className="text-red-500">*</span>
              </label>
              {isAdmin ? (
                <>
                  <input
                    list="operating-country-list"
                    className={errors.operating_country ? INP_ERR : INP}
                    placeholder="Select or type a country…"
                    value={operatingCountry}
                    onChange={e => { setOperatingCountry(e.target.value); clearError('operating_country'); }}
                  />
                  <datalist id="operating-country-list">
                    {countryOptions.map(c => <option key={c} value={c} />)}
                  </datalist>
                </>
              ) : (
                <select
                  className={errors.operating_country ? INP_ERR : INP}
                  value={operatingCountry}
                  onChange={e => { setOperatingCountry(e.target.value); clearError('operating_country'); }}
                >
                  <option value="">Select country…</option>
                  {countryOptions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
              {errors.operating_country && (
                <p className="text-xs text-red-600 mt-1">{errors.operating_country}</p>
              )}
            </div>

            {/* Type radio */}
            <div>
              <label className={LBL}>Type</label>
              <div className="flex gap-3">
                {(['Temporary Import', 'Temporary Export'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMovementType(t)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                      movementType === t
                        ? 'bg-[#006B0C] text-white border-[#006B0C]'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-[#006B0C]/40'
                    }`}
                  >
                    {t === 'Temporary Import' ? '↓ Temporary Import' : '↑ Temporary Export'}
                  </button>
                ))}
              </div>
            </div>

            {/* Segment */}
            <div>
              <label className={LBL}>Segment</label>
              <input
                list="segment-list"
                className={INP}
                placeholder="e.g. Drilling, E&P…"
                value={segment}
                onChange={e => setSegment(e.target.value)}
              />
              <datalist id="segment-list">
                {SEGMENTS.map(s => <option key={s} value={s} />)}
              </datalist>
            </div>

            {/* Description */}
            <div>
              <label className={LBL}>Description</label>
              <textarea
                className={`${INP} resize-none`}
                rows={3}
                placeholder="Brief description of goods or equipment…"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
          </Section>

          {/* ── Section 2: Route ── */}
          <Section title="2. Route">
            <datalist id="country-list">
              {COUNTRIES.map(c => <option key={c} value={c} />)}
            </datalist>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>From country</label>
                <input
                  list="country-list"
                  className={INP}
                  placeholder="Origin country"
                  value={fromCountry}
                  onChange={e => setFromCountry(e.target.value)}
                />
              </div>
              <div>
                <label className={LBL}>To country</label>
                <input
                  list="country-list"
                  className={INP}
                  placeholder="Destination country"
                  value={toCountry}
                  onChange={e => setToCountry(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Mode of transport</label>
                <select className={INP} value={mot} onChange={e => setMot(e.target.value)}>
                  <option value="">Select MOT…</option>
                  {MOT_OPTIONS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
          </Section>

          {/* ── Section 3: Customs & Documentation ── */}
          <Section title="3. Customs & Documentation">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Invoice number</label>
                <input className={INP} placeholder="INV-…" value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} />
              </div>
              <div>
                <label className={LBL}>Invoice value (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">USD</span>
                  <input
                    type="number" min="0" step="0.01"
                    className={`${INP} pl-11`}
                    placeholder="0.00"
                    value={invoiceVal}
                    onChange={e => setInvoiceVal(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Customs Reference Number</label>
                <input className={INP} placeholder="Customs reference or declaration number (e.g. Bayan No., Entry No., Declaration No.)" value={bayanNum} onChange={e => setBayanNum(e.target.value)} />
              </div>
              <div>
                <label className={LBL}>AWB / B/L number</label>
                <input className={INP} placeholder="Airway bill or bill of lading" value={awbNum} onChange={e => setAwbNum(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>PO number</label>
                <input className={INP} placeholder="Purchase order #" value={poNum} onChange={e => setPoNum(e.target.value)} />
              </div>
            </div>
          </Section>

          {/* ── Section 4: Dates ── */}
          <Section title="4. Dates">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Import / movement date</label>
                <input type="date" className={INP} value={importDate} onChange={e => setImportDate(e.target.value)} />
              </div>

              <div data-field-error={errors.expiry_date ? 'true' : undefined}>
                <label className={LBL}>
                  Expiry date <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className={errors.expiry_date ? INP_ERR : INP}
                    value={expiryDate}
                    onChange={e => { setExpiryDate(e.target.value); clearError('expiry_date'); }}
                  />
                  <button
                    type="button"
                    title="Set expiry to import date + 180 days"
                    onClick={setExpiry180}
                    disabled={!importDate}
                    className="shrink-0 px-3 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    +180d
                  </button>
                </div>
                {errors.expiry_date && (
                  <p className="text-xs text-red-600 mt-1">{errors.expiry_date}</p>
                )}
              </div>
            </div>

            {/* Extension toggle */}
            <div>
              <button
                type="button"
                onClick={() => setShowExtended(v => !v)}
                className="flex items-center gap-2.5 group"
              >
                <span className={`relative w-9 h-5 rounded-full transition-colors ${showExtended ? 'bg-[#006B0C]' : 'bg-slate-200'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${showExtended ? 'left-[18px]' : 'left-0.5'}`} />
                </span>
                <span className="text-sm font-medium text-slate-600 group-hover:text-slate-800 transition-colors">
                  Extension granted
                </span>
              </button>

              {showExtended && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={LBL}>Extended expiry date</label>
                    <input type="date" className={INP} value={extendedDate} onChange={e => setExtendedDate(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* ── Section 5: Deposit / Financial ── */}
          <Section title="5. Deposit / Financial">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={LBL}>Customs Deposit (USD)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400">$</span>
                  <input
                    type="number" min="0" step="0.01"
                    className={`${INP} pl-7`}
                    placeholder="0.00"
                    value={depositUsd}
                    onChange={e => setDepositUsd(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </Section>

          {/* ── Section 6: Notification Contacts ── */}
          <Section title="6. Notification contacts" subtitle="People to notify when status changes or deadlines approach">
            <div className="flex flex-col gap-3">
              {contacts.map((c, i) => (
                <div key={i}>
                  {i === 0 && (
                    <div className="grid grid-cols-[1fr_1fr_7rem_2.25rem] gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-500">Name</span>
                      <span className="text-[11px] font-semibold text-slate-500">Email</span>
                      <span className="text-[11px] font-semibold text-slate-500">Role</span>
                      <span />
                    </div>
                  )}
                  <div className="grid grid-cols-[1fr_1fr_7rem_2.25rem] gap-2 items-start">
                    <input
                      className={INP}
                      placeholder="Full name"
                      value={c.name}
                      onChange={e => updateContact(i, 'name', e.target.value)}
                    />
                    <div>
                      <input
                        type="email"
                        className={errors[`contact_email_${i}`] ? INP_ERR : INP}
                        placeholder="email@company.com"
                        value={c.email}
                        onChange={e => updateContact(i, 'email', e.target.value)}
                      />
                      {errors[`contact_email_${i}`] && (
                        <p className="text-xs text-red-600 mt-1" data-field-error="true">
                          {errors[`contact_email_${i}`]}
                        </p>
                      )}
                    </div>
                    <input
                      className={INP}
                      placeholder="Role"
                      value={c.role}
                      onChange={e => updateContact(i, 'role', e.target.value)}
                    />
                    <button
                      type="button"
                      onClick={() => removeContact(i)}
                      disabled={contacts.length === 1}
                      className="w-9 h-[42px] flex items-center justify-center rounded-lg border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setContacts(prev => [...prev, { name: '', email: '', role: '' }])}
                className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium text-[#006B0C] hover:underline w-fit"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add another
              </button>
            </div>
          </Section>

          {/* ── Section 7: Additional Info ── */}
          <Section title="7. Additional Info">
            <div>
              <label className={LBL}>Comments</label>
              <textarea
                className={`${INP} resize-none`}
                rows={3}
                placeholder="Additional notes, conditions or remarks…"
                value={comments}
                onChange={e => setComments(e.target.value)}
              />
            </div>
          </Section>

          {/* ── Section 8: Required Documents ── */}
          <section
            ref={docsSectionRef}
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
          >
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <h2 className="text-sm font-bold text-slate-800">8. Required Documents</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                All five document types are required. Files are uploaded after the shipment is saved.
                Maximum 10 MB per file.
              </p>
            </div>
            <div className="px-5 py-5">
              <DocumentUploadSection
                stage="creation"
                docTypeErrors={docTypeErrors}
                onPendingChange={handlePendingChange}
              />
            </div>
          </section>

          {/* ── Submit bar ── */}
          <div className="flex items-center justify-between gap-4 pt-2">
            <button
              type="button"
              onClick={() => router.push('/ti-te/shipments')}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-all active:scale-95 disabled:opacity-60"
              style={{ background: '#006B0C' }}
            >
              {submitting ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Saving…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Save shipment
                </>
              )}
            </button>
          </div>

        </form>
      </main>
    </div>
  );
}

/* ─── Section wrapper ─────────────────────────────────────────── */

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-sm font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 py-5 flex flex-col gap-4">
        {children}
      </div>
    </section>
  );
}
