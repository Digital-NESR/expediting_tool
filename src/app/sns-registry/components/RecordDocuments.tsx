'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  deleteSnsRecordDocument,
  getSnsRecordDocuments,
  uploadSnsRecordDocument,
} from '@/app/actions/sns-documents';
import type { SnsDocument, SnsDocumentKind } from '@/app/actions/sns-documents';
import { CARD, CARD_HEAD } from '../lib/ui';
import type { RegistryApp } from '../lib/useRegistryApp';
import type { RegistryRecord } from '../lib/types';

/** Matches the server's own limit, so an oversized file is refused before upload. */
const MAX_BYTES = 1024 * 1024;

const KIND_LABEL: Record<SnsDocumentKind, string> = {
  evidence: 'Evidence',
  review: 'Review document',
};

function sizeLabel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function dateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The files attached to a record: what is on file, and a way to open it.
 *
 * Until now the wizard could upload evidence and nothing could ever show it —
 * the validators were being asked to approve a sole-source case whose OEM
 * letter or market survey they had no way to read. The bytes and the download
 * route already existed; only this was missing.
 *
 * Every permission here is decided again on the server. The UI hides what a
 * viewer cannot do so they are not offered a control that will refuse them,
 * but it is not the gate.
 */
export default function RecordDocuments({ app, rec }: { app: RegistryApp; rec: RegistryRecord }) {
  const [docs, setDocs] = useState<SnsDocument[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<SnsDocumentKind>('evidence');

  const load = useCallback(async () => {
    setDocs(await getSnsRecordDocuments(rec.rid));
  }, [rec.rid]);

  useEffect(() => {
    let live = true;
    void getSnsRecordDocuments(rec.rid).then((rows) => {
      if (live) setDocs(rows);
    });
    return () => {
      live = false;
    };
  }, [rec.rid]);

  const inScope = app.canActOn(rec.countryCode);
  const mayAttach = app.viewer.isAdmin || (inScope && app.can.act);
  // A published record's evidence is part of the audit trail — the server
  // refuses to remove it from anyone but an admin, so do not offer the button.
  const published = rec.base === 'Active' || rec.base === 'Extended';
  const mayDelete = (d: SnsDocument) =>
    app.viewer.isAdmin ||
    (!published && d.uploadedByEmail.toLowerCase() === app.viewer.email.toLowerCase());

  const onFile = async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_BYTES) {
      setError(
        `That file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Attachments are limited to 1 MB.`,
      );
      return;
    }
    setError(null);
    setBusy(true);
    const form = new FormData();
    form.set('rid', String(rec.rid));
    form.set('kind', kind);
    form.set('file', file);
    const res = await uploadSnsRecordDocument(form);
    if (!res.success) setError(res.error ?? 'Could not attach the file.');
    else await load();
    setBusy(false);
  };

  const onDelete = async (id: number) => {
    setError(null);
    setBusy(true);
    const res = await deleteSnsRecordDocument(id);
    if (!res.success) setError(res.error ?? 'Could not remove the attachment.');
    else await load();
    setBusy(false);
  };

  return (
    <div className={CARD}>
      <div className={CARD_HEAD}>Attachments</div>

      {docs === null ? (
        <div className="py-6 text-center text-[12px] text-slate-400">Loading…</div>
      ) : (
        <>
          {docs.length === 0 && (
            <p className="px-4 py-5 text-[12.5px] leading-relaxed text-slate-500">
              Nothing attached yet. Evidence is what a validator reads before signing this record
              off — the contract clause for a single-source case, the OEM letter or market check for
              a sole-source one.
            </p>
          )}

          {docs.map((d) => (
            <div
              key={d.id}
              className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
            >
              <span className="flex h-9 w-8 shrink-0 items-center justify-center rounded bg-[#307c4c] text-[8px] font-bold text-white">
                DOC
              </span>
              <div className="min-w-0 flex-1">
                <p className="break-words text-[12.5px] font-bold text-slate-800">{d.name}</p>
                <p className="mt-0.5 text-[11px] text-slate-400">
                  {KIND_LABEL[d.kind]} · {sizeLabel(d.fileSize)} · {d.uploadedByName}
                  {d.uploadedAt ? ` · ${dateLabel(d.uploadedAt)}` : ''}
                </p>
              </div>
              {/* A plain link, not fetch: the route answers with its own
                  content type and disposition, so the browser saves it. */}
              <a
                href={`/api/sns-registry/documents/${d.id}`}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11.5px] font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#307c4c]/30 hover:text-[#307c4c]"
              >
                Download
              </a>
              {mayDelete(d) && (
                <button
                  type="button"
                  onClick={() => onDelete(d.id)}
                  disabled={busy}
                  className="shrink-0 text-[11.5px] font-semibold text-red-600 underline underline-offset-2 hover:no-underline disabled:opacity-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}

          {mayAttach && (
            <div className="border-t border-slate-200 bg-slate-50/70 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SnsDocumentKind)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12px] outline-none transition-colors focus:border-[#307c4c]"
                >
                  <option value="evidence">Evidence</option>
                  <option value="review">Review document</option>
                </select>
                <label
                  className={`cursor-pointer rounded-lg bg-gradient-to-r from-[#307c4c] to-[#2b6f44] px-3 py-1.5 text-[12px] font-semibold text-white shadow-sm shadow-[#307c4c]/30 transition-opacity hover:opacity-90 ${
                    busy ? 'pointer-events-none opacity-50' : ''
                  }`}
                >
                  <span>{busy ? 'Working…' : 'Attach a file'}</span>
                  <input
                    type="file"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => {
                      void onFile(e.target.files?.[0] ?? null);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
                PDF, DOCX, XLSX or MSG, up to 1 MB. Review documents are the ones a periodic review
                asks for, and are listed by name in the expiry reminder emails.
              </p>
            </div>
          )}

          {error && (
            <p className="border-t border-red-200 bg-red-50 px-4 py-2.5 text-[12px] text-red-700">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}
