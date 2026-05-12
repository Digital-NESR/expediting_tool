'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadShipmentDocument, deleteShipmentDocument } from '@/app/actions/tite';
import { DOCUMENT_STAGES } from '@/lib/tite-stage-config';
import type { PendingUpload } from '@/lib/tite-stage-config';
import type { ShipmentDocument } from '@/types/tite';

/* ─── Constants ──────────────────────────────────────────────── */

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

/* ─── Internal types ─────────────────────────────────────────── */

type FileStatus = 'staging' | 'pending' | 'uploading' | 'uploaded' | 'error';

interface DisplayFile {
  localId:      string;
  dbId?:        number;
  file?:        File;
  customName:   string;
  originalName: string;
  size:         number;
  mimeType:     string;
  status:       FileStatus;
  error?:       string;
}

/* ─── Props ──────────────────────────────────────────────────── */

interface Props {
  stage:             'creation' | 'extension' | 'closure' | 'refund';
  shipmentId?:       number;
  initialDocuments?: ShipmentDocument[];
  docTypeErrors?:    Set<string>;
  onPendingChange?:  (pending: PendingUpload[]) => void;
  onUploaded?:       (doc: ShipmentDocument) => void;
  onDeleted?:        (id: number) => void;
  readOnly?:         boolean;
}

/* ─── Helpers ────────────────────────────────────────────────── */

let _ctr = 0;
function nextId() { return `loc-${++_ctr}`; }

function noExt(name: string) { return name.replace(/\.[^/.]+$/, ''); }

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

