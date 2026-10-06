'use client';

import { useCallback, useId, useRef, useState } from 'react';
import type { ScreenProps } from '../../types';

/**
 * Accepting a vendor's statement on their behalf.
 *
 * Two boxes rather than one, because a champion usually holds two things: the supplier's reply and
 * the spreadsheet attached to it. One box took whichever was dropped on it and, worse, filing the
 * second retired the first — the two pieces of evidence for a single answer could never be held at
 * once. Each box now takes its own kind and each supersedes only its own kind.
 *
 * Either one on its own is enough. A supplier who only ever sent a spreadsheet, and one who wrote
 * the figures in the body of a mail, are both ordinary, and demanding the pair would block the
 * champion over evidence that does not exist.
 *
 * It used to ask the champion to count the invoices and type the number in, explaining that
 * nothing in the tool parsed the file. That stopped being true when the parser landed: the typed
 * figure was posted and never read, while `storeStatement` had already counted the rows. It is
 * gone. It also offered `.pdf` and `.csv`, which `storeStatement` refuses, so choosing one meant
 * filling the form, waiting for the upload, and being told it was the wrong kind of file.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const WORKBOOK = /\.(xlsx|xlsm|xls)$/i;
const CORRESPONDENCE = /\.(eml|msg)$/i;

/* Saving a mail out of Outlook is not something most people have had reason to do, and the
   alternative is a champion pasting the supplier's figures in by hand. */
const OUTLOOK_STEPS = [
  'Open the supplier’s reply in Outlook, in its own window rather than the reading pane.',
  'File, then Save As.',
  'Set "Save as type" to Outlook Message Format (*.msg), or HTML if you want it readable anywhere.',
  'Save it somewhere you can find, then drag it onto this box.',
];

