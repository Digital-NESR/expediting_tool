'use client';

import { useCallback, useRef, useState } from 'react';
import type { ScreenProps } from '../../types';

/**
 * Accepting a vendor's statement on their behalf.
 *
 * The same act as the supplier's own upload, done by the champion a supplier replied to with the
 * file attached, so it behaves the same way: the same drop zone, the same file test, and the same
 * answer afterwards saying how many invoice lines were read.
 *
 * It used to ask the champion to count the invoices and type the number in, explaining that
 * nothing in the tool parsed the file. That stopped being true when the parser landed. The typed
 * figure was posted and never read: `storeStatement` had already counted the rows, and the number
 * on the vendor's row came from the file while the box asked somebody to count by eye. It is gone.
 *
 * It also offered `.pdf` and `.csv`. `storeStatement` refuses both, so choosing one meant filling
 * the form, waiting for the upload, and being told it was the wrong kind of file.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const CORRESPONDENCE = /\.(eml|msg)$/i;
const ACCEPTED = /\.(xlsx|xlsm|xls|eml|msg)$/i;

/* Saving a mail out of Outlook is not something most people have had reason to do, and the
   alternative is a champion pasting the supplier's figures in by hand. */
const OUTLOOK_STEPS = [
  'Open the supplier’s reply in Outlook, in its own window rather than the reading pane.',
  'File, then Save As.',
  'Set "Save as type" to Outlook Message Format (*.msg), or HTML if you want it readable anywhere.',
  'Save it somewhere you can find, then drag it onto this box.',
];

export default function UploadModal({ vm }: ScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const isCorrespondence = !!file && CORRESPONDENCE.test(file.name);

  /** Shared by the picker and the drop zone, so a dropped file is judged exactly like a chosen one. */
  const accept = useCallback((chosen: File | null) => {
    if (!chosen) return;
    if (!ACCEPTED.test(chosen.name)) {
      setFile(null);
      return setError(
        'Upload either the Excel template the supplier filled in, or their reply saved as a .msg or .eml file. A PDF is neither.',
      );
    }
    if (chosen.size > MAX_BYTES) {
      setFile(null);
      return setError('That file is larger than 10 MB.');
    }
    setError(null);
    setFile(chosen);
  }, []);

  function submit() {
    if (!file) return setError('Choose the statement file first.');
    setError(null);
    vm.onAcceptSOA(file);
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

        {/* The file usually arrives as a reply to the request, so dragging it straight out of the
            mail client is one step where saving it and finding it again is three. */}
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
            accept(e.dataTransfer.files?.[0] ?? null);
          }}
          className={`rounded-lg border-2 border-dashed p-5 text-center mb-3.5 transition-colors ${
            dragging ? 'border-sns-green bg-sns-green-wash' : 'border-sns-line bg-[#FAFAFA]'
          }`}
        >
          {file ? (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[12px]">
              <span className="font-bold text-sns-ink">{file.name}</span>
              <span className="text-[11px] text-sns-grey">
                {(file.size / 1024).toFixed(0)} KB
              </span>
              <button
                type="button"
                onClick={() => {
                  setFile(null);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="text-[11px] font-bold text-sns-grey underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <div className="text-[13px] font-bold mb-1">Drag the supplier&apos;s reply here</div>
              <div className="text-[11px] text-sns-grey mb-2">
                The filled-in Excel template, or their email saved as .msg or .eml · Max 10 MB
              </div>
              <label
                htmlFor="soa-file"
                className="cursor-pointer text-[12px] font-bold text-sns-green underline"
              >
                or choose a file
              </label>
            </>
          )}
          {/* A real input, kept for the keyboard and for screen readers. */}
          <input
            id="soa-file"
            ref={fileRef}
            type="file"
            accept=".xlsx,.xlsm,.xls,.eml,.msg"
            className="sr-only"
            onChange={(e) => accept(e.target.files?.[0] ?? null)}
          />
        </div>

        {error && (
          <div className="mb-3 rounded-md bg-[#FFEBEE] px-3 py-2 text-[11px] font-bold text-[#B71C1C]">
            {error}
          </div>
        )}

        {/* Which of the two this is, said before it is uploaded rather than discovered after. */}
        <div
          className={`rounded-md px-3 py-2 text-[11px] leading-[1.45] mb-3.5 ${
            isCorrespondence ? 'bg-[#FFF8E1] text-[#8A4B00]' : 'bg-[#F5F5F5] text-sns-grey'
          }`}
        >
          {isCorrespondence ? (
            <>
              <strong>This will be filed as correspondence.</strong> Nothing in an email is read
              into invoice lines, so the vendor counts towards coverage and the consolidated
              workbook carries one line telling AP to refer to this attachment. Upload the filled-in
              template instead if you have it.
            </>
          ) : (
            <>
              The invoice rows are read from the workbook and shown for review on the vendor&apos;s
              row. The file is checked against its declared type, stored in the database, and served
              only through an authenticated route, a statement lists a vendor&apos;s invoice numbers
              and balances.
            </>
          )}
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
            Dragging the mail straight from the message list onto this box works too, and saves the
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
            disabled={!file || vm.busy}
            className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
          >
            {vm.busy ? 'Reading and storing' : 'Accept & Store SOA'}
          </button>
        </div>
      </div>
    </>
  );
}
