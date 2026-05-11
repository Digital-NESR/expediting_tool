'use client';

import { useRef, useState } from 'react';
import { uploadShipmentDocument, deleteShipmentDocument } from '@/app/actions/tite';
import type { ShipmentDocument } from '@/types/tite';

const STAGE_LABELS: Record<string, string> = {
  creation:  'Creation',
  extension: 'Extension',
  closure:   'Closure',
  refund:    'Refund',
};

function fmtBytes(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  const t = mimeType || '';
  let color = '#64748b';
  let label = 'FILE';
  if (t.includes('pdf'))   { color = '#ef4444'; label = 'PDF'; }
  else if (t.includes('word') || t.includes('msword')) { color = '#3b82f6'; label = 'DOC'; }
  else if (t.includes('sheet') || t.includes('excel')) { color = '#22c55e'; label = 'XLS'; }
  else if (t.includes('image'))  { color = '#a855f7'; label = 'IMG'; }
  else if (t.includes('zip') || t.includes('rar')) { color = '#f59e0b'; label = 'ZIP'; }

  return (
    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-white text-[9px] font-bold"
         style={{ background: color }}>
      {label}
    </div>
  );
}

/* ─── Props ──────────────────────────────────────────────────── */

interface Props {
  shipmentId: number;
  documents:  ShipmentDocument[];
  stage:      'creation' | 'extension' | 'closure' | 'refund';
  onUploaded: (doc: ShipmentDocument) => void;
  onDeleted:  (id: number) => void;
  readOnly?:  boolean;
}

/* ─── Component ──────────────────────────────────────────────── */

export default function DocumentUploadSection({
  shipmentId,
  documents,
  stage,
  onUploaded,
  onDeleted,
  readOnly = false,
}: Props) {
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const [dragging,    setDragging]    = useState(false);
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [deleteId,    setDeleteId]    = useState<number | null>(null);
  const [deleting,    setDeleting]    = useState(false);

  async function uploadFile(file: File) {
    setUploading(true);
    setUploadError('');
    try {
      const fd = new FormData();
      fd.append('file',        file);
      fd.append('shipment_id', String(shipmentId));
      fd.append('stage',       stage);
      const result = await uploadShipmentDocument(fd);
      if (result.success && result.document) {
        onUploaded(result.document);
      } else {
        setUploadError(result.error || 'Upload failed.');
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function confirmDelete() {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      const result = await deleteShipmentDocument(deleteId);
      if (result.success) {
        onDeleted(deleteId);
      }
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">

      {/* Drop zone */}
      {!readOnly && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 py-7 rounded-xl border-2 border-dashed cursor-pointer transition-colors
            ${dragging ? 'border-[#006B0C] bg-green-50' : 'border-slate-200 hover:border-[#006B0C]/50 hover:bg-slate-50 bg-white'}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
          />
          {uploading ? (
            <>
              <svg className="w-6 h-6 text-[#006B0C] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-slate-500">Uploading…</p>
            </>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: '#006B0C18' }}>
                <svg className="w-5 h-5" style={{ color: '#006B0C' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700">
                  Drop file here, or <span style={{ color: '#006B0C' }} className="font-semibold">browse</span>
                </p>
                <p className="text-xs text-slate-400 mt-0.5">PDF, Word, Excel, images — up to 50 MB</p>
              </div>
              <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full text-slate-500 bg-slate-100 border border-slate-200">
                Stage: {STAGE_LABELS[stage] || stage}
              </span>
            </>
          )}
        </div>
      )}

      {/* Upload error */}
      {uploadError && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01" />
          </svg>
          {uploadError}
        </p>
      )}

      {/* Document list */}
      {documents.length > 0 ? (
        <div className="divide-y divide-slate-50 rounded-xl border border-slate-200 overflow-hidden">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center gap-3 px-3.5 py-3 bg-white hover:bg-slate-50 transition-colors">
              <FileIcon mimeType={doc.file_type} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 truncate">{doc.document_name}</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {STAGE_LABELS[doc.document_stage] || doc.document_stage}
                  {doc.file_size ? ` · ${fmtBytes(doc.file_size)}` : ''}
                  {doc.uploaded_by ? ` · ${doc.uploaded_by}` : ''}
                  {doc.uploaded_at ? ` · ${fmtDate(doc.uploaded_at)}` : ''}
                </p>
              </div>
              <a
                href={`/api/tite/documents/${doc.id}`}
                download={doc.document_name}
                onClick={e => e.stopPropagation()}
                className="p-1.5 rounded-lg text-slate-400 hover:text-[#006B0C] hover:bg-slate-100 transition-colors"
                title="Download"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </a>
              {!readOnly && (
                <button
                  onClick={() => setDeleteId(doc.id)}
                  className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete document"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        !readOnly && (
          <p className="text-xs text-slate-400 text-center py-2">No documents attached yet.</p>
        )
      )}

      {readOnly && documents.length === 0 && (
        <p className="text-xs text-slate-400 text-center py-2">No documents attached.</p>
      )}

      {/* Delete confirmation modal */}
      {deleteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[2px]">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-6 w-full max-w-sm">
            <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <h3 className="font-bold text-slate-900 mb-1">Delete document?</h3>
            <p className="text-sm text-slate-500 mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteId(null)}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
