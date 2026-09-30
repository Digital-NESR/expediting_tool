'use client';

import { useState } from 'react';
import type { ResolveOutcome, ScreenProps } from '../../types';

/**
 * Closing a vendor that never sent a statement.
 *
 * One button used to do this, and it said "Mark Non-Responder" whatever the truth was. Two quite
 * different findings were being recorded as the same one: a supplier who never answered, whose
 * balance is therefore unconfirmed and is exactly the gap the exercise exists to find, and a
 * supplier the champion has established has nothing outstanding, which is a reconciliation that
 * came out at nil.
 *
 * Only the second counts towards coverage, and because it moves the figure the quarter is judged
 * on, it asks for the champion's reasoning first. That reason goes on the evidence trail in their
 * own words: an auditor asking on what basis a supplier was counted as reconciled has to get the
 * answer from the moment the call was made, not a reconstruction of it afterwards.
 */

const OPTIONS: {
  id: ResolveOutcome;
  title: string;
  detail: string;
  effect: string;
  tone: string;
}[] = [
  {
    id: 'nil_balance',
    title: 'No pending invoices',
    detail:
      'You have established this supplier has nothing outstanding, so there was never a statement for them to send.',
    effect: 'Counts towards coverage',
    tone: 'text-sns-green',
  },
  {
    id: 'non_responder',
    title: 'Non-responder',
    detail:
      'They were asked, they did not reply, and you cannot say whether anything is outstanding.',
    effect: 'Does not count towards coverage',
    tone: 'text-[#B71C1C]',
  },
];

export default function ResolveModal({ vm }: ScreenProps) {
  const [outcome, setOutcome] = useState<ResolveOutcome | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const needsNote = outcome === 'nil_balance';
  const noteOk = !needsNote || note.trim().length >= 3;

  function submit() {
    if (!outcome) return setError('Choose which of the two this is.');
    if (!noteOk) {
      return setError('Say how you established there are no pending invoices.');
    }
    setError(null);
    vm.onResolveVendor(outcome, note.trim());
  }

  return (
    <>
      <div className="bg-sns-green px-5 py-4 flex items-center justify-between">
        <div className="text-white font-bold text-[14px]">
          Close without a statement, {vm.modalVendorName}
        </div>
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

        <div className="space-y-2">
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => {
                setOutcome(o.id);
                setError(null);
              }}
              className={`w-full rounded-lg border-2 px-3.5 py-3 text-left transition-colors ${
                outcome === o.id
                  ? 'border-sns-green bg-sns-green-wash'
                  : 'border-sns-line bg-white hover:border-sns-green/40'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-bold text-sns-ink">{o.title}</span>
                {/* What it does to the number, said on the button that does it. */}
                <span className={`text-[10.5px] font-bold shrink-0 ${o.tone}`}>{o.effect}</span>
              </div>
              <div className="mt-1 text-[11.5px] leading-[1.45] text-sns-grey">{o.detail}</div>
            </button>
          ))}
        </div>

        {outcome && (
          <div className="mt-3.5">
            <label htmlFor="soa-resolve-note" className="mb-1 block text-[11px] font-bold text-sns-ink">
              {needsNote ? 'How did you establish this?' : 'Note (optional)'}
            </label>
            <textarea
              id="soa-resolve-note"
              rows={3}
              value={note}
              onChange={(e) => {
                setNote(e.target.value);
                setError(null);
              }}
              placeholder={
                needsNote
                  ? 'For example: confirmed with AP that the account was cleared in August, no open POs remain.'
                  : 'Anything worth recording alongside the correspondence.'
              }
              className="w-full rounded-md border border-sns-line bg-white px-2.5 py-2 text-[12px] text-sns-ink placeholder:text-sns-grey focus:border-sns-green focus:outline-none"
            />
            <div className="mt-1 text-[11px] text-sns-grey leading-[1.4]">
              {needsNote
                ? 'Required. This vendor will add its whole balance to the coverage figure, so the reason is kept with the decision and appears in the evidence pack.'
                : 'Optional. The requests and reminders already on file are the evidence that they were asked.'}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-3 rounded-md bg-[#FFEBEE] px-3 py-2 text-[11px] font-bold text-[#B71C1C]">
            {error}
          </div>
        )}

        <div className="flex gap-2 mt-4">
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
            disabled={!outcome || !noteOk || vm.busy}
            className="flex-[2] bg-sns-green text-white border-none p-2.5 rounded-[7px] text-[12px] font-bold disabled:opacity-50"
          >
            {vm.busy ? 'Recording' : 'Record this outcome'}
          </button>
        </div>
      </div>
    </>
  );
}
