'use client';

import { useState } from 'react';
import type { ScreenProps } from '../../types';

const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Accepting a vendor's statement.
 *
 * The prototype's "Simulate File Upload" was a 1.8-second timer against no file at all, followed
 * by an invoice count from `Math.random()`. Both are gone: the file is a real one chosen here and
 * posted to `acceptSoaSubmission`, which checks its leading bytes against its claimed type and
 * stores it; the invoice count is typed in by the champion who is looking at the statement, since
 * nothing in this application reads a PDF.
 */
export default function UploadModal({ vm }: ScreenProps) {
  const [file, setFile] = useState<File | null>(null);
  const [invoiceCount, setInvoiceCount] = useState('');
  const [error, setError] = useState<string | null>(null);

  const tooBig = !!file && file.size > MAX_BYTES;
  const count = Number(invoiceCount);
  const countValid = invoiceCount.trim() !== '' && Number.isInteger(count) && count >= 0;
  const canSubmit = !!file && !tooBig && countValid && !vm.busy;

  function submit() {
    if (!file) {
      setError('Choose the statement file first.');
      return;
    }
    if (tooBig) {
      setError('That file is larger than 10 MB.');
      return;
    }
    if (!countValid) {
      setError('Enter the number of invoices the statement lists.');
      return;
    }
    setError(null);
    vm.onAcceptSOA(file, count);
  }

  return (
    <>
      <div className="bg-sns-green px-5 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-[14px]">Accept SOA — {vm.modalVendorName}</div>
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

        <div className="border-2 border-dashed border-sns-line rounded-lg p-5 text-center bg-[#FAFAFA] mb-3.5">
          <div className="text-[28px] mb-2">📄</div>
          <div className="text-[13px] font-bold mb-1">Vendor SOA file</div>
          <div className="text-[11px] text-sns-grey mb-3">
            Excel (.xlsx) or signed PDF · Max 10MB
          </div>
          <label htmlFor="soa-file" className="sr-only">
            Statement file
          </label>
          <input
            id="soa-file"
            type="file"
            accept=".pdf,.xlsx,.xls,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setError(null);
            }}
            className="mx-auto block w-full text-[11px] text-sns-grey file:mr-3 file:rounded-md file:border-0 file:bg-sns-green file:px-4 file:py-2 file:text-[12px] file:font-bold file:text-white"
          />
          {file && (
            <div className="mt-2.5 text-[11px] text-sns-ink">
              {file.name} · {(file.size / 1024).toFixed(0)} KB
            </div>
          )}
        </div>

        <div className="mb-3.5">
          <label
            htmlFor="soa-invoice-count"
            className="mb-1 block text-[11px] font-bold text-sns-ink"
          >
            Invoices listed on the statement
          </label>
          <input
            id="soa-invoice-count"
            type="number"
            min={0}
            step={1}
            inputMode="numeric"
            value={invoiceCount}
            onChange={(e) => {
              setInvoiceCount(e.target.value);
              setError(null);
            }}
            className="w-[140px] rounded-md border border-sns-line bg-white px-2.5 py-2 text-[12px] text-sns-ink focus:border-sns-green focus:outline-none"
          />
          <div className="mt-1 text-[11px] text-sns-grey leading-[1.4]">
            Counted by the person reviewing the statement. Nothing in this tool parses the file, so
            this figure is recorded as a human count rather than a detection.
          </div>
        </div>

        {(error || tooBig) && (
          <div className="mb-3 rounded-md bg-[#FFEBEE] px-3 py-2 text-[11px] font-bold text-[#B71C1C]">
            {tooBig ? 'That file is larger than 10 MB.' : error}
          </div>
        )}

        <div className="text-[11px] text-sns-grey leading-[1.4] mb-3.5">
          The file is checked against its declared type and stored in the database, and is served
          only through an authenticated route — a statement lists a vendor&apos;s invoice numbers
          and balances.
        </div>

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
            disabled={!canSubmit}
            className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
          >
            {vm.busy ? 'Storing…' : 'Accept & Store SOA →'}
          </button>
        </div>
      </div>
    </>
  );
}