function FileBadge({ mime }: { mime: string }) {
  let bg = '#64748b', label = 'FILE';
  if (mime.includes('pdf'))                             { bg = '#ef4444'; label = 'PDF'; }
  else if (mime.includes('word') || mime.includes('msword')) { bg = '#3b82f6'; label = 'DOC'; }
  else if (mime.includes('sheet') || mime.includes('excel')) { bg = '#22c55e'; label = 'XLS'; }
  else if (mime.includes('image'))                      { bg = '#a855f7'; label = 'IMG'; }
  else if (mime.includes('zip') || mime.includes('rar')) { bg = '#f59e0b'; label = 'ZIP'; }
  return (
    <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0 text-white text-[8.5px] font-bold" style={{ background: bg }}>
      {label}
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────── */

export default function DocumentUploadSection({
  stage,
  shipmentId,
  initialDocuments,
  docTypeErrors,
  onPendingChange,
  onUploaded,
  onDeleted,
  readOnly = false,
}: Props) {
  const stageConfig = DOCUMENT_STAGES[stage];

  /* Stable callback ref to avoid useEffect re-fires */
  const pendingCbRef = useRef(onPendingChange);
  useEffect(() => { pendingCbRef.current = onPendingChange; }, [onPendingChange]);

  /* Single hidden file input, tracks which doc type is active */
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const activeTypeRef   = useRef<string | null>(null);

  /* filesByType: keyed by doc-type key */
  const [filesByType, setFilesByType] = useState<Record<string, DisplayFile[]>>(() => {
    const map: Record<string, DisplayFile[]> = {};
    for (const dt of stageConfig.documents) map[dt.key] = [];
    if (initialDocuments) {
      for (const doc of initialDocuments) {
        const key = doc.document_type || '';
        if (key in map) {
          map[key] = [...map[key], {
            localId:      `db-${doc.id}`,
            dbId:         doc.id,
            customName:   doc.document_name,
            originalName: doc.original_name || doc.document_name,
            size:         doc.file_size  || 0,
            mimeType:     doc.file_type  || '',
            status:       'uploaded' as const,
          }];
        }
      }
    }
    return map;
  });

  /* Delete confirmation */
  const [deleteTarget, setDeleteTarget] = useState<{ typeKey: string; localId: string; dbId: number } | null>(null);
  const [deleting,     setDeleting]     = useState(false);

  /* Notify parent of pending changes whenever filesByType changes (pending mode only) */
  useEffect(() => {
    if (shipmentId) return;
    const pending: PendingUpload[] = [];
    for (const [typeKey, files] of Object.entries(filesByType)) {
      for (const f of files) {
        if (f.status === 'pending' && f.file) {
          pending.push({ docTypeKey: typeKey, file: f.file, customName: f.customName, originalName: f.originalName });
        }
      }
    }
    pendingCbRef.current?.(pending);
  }, [filesByType, shipmentId]);

  /* ── State helpers ── */

  function updateFile(typeKey: string, localId: string, patch: Partial<DisplayFile>) {
    setFilesByType(prev => ({
      ...prev,
      [typeKey]: (prev[typeKey] || []).map(f => f.localId === localId ? { ...f, ...patch } : f),
    }));
  }

  function removeFile(typeKey: string, localId: string) {
    setFilesByType(prev => ({
      ...prev,
      [typeKey]: (prev[typeKey] || []).filter(f => f.localId !== localId),
    }));
  }

  function addStagingFiles(typeKey: string, files: File[]) {
    const staging: DisplayFile[] = files.map(file => ({
      localId:      nextId(),
      file,
      customName:   noExt(file.name),
      originalName: file.name,
      size:         file.size,
      mimeType:     file.type || 'application/octet-stream',
      status:       'staging' as const,
    }));
    setFilesByType(prev => ({
      ...prev,
      [typeKey]: [...(prev[typeKey] || []), ...staging],
    }));
  }

  /* ── Event handlers ── */

  function handleAddFile(typeKey: string) {
    if (readOnly) return;
    activeTypeRef.current = typeKey;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const key = activeTypeRef.current;
    activeTypeRef.current = null;
    if (!key) return;
    const files = Array.from(e.target.files || []);
    if (files.length) addStagingFiles(key, files);
  }

  async function handleConfirm(typeKey: string, localId: string) {
    const f = (filesByType[typeKey] || []).find(x => x.localId === localId);
    if (!f || !f.file) return;

    if (f.size > MAX_FILE_BYTES) {
      updateFile(typeKey, localId, { status: 'error', error: `File too large (${fmtBytes(f.size)}). Maximum is 10 MB.` });
      return;
    }

    if (!shipmentId) {
      /* Pending mode: queue locally */
      updateFile(typeKey, localId, { status: 'pending' });
      return;
    }

    /* Immediate upload */
    updateFile(typeKey, localId, { status: 'uploading' });
    const fd = new FormData();
    fd.append('file',          f.file);
    fd.append('shipment_id',   String(shipmentId));
    fd.append('stage',         stage);
    fd.append('document_type', typeKey);
    fd.append('custom_name',   f.customName);

    const result = await uploadShipmentDocument(fd);
    if (result.success && result.document) {
      updateFile(typeKey, localId, { dbId: result.document.id, status: 'uploaded', file: undefined });
      onUploaded?.(result.document);
    } else {
      updateFile(typeKey, localId, { status: 'error', error: result.error || 'Upload failed.' });
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await deleteShipmentDocument(deleteTarget.dbId);
      if (res.success) {
        removeFile(deleteTarget.typeKey, deleteTarget.localId);
        onDeleted?.(deleteTarget.dbId);
      }
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  /* ── Render ── */

  return (
    <div className="flex flex-col gap-3">
      <input ref={fileInputRef} type="file" multiple className="hidden" onChange={handleInputChange} />

      {stageConfig.documents.map(docType => {
        const files    = filesByType[docType.key] || [];
        const hasError = docTypeErrors?.has(docType.key);
        const confirmedCount = files.filter(f => f.status === 'pending' || f.status === 'uploaded').length;

        return (
          <div
            key={docType.key}
            className={`rounded-xl border transition-colors overflow-hidden
              ${hasError ? 'border-red-300 bg-red-50/40' : 'border-slate-200 bg-white'}`}
          >
            {/* Doc type header */}
            <div className={`flex items-center justify-between px-4 py-2.5 border-b ${hasError ? 'border-red-200' : 'border-slate-100'}`}>
              <div className="flex items-center gap-1.5">
                <span className="text-[13px] font-semibold text-slate-800">{docType.label}</span>
                {docType.required && <span className="text-red-500 text-[13px] leading-none">*</span>}
                {confirmedCount > 0 && (
                  <span className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">
                    {confirmedCount}
                  </span>
                )}
              </div>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => handleAddFile(docType.key)}
                  className="inline-flex items-center gap-1 text-[12px] font-medium text-[#006B0C] hover:underline"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Add file
                </button>
              )}
            </div>

            <div className="px-4 py-3 flex flex-col gap-2">
              {/* Error message */}
              {hasError && confirmedCount === 0 && (
                <p className="text-[12px] text-red-600 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
                  </svg>
                  Please attach at least one {docType.label}.
                </p>
              )}

              {/* Empty state */}
              {files.length === 0 && !hasError && (
                <p className="text-[12px] text-slate-400">No files attached yet.</p>
              )}

              {/* File rows */}
              {files.map(f => {
                /* ── Staging row ── */
                if (f.status === 'staging') {
                  return (
                    <div key={f.localId} className="rounded-lg border border-slate-200 bg-slate-50 p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <FileBadge mime={f.mimeType} />
                        <input
                          type="text"
                          value={f.customName}
                          onChange={e => updateFile(docType.key, f.localId, { customName: e.target.value })}
                          className="flex-1 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#006B0C]/20 focus:border-[#006B0C] bg-white"
                          placeholder="Custom name…"
                        />
                        <button type="button" onClick={() => removeFile(docType.key, f.localId)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Cancel">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="flex items-center justify-between pl-9">
                        <span className="text-[11px] text-slate-400">
                          original: {f.originalName} &middot; {fmtBytes(f.size)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleConfirm(docType.key, f.localId)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[12px] font-semibold text-white"
                          style={{ background: '#006B0C' }}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                          {shipmentId ? 'Upload' : 'Add'}
                        </button>
                      </div>
                    </div>
                  );
                }

                /* ── Uploading ── */
                if (f.status === 'uploading') {
                  return (
                    <div key={f.localId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
                      <FileBadge mime={f.mimeType} />
                      <span className="flex-1 text-[12.5px] text-slate-600 truncate">{f.customName}</span>
                      <svg className="w-4 h-4 text-[#006B0C] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  );
                }

                /* ── Error ── */
                if (f.status === 'error') {
                  return (
                    <div key={f.localId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200">
                      <FileBadge mime={f.mimeType} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] text-red-700 font-medium truncate">{f.customName || f.originalName}</p>
                        <p className="text-[11px] text-red-500">{f.error}</p>
                      </div>
                      <button type="button" onClick={() => removeFile(docType.key, f.localId)} className="p-1 text-red-400 hover:text-red-600 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  );
                }

                /* ── Pending or Uploaded pill ── */
                const isUploaded     = f.status === 'uploaded';
                const showOrigName   = f.originalName && f.originalName !== f.customName;

                return (
                  <div key={f.localId} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                    <FileBadge mime={f.mimeType} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[12.5px] font-semibold text-slate-800 truncate">{f.customName}</p>
                      {showOrigName && (
                        <p className="text-[11px] text-slate-400 truncate">{f.originalName}</p>
                      )}
                      {isUploaded && (
                        <p className="text-[10.5px] text-slate-400">{fmtBytes(f.size)}</p>
                      )}
                    </div>
                    {!isUploaded && (
                      <span className="text-[11px] text-slate-400 shrink-0">{fmtBytes(f.size)}</span>
                    )}
                    {isUploaded && f.dbId ? (
                      /* Download link */
                      <a
                        href={`/api/tite/documents/${f.dbId}`}
                        download={f.customName}
                        onClick={e => e.stopPropagation()}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-[#006B0C] hover:bg-white transition-colors"
                        title="Download"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      </a>
                    ) : (
                      /* Pending clock icon */
                      <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-label="Pending — will upload after submit">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          if (isUploaded && f.dbId) {
                            setDeleteTarget({ typeKey: docType.key, localId: f.localId, dbId: f.dbId });
                          } else {
                            removeFile(docType.key, f.localId);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Remove"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 w-full max-w-sm">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Delete document?</h3>
            <p className="text-sm text-slate-500 mb-5">This cannot be undone.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {deleting && <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
