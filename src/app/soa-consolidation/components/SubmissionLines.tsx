'use client';

import { useCallback, useState } from 'react';
import { getSoaSubmissions } from '@/app/actions/soa/submissions';
import type { SubmissionLineView, SubmissionView } from '@/lib/soa/submission-read';

/**
 * What the supplier actually sent, row by row.
 *
 * Before this, a statement was a file name and a download link: a champion could see that
 * something arrived but not what was in it, and the coverage figure rested on a count nobody could
 * check. These are the rows that count was computed from.
 *
 * Loaded on demand rather than with the country. A statement runs to a few dozen invoices and most
 * of them are never opened, so fetching every one alongside the vendor list would be a few
 * thousand rows shipped to render a download link.
 */

interface Props {
  entryId: string;
  vendorName: string;
}

function money(value: number | null, currency: string | null): string {
  if (value === null) return ', ';
  return `${currency ?? ''} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
}

export default function SubmissionLines({ entryId, vendorName }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionView[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getSoaSubmissions(Number(entryId));
    setLoading(false);
    if (!res.success || !res.data) return setError(res.error ?? 'Could not read that statement.');
    setSubmissions(res.data);
  }, [entryId]);

  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && submissions === null) await load();
  }

  return (
    <div className="mt-2.5">
      <button
        type="button"
        onClick={toggle}
        className="text-[11px] font-bold text-sns-green underline underline-offset-2"
      >
        {open ? 'Hide the invoices' : 'Review the invoices'}
      </button>

      {open && (
        <div className="mt-2">
          {loading && <div className="text-[11px] text-sns-grey">Reading the statement…</div>}
          {error && <div className="text-[11px] font-bold text-[#B71C1C]">{error}</div>}
          {submissions?.length === 0 && (
            <div className="text-[11px] text-sns-grey">Nothing has been uploaded for {vendorName}.</div>
          )}
          {submissions?.map((s) => <OneSubmission key={s.submissionId} submission={s} />)}
        </div>
      )}
    </div>
  );
}

function OneSubmission({ submission }: { submission: SubmissionView }) {
  const { lines, totalsByCurrency, linesNeedingReview, parseError } = submission;

  return (
    <div className={`rounded-lg border bg-white ${submission.superseded ? 'border-sns-line opacity-70' : 'border-sns-line'}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-b-[#F0F0F0] px-3 py-2">
        <div className="flex items-center gap-2">
          <div
            className={`text-[11.5px] font-bold ${submission.superseded ? 'text-sns-grey' : 'text-sns-ink'}`}
          >
            {submission.fileName}
          </div>
          {/* Its totals are still shown, so it has to say that none of them count. Two statements
              from one supplier with two different balances and no marking is how the wrong figure
              gets read off a screen. */}
          {submission.superseded && (
            <span className="rounded-full bg-[#F0F0F0] px-2 py-0.5 text-[10px] font-bold text-sns-grey">
              Replaced by a later statement
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {/* Never one figure across currencies: a statement can list dinars and dollars on
              consecutive rows, and a single total would look exactly like a number that means
              something. */}
          {totalsByCurrency.map((t) => (
            <span key={t.currency} className="rounded-full bg-[#ECEFEC] px-2.5 py-1 tabular-nums">
              <strong>{money(t.outstanding, t.currency)}</strong>
              <span className="ml-1.5 text-sns-grey">
                {t.lines} {t.lines === 1 ? 'line' : 'lines'}
              </span>
            </span>
          ))}
          {linesNeedingReview > 0 && (
            <span className="rounded-full bg-[#FFF4E5] px-2.5 py-1 font-bold text-[#8A4B00]">
              {linesNeedingReview} needing review
            </span>
          )}
        </div>
      </div>

      {parseError && (
        <div className="px-3 py-2 text-[11.5px] text-[#B71C1C]">
          This workbook could not be read: {parseError}
        </div>
      )}

      {lines.length > 0 && (
        <div className="max-h-[340px] overflow-auto">
          <table className="w-full border-collapse text-[11px]">
            <thead className="sticky top-0 bg-[#FAFBFA]">
              <tr className="text-left text-[10px] uppercase tracking-[0.4px] text-sns-grey">
                <th className="px-2 py-1.5 font-bold">#</th>
                <th className="px-2 py-1.5 font-bold">Invoice</th>
                <th className="px-2 py-1.5 font-bold">Date</th>
                <th className="px-2 py-1.5 font-bold">PO</th>
                <th className="px-2 py-1.5 font-bold">Entity</th>
                <th className="px-2 py-1.5 text-right font-bold">Total</th>
                <th className="px-2 py-1.5 text-right font-bold">Outstanding</th>
                <th className="px-2 py-1.5 text-right font-bold">Days</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => (
                <LineRow key={l.lineNo} line={l} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LineRow({ line }: { line: SubmissionLineView }) {
  const flagged = line.issues.length > 0;
  return (
    <>
      <tr
        className={`border-t border-t-[#F5F5F5] ${flagged ? 'bg-[#FFFBF5]' : ''}`}
        style={flagged ? { boxShadow: 'inset 3px 0 0 #E65100' } : undefined}
      >
        <td className="px-2 py-1.5 text-sns-grey tabular-nums">{line.lineNo}</td>
        <td className="px-2 py-1.5 font-medium">{line.invoiceNumber ?? '. '}</td>
        {/* The raw cell where it would not parse, so a reviewer sees what the supplier wrote
            rather than a blank that looks like nothing was entered. */}
        <td className="px-2 py-1.5">
          {line.invoiceDate ?? (
            <span className="text-[#B71C1C]">{line.invoiceDateRaw ?? ', '}</span>
          )}
        </td>
        <td className="px-2 py-1.5">{line.poNumber ?? ', '}</td>
        <td className="max-w-[190px] truncate px-2 py-1.5" title={line.legalEntity ?? ''}>
          {line.legalEntity ?? ', '}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">
          {money(line.totalAmount, line.currency)}
        </td>
        <td className="px-2 py-1.5 text-right font-bold tabular-nums">
          {money(line.outstandingAmount, line.currency)}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums">{line.outstandingDays ?? ', '}</td>
      </tr>
      {flagged && (
        <tr className="bg-[#FFFBF5]">
          <td />
          <td colSpan={7} className="px-2 pb-1.5 text-[10.5px] text-[#8A4B00]">
            {line.issues.join(' · ')}
          </td>
        </tr>
      )}
    </>
  );
}
