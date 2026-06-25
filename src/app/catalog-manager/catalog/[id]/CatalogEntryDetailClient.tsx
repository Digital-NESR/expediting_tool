'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CatalogManagerShell from '../../components/CatalogManagerShell';
import { Icon, StatusPill, Chip, Avatar, SectionTitle } from '../../components/CatalogManagerUI';
import DecisionDialog from '../../components/DecisionDialog';
import { submitForApproval, deactivateCatalogEntry, addEntryDocument, deleteEntryDocument, getDocumentDataUrl } from '@/app/actions/catalog-manager';
import type { CatalogEntry } from '@/types/catalog-manager';
import { fmtMoney, fmtUsd, fmtDateNice, daysUntil, isExpiringSoon, PROOF_TYPES, spendTypeTone } from '@/lib/catalog-manager-utils';

function fileSizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function KV({ label, children, amber }: { label: string; children: React.ReactNode; amber?: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`text-[13.5px] font-medium ${amber ? 'text-amber-700' : 'text-slate-900'}`}>{children}</div>
    </div>
  );
}

export default function CatalogEntryDetailClient({
  entry, pendingCount, roleLabel, canCreate, canApprove, canApproveThis, canAdmin, homeCountry,
}: {
  entry: CatalogEntry;
  pendingCount: number;
  roleLabel: string;
  canCreate: boolean;
  canApprove: boolean;
  canApproveThis: boolean;
  canAdmin: boolean;
  homeCountry: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [docType, setDocType] = useState(PROOF_TYPES[0]);
  const [uploading, setUploading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const exp = isExpiringSoon(entry.status, entry.expiry_date);
  const dUntil = daysUntil(entry.expiry_date);

  async function onUpload(file: File) {
    setDocError(null);
    if (file.size > 5 * 1024 * 1024) { setDocError('File is too large — max 5 MB.'); return; }
    setUploading(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      await addEntryDocument(entry.id, { fileName: file.name, docType, sizeLabel: fileSizeLabel(file.size), dataUrl });
      router.refresh();
    } catch (e) {
      setDocError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function downloadDoc(docId: number, fileName: string) {
    const dataUrl = await getDocumentDataUrl(docId);
    if (!dataUrl) { setDocError('This is a sample placeholder with no stored file.'); return; }
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  }

  async function removeDoc(docId: number) {
    if (!confirm('Remove this document?')) return;
    setBusy(true);
    try { await deleteEntryDocument(docId, entry.id); router.refresh(); } finally { setBusy(false); }
  }

  async function doSubmit() {
    setBusy(true);
    try { await submitForApproval(entry.id); router.refresh(); } finally { setBusy(false); }
  }
  async function doDeactivate() {
    if (!confirm(`Deactivate ${entry.code}? It will be marked Expired.`)) return;
    setBusy(true);
    try { await deactivateCatalogEntry(entry.id); router.refresh(); } finally { setBusy(false); }
  }

  return (
    <CatalogManagerShell
      title={entry.code}
      roleLabel={roleLabel}
      canApprove={canApprove}
      canAdmin={canAdmin}
      pendingCount={pendingCount}
      showScope={false}
      headerAction={
        <Link href="/catalog-manager/catalog" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          <Icon name="arrowRight" className="h-4 w-4 rotate-180" /> <span className="hidden sm:inline">Catalog</span>
        </Link>
      }
    >
      <div className="mx-auto max-w-3xl space-y-5">
        {/* header */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-2.5">
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[12px] text-slate-600">{entry.code}</span>
            <StatusPill status={entry.status} sm />
            <span className="font-mono text-[11px] text-slate-400">v{entry.version_no}</span>
          </div>
          <Link href={`/catalog-manager/suppliers/${entry.supplier_id}`} className="group inline-flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900 hover:text-[#1d4f31]">
            {entry.supplier_name}
            <Icon name="arrowRight" className="h-4 w-4 text-slate-300 group-hover:text-[#307c4c]" />
          </Link>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {entry.spend_type && <Chip tone={spendTypeTone(entry.spend_type)}><Icon name="layers" className="h-3 w-3" />{entry.spend_type}</Chip>}
            {entry.category_name && <Chip tone="green"><Icon name="tag" className="h-3 w-3" />{entry.category_name}</Chip>}
            <Chip><Icon name="globe" className="h-3 w-3" />{entry.country_flag} {entry.country_name}</Chip>
          </div>
        </div>

        {homeCountry && entry.country_code !== homeCountry && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            <Icon name="globe" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-semibold">Outside your home country.</span>{' '}
              This rate is for <span className="font-semibold">{entry.country_flag} {entry.country_name}</span>, not your home country (<span className="font-semibold">{homeCountry}</span>). Prices and approvals are governed by that country&apos;s scope.
            </span>
          </div>
        )}

        {/* price hero */}
        <div className="flex items-center justify-between rounded-2xl border border-[#307c4c]/20 bg-[#307c4c]/10 p-5">
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#1d4f31]">Unit price</div>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-3xl font-bold tracking-tight text-slate-900">{fmtMoney(entry.unit_price, entry.currency_code)}</span>
              <span className="text-sm font-semibold text-[#1d4f31]">{entry.currency_code}</span>
              <span className="text-[13px] text-slate-500">/ {entry.uom_name}</span>
            </div>
            <div className="mt-1 font-mono text-[11.5px] text-slate-500">≈ USD {fmtUsd(entry.usd_equivalent)}</div>
          </div>
          <div className="text-right">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-[#1d4f31]">Approval tier</div>
            <Chip tone={entry.tier_label.includes('Tier 2') ? 'amber' : 'green'}>
              <Icon name={entry.tier_label.includes('Tier 2') ? 'approve' : 'check'} className="h-3.5 w-3.5" />{entry.tier_label}
            </Chip>
          </div>
        </div>

        {exp && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[13px] font-semibold text-amber-700">
            <Icon name="clock" className="h-4 w-4" /> Rate expires in {dUntil} day{dUntil === 1 ? '' : 's'} ({fmtDateNice(entry.expiry_date)}) — consider renewing.
          </div>
        )}

        {/* commodity + classification */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle className="mb-2">Commodity</SectionTitle>
          <p className="text-[15px] font-semibold text-slate-900">{entry.commodity || entry.item_name}</p>
          {entry.description && <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{entry.description}</p>}

          <SectionTitle className="mb-2.5 mt-5">Spend classification</SectionTitle>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <KV label="Spend type">{entry.spend_type ?? '—'}</KV>
            <KV label="UNSPSC code"><span className="font-mono">{entry.unspsc_code || '—'}</span></KV>
            <KV label="Spend category">{entry.category_name ?? '—'}</KV>
            <KV label="Sub-category">{entry.subcategory_name ?? '—'}</KV>
            <KV label="Family">{entry.family || '—'}</KV>
            <KV label="Unit of measure">{entry.uom_name ?? '—'}</KV>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4">
            <KV label="Supplier code"><span className="font-mono">{entry.supplier_code}</span></KV>
            <KV label="Supplier manager">
              <span className="inline-flex items-center gap-2"><Avatar name={entry.manager} size={20} /><span className={entry.manager ? '' : 'text-slate-400'}>{entry.manager || 'Unassigned'}</span></span>
            </KV>
            <KV label="Currency">{entry.currency_code}</KV>
            <KV label="Effective date">{fmtDateNice(entry.effective_date)}</KV>
            <KV label="Expiry date" amber={exp}>{entry.expiry_date ? fmtDateNice(entry.expiry_date) : 'No expiry'}</KV>
          </div>

          {entry.notes && (
            <>
              <SectionTitle className="mb-2 mt-5">Notes</SectionTitle>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] leading-relaxed text-slate-600">{entry.notes}</div>
            </>
          )}
        </div>

        {/* documents */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle className="mb-2.5">Proof of agreement</SectionTitle>
          {entry.documents.length > 0 ? (
            <div className="space-y-2">
              {entry.documents.map((d) => (
                <div key={d.id} className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5">
                  <Icon name="file" className="h-4.5 w-4.5 text-red-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-medium text-slate-900">{d.file_name}</div>
                    <div className="text-[11px] text-slate-400">
                      {d.doc_type ? `${d.doc_type} · ` : ''}{d.size_label}
                      {d.has_file ? (d.uploaded_by ? ` · uploaded by ${d.uploaded_by}` : '') : ' · sample'}
                    </div>
                  </div>
                  {d.has_file ? (
                    <button onClick={() => downloadDoc(d.id, d.file_name)} title="Download" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-[#307c4c]/10 hover:text-[#307c4c]"><Icon name="download" className="h-4 w-4" /></button>
                  ) : (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-400">sample</span>
                  )}
                  {canCreate && (
                    <button onClick={() => removeDoc(d.id)} title="Remove" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3.5 py-3 text-[12.5px] text-slate-400">
              <Icon name="alert" className="h-4 w-4 text-amber-500" /> No supporting document attached.
            </div>
          )}

          {canCreate && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
              <select value={docType} onChange={(e) => setDocType(e.target.value)} className="rounded-lg border border-slate-300 px-2.5 py-2 text-[12.5px] outline-none focus:border-[#307c4c]">
                {PROOF_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 rounded-lg border border-dashed border-[#307c4c]/40 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#1d4f31] hover:bg-[#307c4c]/5 disabled:opacity-50"
              >
                <Icon name={uploading ? 'clock' : 'upload'} className="h-4 w-4" /> {uploading ? 'Uploading…' : 'Attach document'}
              </button>
              <span className="text-[11px] text-slate-400">PDF/XLSX/DOCX/image · max 5 MB</span>
              <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.docx,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); }} />
              {docError && <span className="w-full text-[11.5px] font-medium text-red-600">{docError}</span>}
            </div>
          )}

          {entry.sirion_contract_id && (
            <a href={entry.sirion_url ?? '#'} target="_blank" rel="noreferrer" className="mt-3 flex items-center gap-3 rounded-lg border border-[#307c4c]/20 bg-[#307c4c]/10 px-3.5 py-3 hover:border-[#307c4c]/40">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#307c4c]/20 bg-white text-[#1d4f31]"><Icon name="link" className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-[#1d4f31]">Sirion Contract ID</div>
                <div className="font-mono text-sm font-bold text-slate-900">{entry.sirion_contract_id}</div>
              </div>
              <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#1d4f31]">Open in Sirion <Icon name="external" className="h-4 w-4" /></span>
            </a>
          )}
        </div>

        {/* approval decision */}
        {entry.approval_comment && (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <SectionTitle className="mb-2.5">Approval decision</SectionTitle>
            <div className="flex gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <Avatar name={entry.approver_name} size={32} />
              <div>
                <div className="text-[13px] font-semibold text-slate-900">{entry.approver_name}</div>
                <div className="mt-0.5 text-[13px] text-slate-500">“{entry.approval_comment}”</div>
              </div>
            </div>
          </div>
        )}

        {/* version history */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <SectionTitle className="mb-3 inline-flex items-center gap-1.5"><Icon name="history" className="h-3.5 w-3.5" /> Version history</SectionTitle>
          <div className="relative space-y-4 pl-5">
            <span className="absolute bottom-1.5 left-1.5 top-1.5 w-px bg-slate-200" />
            {entry.history.map((h, i) => (
              <div key={h.version_no} className="relative">
                <span className={`absolute -left-[14px] top-1 h-3 w-3 rounded-full border-2 ${i === 0 ? 'border-[#307c4c] bg-[#307c4c]' : 'border-slate-300 bg-white'}`} />
                <div className="text-[13px] font-semibold text-slate-900">
                  v{h.version_no}{i === 0 ? ' · current' : ''} <span className="ml-1 font-mono font-medium text-[#1d4f31]">{fmtMoney(h.unit_price, h.currency_code)} {h.currency_code}</span>
                </div>
                <div className="text-[12px] text-slate-400">{h.change_reason ? `${h.change_reason} · ` : ''}{h.modified_by} · {fmtDateNice(h.modified_at)}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-between border-t border-slate-100 pt-3 text-[11.5px] text-slate-400">
            <span>Created by {entry.created_by} · {fmtDateNice(entry.created_at)}</span>
            <span>Last modified {fmtDateNice(entry.modified_at)}</span>
          </div>
        </div>

        {/* actions */}
        <div className="flex flex-wrap justify-end gap-2.5">
          {canCreate && (entry.status === 'Draft' || entry.status === 'Rejected') && (
            <>
              <Link href={`/catalog-manager/catalog/${entry.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Icon name="edit" className="h-4 w-4" /> Edit</Link>
              <button onClick={doSubmit} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#2b6f44] disabled:opacity-50"><Icon name="arrowRight" className="h-4 w-4" /> {entry.status === 'Rejected' ? 'Revise & resubmit' : 'Submit for approval'}</button>
            </>
          )}
          {entry.status === 'Pending Approval' && canApproveThis && (
            <>
              <button onClick={() => setDialog('reject')} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"><Icon name="x" className="h-4 w-4" /> Reject / revise</button>
              <button onClick={() => setDialog('approve')} className="inline-flex items-center gap-2 rounded-lg bg-[#307c4c] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[#2b6f44]"><Icon name="check" className="h-4 w-4" /> Approve</button>
            </>
          )}
          {entry.status === 'Pending Approval' && canCreate && !canApproveThis && (
            <Chip><Icon name="clock" className="h-3.5 w-3.5" /> Awaiting {entry.approver_name ?? 'approver'}</Chip>
          )}
          {entry.status === 'Active' && canCreate && (
            <>
              <button onClick={doDeactivate} disabled={busy} className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Deactivate</button>
              <Link href={`/catalog-manager/catalog/${entry.id}/edit`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Icon name="edit" className="h-4 w-4" /> Edit (new version)</Link>
            </>
          )}
        </div>
      </div>

      {dialog && (
        <DecisionDialog
          open
          decision={dialog}
          entry={entry}
          onClose={() => setDialog(null)}
          onDone={() => { setDialog(null); router.refresh(); }}
        />
      )}
    </CatalogManagerShell>
  );
}