/** One labelled drop zone. Both boxes behave identically; only what they accept differs. */
function DropZone({
  label,
  hint,
  accepted,
  acceptAttr,
  file,
  onFile,
  onError,
}: {
  label: string;
  hint: string;
  accepted: RegExp;
  acceptAttr: string;
  file: File | null;
  onFile: (file: File | null) => void;
  onError: (message: string) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  /* Shared by the picker and the drop zone, so a dropped file is judged exactly like a chosen one,
     and judged by THIS box's rule: dropping a spreadsheet on the email box is a mistake worth
     naming rather than quietly filing under the wrong kind. */
  const take = useCallback(
    (chosen: File | null) => {
      if (!chosen) return;
      if (!accepted.test(chosen.name)) {
        return onError(`${chosen.name} does not belong in "${label}". ${hint}`);
      }
      if (chosen.size > MAX_BYTES) return onError('That file is larger than 10 MB.');
      onFile(chosen);
    },
    [accepted, hint, label, onError, onFile],
  );

  return (
    <div className="mb-3">
      <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-sns-grey">
        {label} <span className="font-normal normal-case">(optional)</span>
      </div>
      <div
        onDragEnter={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragOver={(e) => {
          // Without this the browser navigates away to the dropped file.
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          // Crossing onto a child fires leave on the parent; only a real exit counts.
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          take(e.dataTransfer.files?.[0] ?? null);
        }}
        className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
          dragging
            ? 'border-sns-green bg-sns-green-wash'
            : file
              ? 'border-sns-green/40 bg-sns-green-wash/40'
              : 'border-sns-line bg-[#FAFAFA]'
        }`}
      >
        {file ? (
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px]">
            <span className="font-bold text-sns-ink">{file.name}</span>
            <span className="text-[11px] text-sns-grey">{(file.size / 1024).toFixed(0)} KB</span>
            <button
              type="button"
              onClick={() => {
                onFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="text-[11px] font-bold text-sns-grey underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <>
            <div className="mb-1 text-[11px] text-sns-grey">{hint}</div>
            <label
              htmlFor={inputId}
              className="cursor-pointer text-[12px] font-bold text-sns-green underline"
            >
              Drag it here, or choose a file
            </label>
          </>
        )}
        {/* A real input, kept for the keyboard and for screen readers. */}
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          className="sr-only"
          onChange={(e) => take(e.target.files?.[0] ?? null)}
        />
      </div>
    </div>
  );
}

export default function UploadModal({ vm }: ScreenProps) {
  const [workbook, setWorkbook] = useState<File | null>(null);
  const [email, setEmail] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onError = useCallback((message: string) => setError(message), []);
  const takeWorkbook = useCallback((f: File | null) => {
    setError(null);
    setWorkbook(f);
  }, []);
  const takeEmail = useCallback((f: File | null) => {
    setError(null);
    setEmail(f);
  }, []);

  function submit() {
    if (!workbook && !email) {
      return setError('Add the supplier’s spreadsheet, their email, or both.');
    }
    setError(null);
    vm.onAcceptSOA({ workbook, email });
  }

  return (
    <>
      <div className="bg-sns-green px-5 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-[14px]">Accept SOA, {vm.modalVendorName}</div>
        <button
          type="button"
          onClick={vm.onCloseModal}
          aria-label="Close"
          className="text-white cursor-pointer text-[18px] opacity-70"
        >
          ✕
        </button>
      </div>
      <div className="p-5">
        <div className="bg-[#F5F5F5] rounded-[7px] px-3.5 py-2.5 mb-3.5 text-[12px] text-sns-grey">
          <div className="font-bold text-sns-ink mb-0.5">{vm.modalVendorName}</div>
          <div>
            Vendor No: {vm.modalVendorNo} · PO Amount: {vm.modalVendorAmt} ·{' '}
            {vm.modalVendorCurrency}
          </div>
        </div>

        <DropZone
          label="Statement spreadsheet"
          hint="The filled-in Excel template · .xlsx, .xlsm or .xls · Max 10 MB"
          accepted={WORKBOOK}
          acceptAttr=".xlsx,.xlsm,.xls"
          file={workbook}
          onFile={takeWorkbook}
          onError={onError}
        />

        <DropZone
          label="Supplier’s email"
          hint="Their reply saved out of Outlook · .msg or .eml · Max 10 MB"
          accepted={CORRESPONDENCE}
          acceptAttr=".eml,.msg"
          file={email}
          onFile={takeEmail}
          onError={onError}
        />

        {error && (
          <div className="mb-3 rounded-md bg-[#FFEBEE] px-3 py-2 text-[11px] font-bold text-[#B71C1C]">
            {error}
          </div>
        )}

        {/* What each of the two will do, said before uploading rather than discovered after. */}
        <div className="mb-3.5 rounded-md bg-[#F5F5F5] px-3 py-2 text-[11px] leading-[1.45] text-sns-grey">
          {workbook ? (
            <>
              The invoice rows are read from the spreadsheet and shown for review on the
              vendor&apos;s row.{' '}
            </>
          ) : (
            <>
              <strong className="text-[#8A4B00]">
                No spreadsheet, so nothing is read into invoice lines.
              </strong>{' '}
              The vendor still counts towards coverage and the consolidated workbook carries one
              line pointing AP at the email.{' '}
            </>
          )}
          {email ? <>The email is filed as evidence beside it. </> : null}
          Files are checked against their declared type, stored in the database and served only
          through an authenticated route, because a statement lists a vendor&apos;s invoice numbers
          and balances.
        </div>

        <details className="mb-3.5 rounded-md border border-sns-line px-3 py-2">
          <summary className="cursor-pointer text-[11px] font-bold text-sns-ink">
            How to save a reply out of Outlook
          </summary>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-[11px] leading-[1.45] text-sns-grey">
            {OUTLOOK_STEPS.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="mt-2 text-[11px] text-sns-grey leading-[1.45]">
            Dragging the mail straight from the message list onto the box works too, and saves the
            four steps. On Outlook for the web, use the three dots on the message and Download.
          </div>
        </details>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={vm.onCloseModal}
            className="flex-1 bg-[#F5F5F5] text-sns-grey border-none p-2.5 rounded-[7px] text-[12px] font-bold"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={(!workbook && !email) || vm.busy}
            className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
          >
            {vm.busy ? 'Reading and storing' : 'Accept & Store SOA'}
          </button>
        </div>
      </div>
    </>
  );
}
